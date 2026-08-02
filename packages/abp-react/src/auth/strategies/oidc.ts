import type { Logger } from "../../logger";
import { AuthError } from "../errors";
import { decodeIdTokenClaims } from "../oidc/claims";
import { type TokenClient, toTokenResult } from "../oidc/token-client";
import { generatePkce, generateRandomString } from "../pkce";
import type { AuthStrategy, BeginInput, CompleteInput, Handshake, TokenResult } from "../types";

export interface OidcStrategy extends AuthStrategy {
  begin(input: BeginInput): Promise<{ redirectUrl: string; handshake: Handshake }>;
  logoutUrl(p: { idToken?: string; postLogoutRedirectUri?: string }): Promise<string | null>;
}

/** 重定向式 OIDC Authorization Code + PKCE 策略；state/nonce 校验与 code 交换全部内化。 */
export function oidcStrategy(cfg: {
  tokenClient: TokenClient;
  redirectUri: string;
  now?: () => number;
  logger?: Logger;
  random?: () => string;
  pkce?: () => Promise<{ verifier: string; challenge: string }>;
  /** 握手密文在服务端可用的最长寿命（默认 600 秒）；超龄的 callback 一律拒绝。 */
  handshakeMaxAgeSeconds?: number;
}): OidcStrategy {
  const now = cfg.now ?? (() => Date.now());
  const random = cfg.random ?? generateRandomString;
  const pkce = cfg.pkce ?? generatePkce;
  const handshakeMaxAgeMs = (cfg.handshakeMaxAgeSeconds ?? 600) * 1000;
  return {
    name: "oidc",
    async begin(input: BeginInput) {
      const { verifier, challenge } = await pkce();
      const handshake: Handshake = {
        state: random(),
        nonce: random(),
        codeVerifier: verifier,
        returnUrl: input.returnUrl,
        issuedAt: now(),
      };
      const redirectUrl = await cfg.tokenClient.authorizeUrl({
        state: handshake.state,
        nonce: handshake.nonce,
        codeChallenge: challenge,
        redirectUri: cfg.redirectUri,
        tenant: input.tenant,
      });
      cfg.logger?.debug("oidc begin", {
        host: new URL(redirectUrl).host,
        stateBytes: handshake.state.length,
      });
      return { redirectUrl, handshake };
    },
    async complete(input: CompleteInput): Promise<TokenResult> {
      if (input.kind !== "callback") {
        throw new AuthError("invalid_input", "oidc strategy only completes callback inputs");
      }
      if (now() - input.handshake.issuedAt > handshakeMaxAgeMs) {
        throw new AuthError("handshake_expired", "handshake outlived its server-side lifetime");
      }
      const code = input.params.get("code");
      const state = input.params.get("state");
      if (state !== input.handshake.state) throw new AuthError("invalid_state");
      const providerError = input.params.get("error");
      if (providerError !== null) {
        // error_description 是 IdP 可控的自由文本，只进 debug 日志，不进错误消息（防开放注入）。
        cfg.logger?.debug("oidc provider error", {
          error: providerError,
          description: input.params.get("error_description") ?? undefined,
        });
        throw new AuthError("provider_denied", `provider returned error: ${providerError}`);
      }
      if (code === null) throw new AuthError("exchange_failed", "callback carried no code");
      const grant = await cfg.tokenClient.exchangeCode({
        code,
        codeVerifier: input.handshake.codeVerifier,
        redirectUri: cfg.redirectUri,
      });
      if (grant.idToken !== undefined) {
        if (decodeIdTokenClaims(grant.idToken).nonce !== input.handshake.nonce) {
          throw new AuthError("invalid_nonce");
        }
      }
      cfg.logger?.debug("oidc complete", { hasRefreshToken: grant.refreshToken !== undefined });
      return toTokenResult(grant, now());
    },
    logoutUrl: (p) => cfg.tokenClient.endSessionUrl(p),
  };
}
