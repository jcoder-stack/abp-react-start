import { bytesToBase64Url } from "./base64url";

/** CSPRNG 随机串（base64url）；用于 state/nonce/PKCE verifier。 */
export function generateRandomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** PKCE S256 对：verifier + BASE64URL(SHA-256(verifier))。 */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}
