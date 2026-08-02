import { type Auth, type AuthSession, parseCookieHeader, parseCultureCookie } from "../auth";
import type { Logger } from "../logger";
import type { AbpProxy, AbpProxyRequest, AbpProxyResponse } from "./proxy";

/** 租户切换 cookie / 头名，与 ABP 后端约定共享。 */
export const TENANT_COOKIE = "__tenant";
/** ASP.NET Core 文化 cookie 名，与 ABP 后端约定共享。 */
export const CULTURE_COOKIE = ".AspNetCore.Culture";

/** abp-call/identity 只认代理、会话与日志三样；宿主的完整 runtime 结构上兼容此形状。 */
export interface AbpCallRuntime {
  proxy: AbpProxy;
  auth: Auth;
  logger: Logger;
}

/** ABP 策略头。租户：会话优先、cookie 兜底；文化：cookie 优先（显式切换胜过登录快照）。 */
export function buildPolicyHeaders(
  session: AuthSession | null,
  cookieHeader: string | null,
): Record<string, string> {
  const cookies = parseCookieHeader(cookieHeader);
  const headers: Record<string, string> = {};
  const tenant = session?.tenant ?? cookies[TENANT_COOKIE];
  if (tenant) headers.__tenant = tenant;
  const culture = parseCultureCookie(cookies[CULTURE_COOKIE]) ?? session?.culture;
  if (culture) headers["Accept-Language"] = culture;
  return headers;
}

/** 服务端派生的策略头名单；调用方对这些键的取值一律丢弃，不论本次是否派生出值。 */
const POLICY_HEADERS = new Set(["__tenant", "accept-language"]);

/** 经代理调 ABP：策略头 + 会话 + 401 刷新回调。策略头压过调用方 headers（防伪造租户/文化）；Set-Cookie 由调用方落响应。 */
export function callAbpWithSession(
  rt: AbpCallRuntime,
  session: AuthSession | null,
  cookieHeader: string | null,
  req: AbpProxyRequest,
): Promise<AbpProxyResponse> {
  const policy = buildPolicyHeaders(session, cookieHeader);
  // 按固定名单剔除、而非按「policy 里实际有值的键」：匿名且无租户 cookie 时 policy 为空，
  // 后者会把伪造的 __tenant 原样放行（它在 proxy 的转发白名单内）。大小写不敏感：
  // 对象合并按键区分大小写，小写键可绕过覆盖。
  const callerHeaders = Object.fromEntries(
    Object.entries(req.headers ?? {}).filter(([key]) => !POLICY_HEADERS.has(key.toLowerCase())),
  );
  return rt.proxy.send(
    { ...req, headers: { ...callerHeaders, ...policy } },
    {
      session,
      refresh: () =>
        session === null ? Promise.resolve(null) : rt.auth.session.refresh(session, cookieHeader),
    },
  );
}
