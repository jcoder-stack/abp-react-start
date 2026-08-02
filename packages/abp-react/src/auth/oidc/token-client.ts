import { z } from "zod";
import type { Logger } from "../../logger";
import { AuthError, type AuthErrorCode } from "../errors";
import type { FetchFn, TokenResult } from "../types";
import { discoverMetadata, type OidcMetadata } from "./metadata";

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.number().optional(),
});

export interface TokenGrant {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

export interface TokenClientConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  fetchFn?: FetchFn;
  timeoutMs?: number;
  logger?: Logger;
  /**
   * 把租户传播给 IdP 的方式：`headers` 随 token 请求发出，`query` 拼进 authorize URL。
   * 多租户是后端约定（ABP 用 `__tenant`）而非 OIDC 协议的一部分，故默认不传播，由宿主注入。
   */
  tenantPropagation?: (tenant: string) => {
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
}

export interface TokenClient {
  metadata(): Promise<OidcMetadata>;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenGrant>;
  passwordGrant(p: {
    userName: string;
    password: string;
    tenant?: string | null;
  }): Promise<TokenGrant>;
  refreshGrant(refreshToken: string): Promise<TokenGrant>;
  revoke(refreshToken: string): Promise<void>;
  authorizeUrl(p: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
    tenant?: string | null;
  }): Promise<string>;
  endSessionUrl(p: { idToken?: string; postLogoutRedirectUri?: string }): Promise<string | null>;
}

/** 把 grant 包成 TokenResult；expiresAt 只在 IdP 返回 expires_in 时计算。 */
export function toTokenResult(grant: TokenGrant, nowMs: number): TokenResult {
  return {
    tokens: {
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      idToken: grant.idToken,
    },
    expiresAt: grant.expiresIn !== undefined ? nowMs + grant.expiresIn * 1000 : undefined,
  };
}

/** IdP token/authorize/end-session 端点的协议客户端；错误按调用语义归一为 AuthError。 */
export function createTokenClient(cfg: TokenClientConfig): TokenClient {
  const fetchFn = cfg.fetchFn ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 30_000;
  let metadataPromise: Promise<OidcMetadata> | undefined;

  const metadata = () => {
    metadataPromise ??= discoverMetadata(cfg.issuer, { fetchFn, timeoutMs }).catch((error) => {
      metadataPromise = undefined;
      throw error;
    });
    return metadataPromise;
  };

  async function postToken(
    form: Record<string, string>,
    errorOf: (status: number) => AuthErrorCode,
    headers: Record<string, string> = {},
  ): Promise<TokenGrant> {
    const grantType = form.grant_type;
    const md = await metadata();
    let res: Response;
    try {
      res = await fetchFn(md.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          ...headers,
        },
        body: new URLSearchParams({ client_id: cfg.clientId, ...form }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AuthError(errorOf(0), `token request (${grantType}) failed`, { cause: error });
    }
    cfg.logger?.debug("token endpoint responded", { grantType, status: res.status });
    if (!res.ok) {
      throw new AuthError(
        errorOf(res.status),
        `token request (${grantType}) returned ${res.status}`,
      );
    }
    try {
      const parsed = tokenResponseSchema.parse(await res.json());
      return {
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token,
        idToken: parsed.id_token,
        expiresIn: parsed.expires_in,
      };
    } catch (error) {
      throw new AuthError(errorOf(0), `token response (${grantType}) malformed`, { cause: error });
    }
  }

  const withSecret = (form: Record<string, string>) =>
    cfg.clientSecret === undefined ? form : { ...form, client_secret: cfg.clientSecret };

  const tenantParts = (tenant: string | null | undefined) =>
    tenant && cfg.tenantPropagation !== undefined ? cfg.tenantPropagation(tenant) : {};

  return {
    metadata,
    exchangeCode: (p) =>
      postToken(
        withSecret({
          grant_type: "authorization_code",
          code: p.code,
          code_verifier: p.codeVerifier,
          redirect_uri: p.redirectUri,
        }),
        () => "exchange_failed",
      ),
    passwordGrant: (p) =>
      postToken(
        withSecret({
          grant_type: "password",
          username: p.userName,
          password: p.password,
          ...(cfg.scope === undefined ? {} : { scope: cfg.scope }),
        }),
        (status) => (status === 400 ? "invalid_credentials" : "exchange_failed"),
        tenantParts(p.tenant).headers,
      ),
    refreshGrant: (refreshToken) =>
      postToken(
        withSecret({ grant_type: "refresh_token", refresh_token: refreshToken }),
        () => "refresh_failed",
      ),
    revoke: async (refreshToken) => {
      const md = await metadata();
      if (md.revocation_endpoint === undefined) return;
      await fetchFn(md.revocation_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(
          withSecret({
            token: refreshToken,
            token_type_hint: "refresh_token",
            client_id: cfg.clientId,
          }),
        ).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    },
    authorizeUrl: async (p) => {
      const md = await metadata();
      const url = new URL(md.authorization_endpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", cfg.clientId);
      url.searchParams.set("redirect_uri", p.redirectUri);
      url.searchParams.set("scope", cfg.scope ?? "openid profile");
      url.searchParams.set("state", p.state);
      url.searchParams.set("nonce", p.nonce);
      url.searchParams.set("code_challenge", p.codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      for (const [key, value] of Object.entries(tenantParts(p.tenant).query ?? {})) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    },
    endSessionUrl: async (p) => {
      const md = await metadata();
      if (md.end_session_endpoint === undefined) return null;
      const url = new URL(md.end_session_endpoint);
      if (p.idToken !== undefined) url.searchParams.set("id_token_hint", p.idToken);
      if (p.postLogoutRedirectUri !== undefined)
        url.searchParams.set("post_logout_redirect_uri", p.postLogoutRedirectUri);
      return url.toString();
    },
  };
}
