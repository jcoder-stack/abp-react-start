import type { AuthSession } from "../auth";
import type { Logger } from "../logger";

export interface AbpProxyRequest {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** 调用方的取消信号（如宿主的 `request.signal`）；触发后当前尝试立即中止且不再重试。 */
  signal?: AbortSignal;
}

export interface AbpProxyResponse {
  status: number;
  /** 只含内容协商类白名单（见 `EXPOSED_RESPONSE_HEADERS`）；上游 Set-Cookie / WWW-Authenticate / Server 已被剔除，可整份转交浏览器。 */
  headers: Headers;
  /** 文本类 content-type 给 string，其余给 ArrayBuffer。二进制经 text() 解码会不可逆损坏。 */
  body: string | ArrayBuffer;
  setCookies: string[];
}

/** 会话接入点：proxy 只认 AuthSession 与一个刷新回调，不认识刷新的实现。 */
export interface AbpProxyAuth {
  session: AuthSession | null;
  refresh: () => Promise<{ session: AuthSession; setCookies: string[] } | null>;
}

export interface AbpProxy {
  send(req: AbpProxyRequest, auth: AbpProxyAuth): Promise<AbpProxyResponse>;
}

/** 代理请求最终失败但过程中已产生会话 cookie（如 401→刷新成功→重放失败）；调用方必须把 setCookies 落到响应上再转抛，否则轮换型 IdP 下用户被静默登出。 */
export class AbpProxyError extends Error {
  constructor(
    message: string,
    readonly setCookies: string[],
    opts?: { cause?: unknown },
  ) {
    super(message, opts);
    this.name = "AbpProxyError";
  }
}

const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS"]);

const isRetryableStatus = (status: number) => status >= 500 || status === 429;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 被丢弃的响应必须显式释放：undici 下未消费的 body 一直占着连接直到 GC，
// 高频 401/5xx 时足以耗尽连接池。cancel 本身失败无所谓，重放照常继续。
const discardBody = (res: Response) => res.body?.cancel().catch(() => {});

// 客户端头只放行内容协商与条件请求类；Cookie/Host/X-Forwarded-* 一旦透传即可伪造来源或走私会话。
// `__tenant` 是 ABP 策略头，由 abp-call 生成后经此转发，故须在白名单内。
const FORWARDABLE = new Set([
  "content-type",
  "accept",
  "accept-language",
  "if-match",
  "if-none-match",
  "x-requested-with",
  "content-disposition",
  "__tenant",
]);

// 上游响应头一律不原样交出：宿主一句 `for (const [k, v] of res.headers)` 就会把 ABP 的
// Set-Cookie（后端自己的会话）、WWW-Authenticate、Server 版本一并灌给浏览器。
const EXPOSED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "etag",
  "cache-control",
  "last-modified",
];

function exposeHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const name of EXPOSED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) out.set(name, value);
  }
  return out;
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (headers === undefined) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => FORWARDABLE.has(key.toLowerCase())),
  );
}

