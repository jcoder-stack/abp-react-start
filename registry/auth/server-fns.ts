import {
  AuthError,
  type AuthErrorCode,
  parseCookieHeader,
  parseCultureCookie,
} from "@jcoder/abp-react/auth";
import {
  AbpProxyError,
  CULTURE_COOKIE,
  callAbpWithSession,
  loadAppState,
  TENANT_COOKIE,
} from "@jcoder/abp-react/proxy";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { authMiddleware } from "./middleware";
import { getAuthRuntime } from "./runtime";

/** SSR 一次取数喂两张嘴：config（AppConfigProvider）+ identity（SessionProvider）。 */
export const getAppStateFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rt = getAuthRuntime();
    const state = await loadAppState(rt, context.session, context.cookieHeader);
    if (state.setCookies.length > 0) setResponseHeader("Set-Cookie", state.setCookies);
    return { config: state.config, identity: state.identity };
  });

/** 轻量身份重取（useSession().reload 的服务侧一半）。 */
export const getIdentityFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rt = getAuthRuntime();
    const state = await loadAppState(rt, context.session, context.cookieHeader);
    if (state.setCookies.length > 0) setResponseHeader("Set-Cookie", state.setCookies);
    return state.identity;
  });

const passwordLoginSchema = z.object({
  userName: z.string().min(1),
  password: z.string().min(1),
});

/** password 策略登录；凭据错误是预期业务态 → 返回值而非 throw。成功后客户端 reload() 取新身份。 */
export const loginWithPasswordFn = createServerFn({ method: "POST" })
  .validator(passwordLoginSchema)
  .handler(async ({ data }) => {
    const rt = getAuthRuntime();
    const cookieHeader = getRequestHeader("cookie") ?? null;
    const cookies = parseCookieHeader(cookieHeader);
    try {
      const result = await rt.auth.strategy("password").complete({
        kind: "credentials",
        userName: data.userName,
        password: data.password,
        tenant: cookies[TENANT_COOKIE] ?? null,
      });
      const setCookies = await rt.auth.session.establish(result, {
        tenant: cookies[TENANT_COOKIE] ?? null,
        culture: parseCultureCookie(cookies[CULTURE_COOKIE]),
        cookieHeader,
      });
      setResponseHeader("Set-Cookie", setCookies);
      return { ok: true as const };
    } catch (error) {
      const code: AuthErrorCode = error instanceof AuthError ? error.code : "exchange_failed";
      rt.logger.debug("password login failed", { code });
      return { ok: false as const, error: code };
    }
  });

/** 本地登出（password 模式）；OIDC 全局登出走 /api/auth/logout 路由。 */
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const rt = getAuthRuntime();
  setResponseHeader(
    "Set-Cookie",
    await rt.auth.session.destroy(getRequestHeader("cookie") ?? null),
  );
  return { ok: true as const };
});

const abpRequestSchema = z.object({
  path: z.string(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

/** 业务 API 的唯一请求边界：orval mutator → 此 server fn → 代理网关。 */
export const abpRequestFn = createServerFn({ method: "POST" })
  .validator(abpRequestSchema)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const rt = getAuthRuntime();
    let res: Awaited<ReturnType<typeof callAbpWithSession>>;
    try {
      res = await callAbpWithSession(rt, context.session, context.cookieHeader, data);
    } catch (error) {
      // 失败也要把过程中刷新出的会话 cookie 落到响应，否则轮换型 IdP 下用户被静默登出。
      if (error instanceof AbpProxyError && error.setCookies.length > 0)
        setResponseHeader("Set-Cookie", error.setCookies);
      throw error;
    }
    if (res.setCookies.length > 0) setResponseHeader("Set-Cookie", res.setCookies);
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      body: typeof res.body === "string" ? res.body : undefined,
      bodyBase64: typeof res.body === "string" ? undefined : toBase64(res.body),
    };
  });

// server fn 边界只序列化 JSON，二进制体转 base64 过桥，abpFetch 端解码还原字节。
function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
