import type { Logger } from "../../logger";
import { AuthError } from "../errors";
import { type TokenClient, toTokenResult } from "../oidc/token-client";
import type { AuthStrategy, CompleteInput, TokenResult } from "../types";

/** password grant（ROPC）策略：自绘登录页一步换 token，不经重定向。 */
export function passwordStrategy(cfg: {
  tokenClient: TokenClient;
  now?: () => number;
  logger?: Logger;
}): AuthStrategy {
  const now = cfg.now ?? (() => Date.now());
  return {
    name: "password",
    async complete(input: CompleteInput): Promise<TokenResult> {
      if (input.kind !== "credentials") {
        throw new AuthError("invalid_input", "password strategy only completes credentials");
      }
      const grant = await cfg.tokenClient.passwordGrant({
        userName: input.userName,
        password: input.password,
        tenant: input.tenant,
      });
      cfg.logger?.debug("password attempt succeeded", {
        userName: `${input.userName[0] ?? ""}***`,
      });
      return toTokenResult(grant, now());
    },
  };
}
