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

/** 每个 project 都会自己解析一遍 input：远端 spec 先落到临时文件，才不会一次 gen 里把同一份文档拉好几遍（两次之间后端有变更会让 types 与 zod schema 漂移）。返回本地路径与清理函数；本地 input 原样返回。 */
async function localizeSpec(input: string): Promise<{ target: string; cleanup: () => void }> {
  const keepRemote = { target: input, cleanup: () => {} };
  if (!isRemote(input)) return keepRemote;
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(
      `failed to fetch the OpenAPI document (${response.status} ${response.statusText}): ${input}`,
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
