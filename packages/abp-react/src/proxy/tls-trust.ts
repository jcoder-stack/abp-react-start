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

const MAX_DEPTH = 5;

function property(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function search(value: unknown, depth: number): string | null {
  if (depth > MAX_DEPTH || typeof value !== "object" || value === null) return null;
  const code = property(value, "code");
  if (typeof code === "string" && TRUST_FAILURE_CODES.has(code)) return code;
  // localhost 同时解析到 ::1 与 127.0.0.1 时 undici 会并发尝试，把各自的失败聚成 AggregateError。
  const aggregated = property(value, "errors");
  if (Array.isArray(aggregated)) {
    for (const inner of aggregated) {
      const found = search(inner, depth + 1);
      if (found !== null) return found;
    }
  }
  return search(property(value, "cause"), depth + 1);
}

/**
 * 若 error 源于 TLS 证书不受信，返回对应的 OpenSSL 错误码，否则返回 null。
 * 沿 `cause` 链与 AggregateError 的 `errors` 向下找——fetch 抛出的是包了一层的 `TypeError: fetch failed`。
 */
export function tlsTrustFailureCode(error: unknown): string | null {
  return search(error, 0);
}

/** 证书不受信时的处置说明；`code` 取自 {@link tlsTrustFailureCode}，`url` 为请求的上游地址。 */
export function tlsTrustFailureMessage(code: string, url: string): string {
  return (
    `abp proxy: upstream TLS certificate is not trusted (${code}) at ${new URL(url).origin}. ` +
    "Node verifies against its own CA list and ignores the OS keychain, so a self-signed dev " +
    "certificate the browser accepts still fails here. Start the server with " +
    "NODE_EXTRA_CA_CERTS=<pem path>; it is read at startup, so putting it in .env has no effect."
  );
}
