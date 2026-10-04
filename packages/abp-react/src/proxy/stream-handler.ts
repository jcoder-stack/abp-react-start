import type { AuthSession } from "../auth";
import { streamAbpWithSession } from "./abp-call";
import { CROSS_SITE_RESPONSE, isSameSiteRequest } from "./auth-handlers";
import type { AuthRuntime } from "./auth-runtime";
import { AbpProxyError } from "./proxy";

/** 默认挂载点，对应宿主的 `src/routes/api.stream.$.ts`。 */
export const ABP_STREAM_PREFIX = "/api/stream";

/** 浏览器请求头里只取内容协商这一项；其余（Cookie、Range 等）要么由服务端派生，要么白名单本就不放行。 */
const FORWARDED_REQUEST_HEADERS = ["accept"];

/** ABP 错误信封形状，好让客户端照常按 `AbpApiError.body.error` 解析。 */
function errorResponse(status: number, message: string, setCookies: string[]): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
  });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify({ error: { message } }), { status, headers });
}

/** 与 authMiddleware 同语义：过期先刷新，刷新失败按匿名走，请求本身不炸。 */
async function currentSession(
  rt: AuthRuntime,
  cookieHeader: string | null,
  setCookies: string[],
): Promise<AuthSession | null> {
  const session = await rt.auth.session.current(cookieHeader);
  if (session === null || !rt.auth.session.isExpired(session)) return session;
  const fresh = await rt.auth.session.refresh(session, cookieHeader);
  if (fresh === null) return null;
  setCookies.push(...fresh.setCookies);
  return fresh.session;
}

/**
 * GET `<prefix>/<ABP 路径>`：带当前会话请求 ABP，把响应正文原样流回浏览器，服务端不缓冲。
 *
 * - 只服务本站发起的读请求：宿主只挂 GET；跨站一律 403，免得 ABP 上任何带副作用的 GET 被第三方页面借刀。
 * - 上游状态码与正文透传，4xx 的 ABP 错误信封客户端照常能解析；上游不可达回 502 + 信封形状的通用消息
 *   （细节只进服务端日志——它含后端内网地址）。
 * - 一律 `Cache-Control: private, no-store`：这是带用户凭据取回的文件，不该落进任何共享或磁盘缓存。
 */
export async function handleAbpStream(
  request: Request,
  rt: AuthRuntime,
  opts: { prefix?: string } = {},
): Promise<Response> {
  if (!isSameSiteRequest(request)) return CROSS_SITE_RESPONSE();
  const prefix = opts.prefix ?? ABP_STREAM_PREFIX;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${prefix}/`)) {
    return errorResponse(404, "stream route prefix mismatch", []);
  }
  const path = url.pathname.slice(prefix.length);
  // `/api/stream//host/x` 剥前缀后是协议相对 URL；代理会拒，但那是 502，这里先按坏请求挡掉。
  if (path.startsWith("//")) return errorResponse(400, "invalid upstream path", []);

  const cookieHeader = request.headers.get("cookie");
  const setCookies: string[] = [];
  try {
    const session = await currentSession(rt, cookieHeader, setCookies);
    const headers: Record<string, string> = {};
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    const res = await streamAbpWithSession(rt, session, cookieHeader, {
      path: `${path}${url.search}`,
      headers,
      signal: request.signal,
    });
    const out = new Headers(res.headers);
    out.set("Cache-Control", "private, no-store");
    for (const cookie of [...setCookies, ...res.setCookies]) out.append("Set-Cookie", cookie);
    return new Response(res.body, { status: res.status, headers: out });
  } catch (error) {
    if (error instanceof AbpProxyError) setCookies.push(...error.setCookies);
    // 浏览器先走了（取消下载、关页）不是故障，不值得一条 warn。
    if (!request.signal.aborted) {
      rt.logger.warn("abp stream failed", {
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return errorResponse(502, "upstream request failed", setCookies);
  }
}
