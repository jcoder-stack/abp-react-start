import { z } from "zod";
import { AuthError } from "../errors";
import type { FetchFn } from "../types";

export const oidcMetadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  end_session_endpoint: z.string().optional(),
  revocation_endpoint: z.string().optional(),
});
export type OidcMetadata = z.infer<typeof oidcMetadataSchema>;

/** OIDC discovery；任何网络/状态/形状失败都归一为 AuthError("discovery_failed")。 */
export async function discoverMetadata(
  issuer: string,
  opts: { fetchFn?: FetchFn; timeoutMs?: number } = {},
): Promise<OidcMetadata> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
    if (!res.ok) throw new Error(`discovery returned ${res.status}`);
    const metadata = oidcMetadataSchema.parse(await res.json());
    // OIDC Discovery 要求响应 issuer 与请求 issuer 一致（IdP mix-up 防护）；只容忍尾斜杠差异。
    const normalize = (v: string) => v.replace(/\/$/, "");
    if (normalize(metadata.issuer) !== normalize(issuer)) {
      throw new Error(`issuer mismatch: expected ${issuer}, got ${metadata.issuer}`);
    }
    return metadata;
  } catch (error) {
    throw new AuthError("discovery_failed", `OIDC discovery failed for ${issuer}`, {
      cause: error,
    });
  }
}
