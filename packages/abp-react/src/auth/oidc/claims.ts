import { base64UrlToBytes } from "../base64url";

/** 解出 id_token 的 payload 段（不验签，签名验证属于 IdP↔BFF 的 TLS 信道 + code 交换信任）。 */
export function decodeIdTokenClaims(idToken: string): Record<string, unknown> {
  const payload = idToken.split(".")[1];
  if (payload === undefined) return {};
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  } catch {
    return {};
  }
}
