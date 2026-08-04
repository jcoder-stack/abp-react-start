// 证书信任类错误码（与 @jcoder-stack/abp-react/proxy 的 tls-trust 同一份清单）：换个报错方向。
export const TLS_TRUST_CODES: ReadonlySet<string> = new Set([
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

// 「后端根本不在那儿」类错误码：与 spec 内容无关，指路去 abp.api.config.ts / .env 或先把后端起起来。
export const UNREACHABLE_CODES: ReadonlySet<string> = new Set([
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
export function findErrorCode(error: unknown, depth = 0): string | null {
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