// 绝对 URL 与 `//host` 协议相对 URL 会让 new URL(path, base) 丢弃 base，Bearer 会被贴到任意主机（SSRF + token 外泄）。
const ABSOLUTE_OR_PROTOCOL_RELATIVE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/** path 永远追加在 baseUrl 的 pathname 之下；越出 origin 或路径前缀（含 `..` 归一化后）一律抛错。 */
function resolveTargetUrl(path: string, baseUrl: string): string {
  if (ABSOLUTE_OR_PROTOCOL_RELATIVE.test(path)) {
    throw new Error("abp proxy: path escapes baseUrl");
  }
  const base = new URL(baseUrl);
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const target = new URL(path.replace(/^\//, ""), new URL(basePath, base.origin));
  if (target.origin !== base.origin || !`${target.pathname}/`.startsWith(basePath)) {
    throw new Error("abp proxy: path escapes baseUrl");
  }
  return target.toString();
}

/** ABP 代理网关：贴 Bearer、401→刷新→重放一次、幂等重试、超时。状态码透传，永不因状态码 throw；响应头按白名单过滤后交出。 */
export function createAbpProxy(opts: {
  baseUrl: string;
  fetchFn?: typeof fetch;
  /** 单次尝试的超时（默认 30s）。 */
  timeoutMs?: number;
  retry?: { retries: number };
  /** 含重试与退避在内的总预算；默认不设，此时最坏耗时是 (retries+1)×timeoutMs 加退避。 */
  totalTimeoutMs?: number;
  logger?: Logger;
}): AbpProxy {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const retries = opts.retry?.retries ?? 2;
  return {
    async send(req, auth) {
      const method = (req.method ?? "GET").toUpperCase();
      const maxRetries = IDEMPOTENT.has(method) ? retries : 0;
      const url = resolveTargetUrl(req.path, opts.baseUrl);
      // 调用方 abort 与总预算耗尽都意味着「别再试了」：重试只对上游抖动有意义，
      // 客户端已经走人或预算用光时继续重试纯属白烧上游配额。
      const budget =
        opts.totalTimeoutMs === undefined ? undefined : AbortSignal.timeout(opts.totalTimeoutMs);
      const stops = [req.signal, budget].filter((signal) => signal !== undefined);
      const stopped = () => stops.some((signal) => signal.aborted);
      const stopReason = () => stops.find((signal) => signal.aborted)?.reason;
      let session = auth.session;
      let setCookies: string[] = [];
      let refreshedOnce = false;
      let attempt = 0;
      // 退避等待；等待期间预算耗尽或调用方 abort 则返回 false，调用点据此放弃重试。
      const backoff = async (): Promise<boolean> => {
        await sleep(2 ** attempt * 100);
        attempt++;
        return !stopped();
      };
      for (;;) {
        let res: Response;
        try {
          res = await fetchFn(url, {
            method,
            headers: {
              ...sanitizeHeaders(req.headers),
              ...(session === null
                ? {}
                : { Authorization: `Bearer ${session.tokens.accessToken}` }),
            },
            body: req.body,
            signal: AbortSignal.any([...stops, AbortSignal.timeout(timeoutMs)]),
          });
        } catch (error) {
          if (attempt < maxRetries && !stopped()) {
            opts.logger?.debug("proxy retry after network error", { attempt, path: req.path });
            if (await backoff()) continue;
          }
          if (setCookies.length > 0) {
            throw new AbpProxyError("abp proxy request failed after refresh", setCookies, {
              cause: error,
            });
          }
          throw error;
        }
        if (res.status === 401 && !refreshedOnce && session?.tokens.refreshToken !== undefined) {
          refreshedOnce = true;
          const refreshed = await auth.refresh();
          if (refreshed !== null) {
            session = refreshed.session;
            setCookies = refreshed.setCookies;
            opts.logger?.debug("proxy replaying after refresh", { path: req.path });
            await discardBody(res);
            continue;
          }
        }
        if (isRetryableStatus(res.status) && attempt < maxRetries && !stopped()) {
          opts.logger?.debug("proxy retry", { attempt, status: res.status, path: req.path });
          await discardBody(res);
          if (await backoff()) continue;
          // body 已释放，无可交还的响应，按中止处理，与 fetch 自身超时的表现一致。
          if (setCookies.length > 0) {
            throw new AbpProxyError("abp proxy request aborted after refresh", setCookies, {
              cause: stopReason(),
            });
          }
          throw stopReason();
        }
        const contentType = res.headers.get("content-type") ?? "";
        const isText =
          /^text\/|[+/]json|[+/]xml|urlencoded/i.test(contentType) || contentType === "";
        return {
          status: res.status,
          headers: exposeHeaders(res.headers),
          body: isText ? await res.text() : await res.arrayBuffer(),
          setCookies,
        };
      }
    },
  };
}
