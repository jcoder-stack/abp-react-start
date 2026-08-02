import type { Logger } from "../logger";
import { type TokenGrant, toTokenResult } from "./oidc/token-client";
import type { AuthSession, SessionStore, TokenResult } from "./types";

/** cookieHeader（establish/refresh）供 store 清掉本次未覆写的旧分块；不传则退化为只多清一个尾块。 */
export interface SessionManager {
  establish(
    result: TokenResult,
    ctx?: { tenant?: string | null; culture?: string | null; cookieHeader?: string | null },
  ): Promise<string[]>;
  current(cookieHeader: string | null): Promise<AuthSession | null>;
  isExpired(session: AuthSession): boolean;
  refresh(
    session: AuthSession,
    cookieHeader?: string | null,
  ): Promise<{ session: AuthSession; setCookies: string[] } | null>;
  destroy(cookieHeader: string | null): Promise<string[]>;
}

/** 会话生命周期引擎：托管策略产出、按 skew 判过期、合并并发刷新、登出时撤销并清 cookie。 */
export function createSessionManager(deps: {
  store: SessionStore;
  refreshGrant: (refreshToken: string) => Promise<TokenGrant>;
  revoke?: (refreshToken: string) => Promise<void>;
  logger?: Logger;
  now?: () => number;
  skewSeconds?: number;
  coalesceTtlMs?: number;
  /** 登出时等待 IdP 撤销 refresh token 的上限（默认 2000ms）；超时只降级为 warn，不挡登出。 */
  revokeTimeoutMs?: number;
}): SessionManager {
  const now = deps.now ?? (() => Date.now());
  const skewMs = (deps.skewSeconds ?? 60) * 1000;
  const ttlMs = deps.coalesceTtlMs ?? 10_000;
  const revokeTimeoutMs = deps.revokeTimeoutMs ?? 2_000;
  // 同一 refresh token 的并发刷新共享一次网络调用，避免 rotating IdP 在一次 SSR 内作废彼此的 token。
  // 作用域仅限本进程：多实例部署或 serverless 冷启后各自持有独立的 inflight 表，跨实例的并发请求
  // 照样各刷各的；且不论是否合并，轮换窗口之后仍拿着旧 cookie 的标签页必然掉线。要覆盖这两种情况，
  // 得在 IdP 侧开 refresh token reuse grace period，或把 SessionStore 换成有状态实现。
  const inflight = new Map<string, { at: number; promise: Promise<TokenGrant> }>();

  const coalescedGrant = (refreshToken: string): Promise<TokenGrant> => {
    const at = now();
    for (const [key, entry] of inflight) {
      if (at - entry.at >= ttlMs) inflight.delete(key);
    }
    const hit = inflight.get(refreshToken);
    if (hit !== undefined) return hit.promise;
    const promise = deps.refreshGrant(refreshToken);
    inflight.set(refreshToken, { at, promise });
    promise.catch(() => inflight.delete(refreshToken));
    return promise;
  };

  // serverless 上响应一返回实例即冻结，fire-and-forget 的撤销可能根本没发出去；但 IdP 慢或挂了
  // 也不该把用户锁在登录态里，所以撤销带超时且失败只降级为日志。
  const revokeWithTimeout = async (
    revoke: (refreshToken: string) => Promise<void>,
    refreshToken: string,
  ): Promise<void> => {
    const revoking = revoke(refreshToken);
    // 超时后这个 promise 仍在飞，没有兜底 catch 会变成 unhandledRejection。
    revoking.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        revoking,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`revoke timed out after ${revokeTimeoutMs}ms`)),
            revokeTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      deps.logger?.warn("token revocation failed", { error: String(error) });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    establish: (result, ctx) =>
      deps.store.save(
        {
          tokens: result.tokens,
          expiresAt: result.expiresAt,
          tenant: ctx?.tenant,
          culture: ctx?.culture,
        },
        ctx?.cookieHeader,
      ),
    current: (cookieHeader) => deps.store.load(cookieHeader),
    isExpired: (session) => session.expiresAt !== undefined && now() >= session.expiresAt - skewMs,
    refresh: async (session, cookieHeader) => {
      const refreshToken = session.tokens.refreshToken;
      if (refreshToken === undefined) return null;
      try {
        const grant = await coalescedGrant(refreshToken);
        const result = toTokenResult(grant, now());
        const next: AuthSession = {
          tokens: {
            ...result.tokens,
            // IdP 未轮换时沿用旧 refresh token，否则会话将失去续期能力。
            refreshToken: result.tokens.refreshToken ?? refreshToken,
          },
          expiresAt: result.expiresAt,
          tenant: session.tenant,
          culture: session.culture,
        };
        const setCookies = await deps.store.save(next, cookieHeader);
        deps.logger?.debug("session refreshed", {
          rotated:
            result.tokens.refreshToken !== undefined && result.tokens.refreshToken !== refreshToken,
        });
        return { session: next, setCookies };
      } catch (error) {
        deps.logger?.warn("session refresh failed", { error: String(error) });
        return null;
      }
    },
    destroy: async (cookieHeader) => {
      const session = await deps.store.load(cookieHeader);
      const refreshToken = session?.tokens.refreshToken;
      if (refreshToken !== undefined && deps.revoke !== undefined) {
        await revokeWithTimeout(deps.revoke, refreshToken);
      }
      deps.logger?.debug("session destroyed", { hadSession: session !== null });
      return deps.store.clear(cookieHeader);
    },
  };
}
