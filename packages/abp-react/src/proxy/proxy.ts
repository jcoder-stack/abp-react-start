import type { AuthSession } from "../auth";
import type { Logger } from "../logger";
import {
  tlsTrustFailureCode,
  tlsTrustFailureMessage,
  upstreamUnreachableCode,
  upstreamUnreachableMessage,
} from "./tls-trust";

/**
 * 请求正文。四种形状的共同点是**可重发**：401→刷新→重放与幂等重试都要把同一个 body 再发一次。
 *
 * `ReadableStream` 刻意不在其中。它只能消费一次，收下它会让上述两条路径静默退化成「重放一个
 * 空正文」——上游看到的是内容缺失的请求而不是错误，最难查。要传流请先自行缓冲成字节。
 */
export type AbpProxyBody = string | Uint8Array | ArrayBuffer | FormData;

export interface AbpProxyRequest {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: AbpProxyBody;
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

function sanitizeHeaders(
  headers: Record<string, string> | undefined,
  body: AbpProxyBody | undefined,
): Record<string, string> {
  if (headers === undefined) return {};
  // FormData 由传输层重新编码，boundary 是它现生成的。调用方带来的 content-type 里是**上一份**
  // FormData 的旧 boundary，透传下去上游会按错的分隔符解析，正文永远读不出字段——症状是
  // 「请求到了、参数全空」，不是报错。故这一种形状下由传输层独占 content-type。
  const dropContentType = typeof FormData !== "undefined" && body instanceof FormData;
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) =>
        FORWARDABLE.has(key.toLowerCase()) &&
        !(dropContentType && key.toLowerCase() === "content-type"),
    ),
  );
}

/** 默认上传上限：够跑 ABP 导入类端点的 Excel/CSV，又不至于让单个请求吃穿 server 进程内存。 */
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

const isStreamLike = (body: unknown): boolean =>
  typeof (body as { getReader?: unknown } | null | undefined)?.getReader === "function";

/**
 * 可测的正文字节数；`null` 表示不做限制判断。
 *
 * 字符串刻意不测：那是 JSON 热路径，`TextEncoder` 会为每个请求多拷一份，而上限本就是为上传设的。
 */
function measurableBodyBytes(body: AbpProxyBody | undefined): number | null {
  if (body === undefined || typeof body === "string") return null;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  let total = 0;
  // forEach 而非 for..of：仓库的 lib 是 ["ES2022", "DOM"]，没有 DOM.Iterable，
  // FormData 在类型上不可迭代。为一处遍历放宽全仓库的 lib 不值当。
  body.forEach((value, name) => {
    total += name.length;
    total += typeof value === "string" ? value.length : value.size;
  });
  return total;
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
  /** 可测正文（字节/FormData）的上限，默认 10MB。字符串正文不参与判断，见 `measurableBodyBytes`。 */
  maxBodyBytes?: number;
  logger?: Logger;
}): AbpProxy {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const retries = opts.retry?.retries ?? 2;
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return {
    async send(req, auth) {
      // 两道入口守卫都在任何网络动作之前：流会静默废掉重放，超限会吃穿内存，
      // 让它们先发出去再失败，代价是一次白跑的上传。
      if (isStreamLike(req.body)) {
        throw new Error(
          "abp proxy: a ReadableStream body cannot be replayed after a 401 refresh or an idempotent retry; buffer it into bytes first",
        );
      }
      const bodyBytes = measurableBodyBytes(req.body);
      if (bodyBytes !== null && bodyBytes > maxBodyBytes) {
        throw new Error(`abp proxy: request body too large (${bodyBytes} > ${maxBodyBytes} bytes)`);
      }
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
              ...sanitizeHeaders(req.headers, req.body),
              ...(session === null
                ? {}
                : { Authorization: `Bearer ${session.tokens.accessToken}` }),
            },
            // AbpProxyBody 的四种形状运行时都是合法的 fetch 正文。TS 5.7 起 Uint8Array 带上了
            // ArrayBufferLike 泛型参数，而 BodyInit 只认 ArrayBuffer 背衬的那支；把泛型参数写进
            // 公开类型能消掉这次转换，但会反过来拒掉调用方最常写的裸 `Uint8Array` 标注。
            body: req.body as BodyInit | undefined,
            signal: AbortSignal.any([...stops, AbortSignal.timeout(timeoutMs)]),
          });
        } catch (error) {
          // 证书不受信是确定性失败，重试只会重演同一次握手；不可达可能是后端正在重启，重试照旧。
          const tlsCode = tlsTrustFailureCode(error);
          if (tlsCode === null && attempt < maxRetries && !stopped()) {
            opts.logger?.debug("proxy retry after network error", { attempt, path: req.path });
            if (await backoff()) continue;
          }
          // 裸的 `fetch failed` 不指向任何可执行的下一步，而这两类恰恰是本地起步时最常撞的墙。
          const unreachableCode = tlsCode === null ? upstreamUnreachableCode(error) : null;
          const explanation =
            tlsCode !== null
              ? tlsTrustFailureMessage(tlsCode, url)
              : unreachableCode !== null
                ? upstreamUnreachableMessage(unreachableCode, url)
                : null;
          const failure = explanation === null ? error : new Error(explanation, { cause: error });
          if (setCookies.length > 0) {
            throw new AbpProxyError("abp proxy request failed after refresh", setCookies, {
              cause: failure,
            });
          }
          throw failure;
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
