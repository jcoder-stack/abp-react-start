import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";

// Node 只认自己内置的 CA 列表，不读系统钥匙串：`dotnet dev-certs https --trust` 装进钥匙串后
// 浏览器与 curl 都放行，服务端 fetch 依然拒绝。这些码表示「证书不可接受」，与网络抖动不同，
// 重试永远得到同一个结果，只会把真正的原因埋在几百毫秒退避后面。
const TRUST_FAILURE_CODES = new Set([
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

// 「后端根本不在那儿」类错误码：与请求内容无关。可能是瞬态（后端正在重启），保留重试，
// 但重试耗尽后的报错必须指向 AUTH_ABP_BASE_URL / 启动后端，而不是一句 fetch failed。
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

const MAX_DEPTH = 5;

function property(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function search(value: unknown, depth: number, codes: ReadonlySet<string>): string | null {
  if (depth > MAX_DEPTH || typeof value !== "object" || value === null) return null;
  const code = property(value, "code");
  if (typeof code === "string" && codes.has(code)) return code;
  // localhost 同时解析到 ::1 与 127.0.0.1 时 undici 会并发尝试，把各自的失败聚成 AggregateError。
  const aggregated = property(value, "errors");
  if (Array.isArray(aggregated)) {
    for (const inner of aggregated) {
      const found = search(inner, depth + 1, codes);
      if (found !== null) return found;
    }
  }
  return search(property(value, "cause"), depth + 1, codes);
}

/**
 * 若 error 源于 TLS 证书不受信，返回对应的 OpenSSL 错误码，否则返回 null。
 * 沿 `cause` 链与 AggregateError 的 `errors` 向下找——fetch 抛出的是包了一层的 `TypeError: fetch failed`。
 */
export function tlsTrustFailureCode(error: unknown): string | null {
  return search(error, 0, TRUST_FAILURE_CODES);
}

/** 若 error 表示上游不可达（拒连/解析失败/超时），返回错误码，否则返回 null。查找方式同上。 */
export function upstreamUnreachableCode(error: unknown): string | null {
  return search(error, 0, UNREACHABLE_CODES);
}

/** 上游不可达时的处置说明；`code` 取自 {@link upstreamUnreachableCode}，`url` 为请求的上游地址。 */
export function upstreamUnreachableMessage(code: string, url: string): string {
  return (
    `abp proxy: cannot reach the ABP backend (${code}) at ${new URL(url).origin}. ` +
    "The backend is not running, or AUTH_ABP_BASE_URL in .env points at the wrong place. " +
    "Start the backend (or fix the address) and reload."
  );
}

/** 证书不受信时的处置说明；`code` 取自 {@link tlsTrustFailureCode}，`url` 为请求的上游地址。 */
export function tlsTrustFailureMessage(code: string, url: string): string {
  return (
    `abp proxy: upstream TLS certificate is not trusted (${code}) at ${new URL(url).origin}. ` +
    "Node verifies against its own CA list and ignores the OS keychain, so a self-signed dev " +
    "certificate the browser accepts still fails here. Export the certificate and set " +
    "AUTH_EXTRA_CA_FILE=<pem path> in .env (Node >= 22.15), or start the server with " +
    "NODE_EXTRA_CA_CERTS=<pem path> — that one is read at startup, so .env cannot carry it."
  );
}

/** `~`/`~/...` 展开到 home；其余路径原样返回。 */
function expandHome(path: string): string {
  if (path !== "~" && !path.startsWith("~/")) return path;
  return join(homedir(), path.slice(2));
}

interface RuntimeCaApi {
  getCACertificates?: (kind: "default") => string[];
  setDefaultCACertificates?: (certs: readonly string[]) => void;
}

export type InstallExtraCaResult = "installed" | "already-installed" | "unsupported";

/**
 * 把一张 PEM 证书追加进进程默认 CA，让此后所有 TLS 连接（含全局 fetch）信任它。
 * 与 `NODE_EXTRA_CA_CERTS` 不同，这条路是运行时 API（Node >= 22.15），dotenv 读完 .env 再调也来得及。
 * 运行时没有该 API（旧 Node、Bun）时返回 "unsupported"，由调用方决定怎么提示；文件不可读则抛错。
 * @param caApi 测试注入口，默认 `node:tls`。
 */
export function installExtraCa(caFile: string, caApi: RuntimeCaApi = tls): InstallExtraCaResult {
  if (
    typeof caApi.getCACertificates !== "function" ||
    typeof caApi.setDefaultCACertificates !== "function"
  ) {
    return "unsupported";
  }
  const resolved = expandHome(caFile);
  let pem: string;
  try {
    pem = readFileSync(resolved, "utf8");
  } catch (error) {
    throw new Error(`extra CA file is not readable: ${resolved}`, { cause: error });
  }
  const current = caApi.getCACertificates("default");
  // 幂等：auth 运行时与 gen 可能各调一次，重复追加会让默认列表随进程寿命膨胀。
  if (current.includes(pem)) return "already-installed";
  caApi.setDefaultCACertificates([...current, pem]);
  return "installed";
}
