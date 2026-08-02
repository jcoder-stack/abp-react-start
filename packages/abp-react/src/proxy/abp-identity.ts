import type { AuthSession, Identity, IdentityResolver } from "../auth";
import { type ApplicationConfiguration, parseApplicationConfiguration, toHttpError } from "../core";
import type { Logger } from "../logger";
import { type AbpCallRuntime, callAbpWithSession } from "./abp-call";

const APP_CONFIG_PATH = "/api/abp/application-configuration";

/**
 * 从 app-config 派生可注水的身份视图；token 不经过这里。
 * `isAuthenticated` 却无 `id` 属上游 shape drift：记 warn 并按匿名处理，不产出空 id 身份。
 */
export function deriveIdentity(
  config: ApplicationConfiguration,
  opts: { logger?: Logger } = {},
): Identity {
  const user = config.currentUser;
  // 空字符串 id 会让下游把所有 drift 用户聚合成同一个「空用户」，缓存键、审计、
  // 权限判定全部错位。降级为匿名是 fail-closed 的那一侧，且比抛错白屏更可运维。
  const id = user.isAuthenticated ? (user.id ?? null) : null;
  if (user.isAuthenticated && id === null) {
    opts.logger?.warn("application-configuration reported an authenticated user without an id", {
      userName: user.userName ?? undefined,
    });
  }
  return {
    isAuthenticated: id !== null,
    user:
      id === null
        ? null
        : {
            id,
            userName: user.userName ?? "",
            email: user.email ?? undefined,
            roles: user.roles,
          },
    grantedPolicies: config.auth.grantedPolicies,
    tenant:
      config.currentTenant.id === null
        ? null
        : { id: config.currentTenant.id, name: config.currentTenant.name },
  };
}

export interface AppState {
  config: ApplicationConfiguration;
  identity: Identity;
  setCookies: string[];
}

/** 一次 application-configuration 取数同时喂 config 与 identity；4xx/5xx 抛带 status 的 HttpError。 */
export async function loadAppState(
  rt: AbpCallRuntime,
  session: AuthSession | null,
  cookieHeader: string | null,
): Promise<AppState> {
  const res = await callAbpWithSession(rt, session, cookieHeader, {
    path: APP_CONFIG_PATH,
    method: "GET",
  });
  if (res.status >= 400) {
    let payload: unknown;
    if (typeof res.body === "string") {
      try {
        payload = JSON.parse(res.body);
      } catch {
        payload = res.body;
      }
    }
    throw toHttpError(res.status, payload);
  }
  // 200 + HTML 错误页（网关兜底页等）不能抛裸 SyntaxError，要带 status 与日志上下文。
  let payload: unknown;
  try {
    if (typeof res.body !== "string")
      throw new Error("non-text application-configuration response");
    payload = JSON.parse(res.body);
  } catch (error) {
    rt.logger.warn("application-configuration returned non-JSON body", {
      status: res.status,
      error: String(error),
    });
    throw toHttpError(res.status, typeof res.body === "string" ? res.body : undefined);
  }
  const config = parseApplicationConfiguration(payload, {
    onError: (error) =>
      rt.logger.warn("application-configuration shape drift", { error: String(error) }),
  });
  return {
    config,
    identity: deriveIdentity(config, { logger: rt.logger }),
    setCookies: res.setCookies,
  };
}

/** IdentityResolver 的 ABP 实现；策略头来自会话与请求 cookie（匿名访客的 `__tenant` 选择由此生效）。 */
export function createAbpIdentityResolver(rt: () => AbpCallRuntime): IdentityResolver {
  return async (session, ctx) => (await loadAppState(rt(), session, ctx.cookieHeader)).identity;
}
