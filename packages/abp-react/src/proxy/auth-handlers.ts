import {
  AuthError,
  clearCookie,
  formatCultureCookie,
  parseCookieHeader,
  parseCultureCookie,
  sanitizeReturnUrl,
  serializeCookie,
} from "../auth";
import { CULTURE_COOKIE, TENANT_COOKIE } from "./abp-call";
import { type AuthRuntime, cookieAttributesOf, SWITCH_COOKIE_MAX_AGE } from "./auth-runtime";

function originOf(value: string | null): string | null {
  if (value === null || value === "null") return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * 判定请求来自本站，用于给会改状态的 GET handler 挡 CSRF。
 * `Sec-Fetch-Site` 优先（`none` 是地址栏/书签直接导航）；老浏览器无此头时退回 Origin、再退回 Referer。
 */
function isSameSiteRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin" || fetchSite === "none";
  const selfOrigin = new URL(request.url).origin;
  const origin = originOf(request.headers.get("origin"));
  if (origin !== null) return origin === selfOrigin;
  const referer = originOf(request.headers.get("referer"));
  if (referer !== null) return referer === selfOrigin;
  // 三个头都没有：既可能是攻击，也可能是剥头的代理或合法直接导航。误伤登出/切租户比放行更糟，故放行。
  return true;
}

const CROSS_SITE_RESPONSE = () => new Response("cross-site request rejected", { status: 403 });

/** GET /api/auth/login：begin 策略握手，密封进短命 cookie，302 去 IdP。 */
export async function handleLogin(request: Request, rt: AuthRuntime): Promise<Response> {
  const url = new URL(request.url);
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const { redirectUrl, handshake } = await rt.oidc.begin({
    returnUrl: sanitizeReturnUrl(url.searchParams.get("returnUrl")),
    tenant: cookies[TENANT_COOKIE] ?? null,
  });
  const headers = new Headers({ Location: redirectUrl });
  headers.append(
    "Set-Cookie",
    serializeCookie(rt.cookies.login.name, await rt.handshakeCodec.seal(handshake), {
      ...cookieAttributesOf(rt.cookies.login),
      maxAge: rt.cookies.login.maxAge,
    }),
  );
  return new Response(null, { status: 302, headers });
}

function callbackFailure(rt: AuthRuntime, code: string): Response {
  const headers = new Headers({ Location: `/login?error=${code}` });
  headers.append(
    "Set-Cookie",
    clearCookie(rt.cookies.login.name, cookieAttributesOf(rt.cookies.login)),
  );
  return new Response(null, { status: 302, headers });
}

/** GET /api/auth/callback：complete 策略握手，建会话，302 回 returnUrl；失败 302 /login?error=。 */
export async function handleCallback(request: Request, rt: AuthRuntime): Promise<Response> {
  const url = new URL(request.url);
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const sealed = cookies[rt.cookies.login.name];
  const handshake = sealed === undefined ? null : await rt.handshakeCodec.open(sealed);
  if (handshake === null) return callbackFailure(rt, "session_open_failed");
  try {
    const result = await rt.oidc.complete({
      kind: "callback",
      params: url.searchParams,
      handshake,
    });
    const setCookies = await rt.auth.session.establish(result, {
      tenant: cookies[TENANT_COOKIE] ?? null,
      culture: parseCultureCookie(cookies[CULTURE_COOKIE]),
      cookieHeader: request.headers.get("cookie"),
    });
    const headers = new Headers({ Location: sanitizeReturnUrl(handshake.returnUrl) });
    for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
    headers.append(
      "Set-Cookie",
      clearCookie(rt.cookies.login.name, cookieAttributesOf(rt.cookies.login)),
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "exchange_failed";
    rt.logger.warn("login callback failed", { code });
    return callbackFailure(rt, code);
  }
}

/** GET /api/auth/logout：destroy 会话（内含撤销），302 去 IdP end-session（拿不到则回首页）。 */
export async function handleLogout(request: Request, rt: AuthRuntime): Promise<Response> {
  if (!isSameSiteRequest(request)) return CROSS_SITE_RESPONSE();
  const cookieHeader = request.headers.get("cookie");
  const session = await rt.auth.session.current(cookieHeader);
  let location = rt.postLogoutRedirectUri ?? "/";
  try {
    location =
      (await rt.oidc.logoutUrl({
        idToken: session?.tokens.idToken,
        postLogoutRedirectUri: rt.postLogoutRedirectUri,
      })) ?? location;
  } catch {
    // IdP 不可达时仍要能本地登出。
  }
  const headers = new Headers({ Location: location });
  for (const cookie of await rt.auth.session.destroy(cookieHeader)) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}

// 两者都会作为 HTTP 头（__tenant / Accept-Language）发往上游：含非 ASCII 或控制字符时
// Headers 构造抛错，会让该用户之后的每个请求都失败，且这两个 handler 是 GET、点一次链接即可触发。
const TENANT_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const CULTURE_PATTERN = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8}){0,4}$/;

/** GET /api/culture?culture=zh-Hans&returnUrl=/：落共享文化 cookie 并弹回。 */
export function handleSetCulture(request: Request): Response {
  if (!isSameSiteRequest(request)) return CROSS_SITE_RESPONSE();
  const url = new URL(request.url);
  const culture = url.searchParams.get("culture");
  if (!culture) return new Response("culture is required", { status: 400 });
  if (!CULTURE_PATTERN.test(culture)) {
    return new Response("culture is not a valid BCP-47 tag", { status: 400 });
  }
  const headers = new Headers({ Location: sanitizeReturnUrl(url.searchParams.get("returnUrl")) });
  headers.append(
    "Set-Cookie",
    serializeCookie(CULTURE_COOKIE, formatCultureCookie(culture), {
      httpOnly: false,
      maxAge: SWITCH_COOKIE_MAX_AGE,
    }),
  );
  return new Response(null, { status: 302, headers });
}

/** GET /api/tenant?tenant=t1&returnUrl=/：落租户 cookie（缺 tenant 则清除）并弹回。 */
export function handleSetTenant(request: Request): Response {
  if (!isSameSiteRequest(request)) return CROSS_SITE_RESPONSE();
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant");
  // 空值沿用「切回宿主」语义，只校验真正要落 cookie 的值。
  if (tenant !== null && tenant !== "" && !TENANT_PATTERN.test(tenant)) {
    return new Response("tenant is not a valid identifier", { status: 400 });
  }
  const headers = new Headers({ Location: sanitizeReturnUrl(url.searchParams.get("returnUrl")) });
  headers.append(
    "Set-Cookie",
    tenant
      ? serializeCookie(TENANT_COOKIE, tenant, { httpOnly: false, maxAge: SWITCH_COOKIE_MAX_AGE })
      : clearCookie(TENANT_COOKIE, { httpOnly: false }),
  );
  return new Response(null, { status: 302, headers });
}
