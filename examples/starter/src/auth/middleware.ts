import { createMiddleware } from "@tanstack/react-start";
import { appendResponseHeader, getRequestHeader } from "@tanstack/react-start/server";
import { getAuthRuntime } from "./runtime";

/** 官方主推模式：每个受保护 server fn 经此拿 context.session；过期时在这里统一刷新并回写 cookie。 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const rt = getAuthRuntime();
  let cookieHeader = getRequestHeader("cookie") ?? null;
  let session = await rt.auth.session.current(cookieHeader);
  if (session !== null && rt.auth.session.isExpired(session)) {
    const fresh = await rt.auth.session.refresh(session, cookieHeader);
    if (fresh !== null) {
      session = fresh.session;
      appendResponseHeader("Set-Cookie", fresh.setCookies);
      // 下游若再刷新（代理 401 重放），要据此清掉这里刚写下的分块；只看原始请求会漏清，按名合并后留下残块。
      cookieHeader = withSetCookies(cookieHeader, fresh.setCookies);
    } else {
      // 刷新失败＝匿名化：不带着过期 token 去打后端，请求本身不炸。
      session = null;
    }
  }
  return next({ context: { session, cookieHeader } });
});

/** 把已写出的 Set-Cookie 叠到请求 cookie 上，得到浏览器收下这次响应后将持有的 cookie 头。 */
function withSetCookies(cookieHeader: string | null, setCookies: string[]): string | null {
  const jar = new Map<string, string>();
  for (const pair of cookieHeader?.split(";") ?? []) {
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  for (const line of setCookies) {
    const [pair = ""] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    if (/;\s*max-age=0\s*(;|$)/i.test(line)) jar.delete(name);
    else jar.set(name, pair.slice(eq + 1).trim());
  }
  return jar.size === 0 ? null : [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
