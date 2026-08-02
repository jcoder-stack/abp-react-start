import type { Logger } from "../logger";
import { createSessionManager, type SessionManager } from "./manager";
import type { TokenGrant } from "./oidc/token-client";
import type {
  AuthSession,
  AuthStrategy,
  Identity,
  IdentityContext,
  IdentityResolver,
  SessionStore,
} from "./types";

export interface Auth {
  strategy(name: string): AuthStrategy;
  session: SessionManager;
  /** 解析身份；`ctx.cookieHeader` 省略即按「无请求上下文」处理，匿名访客的租户选择将不可见。 */
  identity(session: AuthSession | null, ctx?: IdentityContext): Promise<Identity>;
}

/** 授权认证模块装配根：策略注册表 + 会话引擎 + 身份解析。 */
export function createAuth(opts: {
  strategies: AuthStrategy[];
  store: SessionStore;
  resolveIdentity: IdentityResolver;
  refreshGrant: (refreshToken: string) => Promise<TokenGrant>;
  revoke?: (refreshToken: string) => Promise<void>;
  logger?: Logger;
  now?: () => number;
  /** 登出时等待 IdP 撤销 refresh token 的上限（默认 2000ms）；超时只降级为 warn，不挡登出。 */
  revokeTimeoutMs?: number;
  /** 判过期时提前量（默认 60 秒）：让 token 在真正到期前就被刷新，避开时钟偏差与在途延迟。 */
  skewSeconds?: number;
  /** 并发刷新合并窗口（默认 10000ms）：同一 refresh token 在窗口内共享一次 IdP 调用。 */
  coalesceTtlMs?: number;
}): Auth {
  const strategies = new Map(opts.strategies.map((s) => [s.name, s]));
  const session = createSessionManager({
    store: opts.store,
    refreshGrant: opts.refreshGrant,
    revoke: opts.revoke,
    logger: opts.logger,
    now: opts.now,
    revokeTimeoutMs: opts.revokeTimeoutMs,
    skewSeconds: opts.skewSeconds,
    coalesceTtlMs: opts.coalesceTtlMs,
  });
  return {
    strategy: (name) => {
      const strategy = strategies.get(name);
      if (strategy === undefined) throw new Error(`unknown auth strategy: ${name}`);
      return strategy;
    },
    session,
    identity: async (session, ctx = { cookieHeader: null }) => {
      const startedAt = (opts.now ?? Date.now)();
      const identity = await opts.resolveIdentity(session, ctx);
      opts.logger?.debug("identity resolved", {
        isAuthenticated: identity.isAuthenticated,
        policies: Object.keys(identity.grantedPolicies).length,
        ms: (opts.now ?? Date.now)() - startedAt,
      });
      return identity;
    },
  };
}
