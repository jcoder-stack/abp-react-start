import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "orval";
import { type ApiTargetInput, loadApiConfig } from "./config";
import { installExtraCaFromEnv } from "./extra-ca";
import { createOrvalConfig } from "./orval-config";

const TEMPLATE_PATH = fileURLToPath(new URL("../templates/mutator.ts", import.meta.url));

function isRemote(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

function resolveInput(cwd: string, input: string): string {
  if (isRemote(input) || isAbsolute(input)) return input;
  return resolve(cwd, input);
}

/** 外部 `$ref` 是相对 spec 的 URL 解析的，落到本地临时文件就会把解析基准换掉，这种 spec 宁可多拉一次。 */
function hasExternalRefs(document: string): boolean {
  return /"\$ref"\s*:\s*"(?!#)/.test(document) || /\$ref\s*:\s*['"]?(?!#)/.test(document);
}

// 证书信任类错误码（与 @jcoder-stack/abp-react/proxy 的 tls-trust 同一份清单）：换个报错方向。
const TLS_TRUST_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

// 「后端根本不在那儿」类错误码：与 spec 内容无关，指路去 abp.api.config.ts 或先把后端起起来。
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

/** 沿 cause 链与 AggregateError.errors 找第一个错误码；fetch 抛的是包了一层的 `TypeError: fetch failed`。 */
function findErrorCode(error: unknown, depth = 0): string | null {
  if (depth > 5 || typeof error !== "object" || error === null) return null;
  const record = error as { code?: unknown; errors?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  if (Array.isArray(record.errors)) {
    for (const inner of record.errors) {
      const found = findErrorCode(inner, depth + 1);
      if (found !== null) return found;
    }
  }
  return findErrorCode(record.cause, depth + 1);
}

/** 把拉取 swagger 的网络失败翻译成可执行的下一步；认不出的错误原样保留在结尾。 */
export function describeSpecFetchError(error: unknown, input: string): string {
  const code = findErrorCode(error);
  if (code !== null && TLS_TRUST_CODES.has(code)) {
    return (
      `the ABP backend at ${input} uses a certificate this process does not trust (${code}). ` +
      "For a local self-signed dev certificate, export it and point AUTH_EXTRA_CA_FILE at it in .env:\n" +
      "  dotnet dev-certs https --export-path ~/.aspnet-dev.crt --format PEM\n" +
      "  AUTH_EXTRA_CA_FILE=~/.aspnet-dev.crt"
    );
  }
  if (code !== null && UNREACHABLE_CODES.has(code)) {
    return (
      `could not reach the ABP backend (${code}): ${input}. ` +
      "The backend is not running, or the input URL in abp.api.config.ts points at the wrong place. " +
      "Start the backend, or fix the input and rerun jc-abp gen."
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return `failed to fetch the OpenAPI document: ${input} (${message})`;
}

/** 每个 project 都会自己解析一遍 input：远端 spec 先落到临时文件，才不会一次 gen 里把同一份文档拉好几遍（两次之间后端有变更会让 types 与 zod schema 漂移）。返回本地路径与清理函数；本地 input 原样返回。 */
async function localizeSpec(input: string): Promise<{ target: string; cleanup: () => void }> {
  const keepRemote = { target: input, cleanup: () => {} };
  if (!isRemote(input)) return keepRemote;
  let response: Response;
  try {
    response = await fetch(input);
  } catch (error) {
    throw new Error(describeSpecFetchError(error, input), { cause: error });
  }
  if (!response.ok) {
    throw new Error(
      `failed to fetch the OpenAPI document (${response.status} ${response.statusText}): ${input}` +
        (response.status === 404
          ? " — the path is not a swagger document; ABP templates usually serve /swagger/v1/swagger.json"
          : ""),
    );
  }
  const document = await response.text();
  if (hasExternalRefs(document)) return keepRemote;
  const dir = mkdtempSync(join(tmpdir(), "jc-abp-spec-"));
  const yaml =
    /\.ya?ml$/i.test(new URL(input).pathname) ||
    /ya?ml/i.test(response.headers.get("content-type") ?? "");
  const target = join(dir, yaml ? "openapi.yaml" : "openapi.json");
  writeFileSync(target, document);
  return { target, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** What runGen produced for one target: its name (multi-target only), output dir, and whether the mutator template was (first-)written. */
export interface GenTargetResult {
  name?: string;
  outputDir: string;
  mutatorWritten: boolean;
}

/** What runGen did across all resolved targets. */
export interface GenResult {
  targets: GenTargetResult[];
}

/** jc-abp gen: resolve the target(s), and for each seed the mutator template once, run the orval preset, and verify endpoints were produced. */
export async function runGen(opts: {
  cwd: string;
  configPath?: string;
  overrides?: Partial<ApiTargetInput>;
}): Promise<GenResult> {
  // 在任何到后端的 fetch 之前装上 .env 里声明的额外 CA；自签证书的本地后端靠它免去启动时环境变量。
  if (installExtraCaFromEnv(opts.cwd) === "unsupported") {
    console.warn(
      "AUTH_EXTRA_CA_FILE is set but this runtime lacks tls.setDefaultCACertificates " +
        "(Node >= 22.15); run gen with NODE_EXTRA_CA_CERTS=<pem path> instead.",
    );
  }
  const targets = await loadApiConfig(opts);
  const results: GenTargetResult[] = [];
  for (const config of targets) {
    const outputDir = resolve(opts.cwd, config.output);
    mkdirSync(outputDir, { recursive: true });
    const mutatorPath = join(outputDir, "mutator.ts");
    let mutatorWritten = false;
    if (!existsSync(mutatorPath)) {
      copyFileSync(TEMPLATE_PATH, mutatorPath);
      mutatorWritten = true;
    }
    const spec = await localizeSpec(resolveInput(opts.cwd, config.input));
    try {
      const orvalConfig = createOrvalConfig({ input: spec.target, outputDir, zod: config.zod });
      // orval@7's programmatic generate() only accepts a single project's Options (or a config file
      // path) as its first argument, not the multi-project map createOrvalConfig produces, so each
      // project ("api", optionally "apiZod") is resolved and generated with its own call.
      const projects = await (typeof orvalConfig === "function" ? orvalConfig() : orvalConfig);
      for (const projectOptions of Object.values(projects)) {
        await generate(projectOptions, opts.cwd);
      }
    } finally {
      spec.cleanup();
    }
    const endpointsDir = join(outputDir, "endpoints");
    if (!existsSync(endpointsDir) || readdirSync(endpointsDir).length === 0) {
      throw new Error(
        `gen produced no endpoints in ${endpointsDir}; check the input spec (orval can exit 0 without generating from an invalid or empty swagger)`,
      );
    }
    results.push({ name: config.name, outputDir, mutatorWritten });
  }
  return { targets: results };
}
