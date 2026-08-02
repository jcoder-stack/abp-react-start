import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { getAuthRuntime } from "./runtime";

/** 官方主推模式：每个受保护 server fn 经此拿 context.session；过期时在这里统一刷新并回写 cookie。 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const rt = getAuthRuntime();
  const cookieHeader = getRequestHeader("cookie") ?? null;
  let session = await rt.auth.session.current(cookieHeader);
  if (session !== null && rt.auth.session.isExpired(session)) {
    const fresh = await rt.auth.session.refresh(session, cookieHeader);
    if (fresh !== null) {
      session = fresh.session;
      setResponseHeader("Set-Cookie", fresh.setCookies);
    } else {
      // 刷新失败＝匿名化：不带着过期 token 去打后端，请求本身不炸。
      session = null;
    }
  }
  return next({ context: { session, cookieHeader } });
});
