/** Runtime configuration for the generated API client (BFF base URL and injectable fetch). */
export interface AbpMutatorConfig {
  baseUrl?: string;
  fetchFn?: typeof globalThis.fetch;
}

let mutatorConfig: AbpMutatorConfig = {};

/** Configure the generated API client once at startup, with process-wide, request-invariant
 *  values only: the BFF baseUrl, or a server-side fetch that itself reads per-request
 *  cookies/tenant/culture.
 *
 *  This is a module-level singleton. Never store per-request or per-tenant state here;
 *  keep that inside fetchFn. */
export function configureAbpMutator(config: AbpMutatorConfig): void {
  mutatorConfig = { ...mutatorConfig, ...config };
}

/** Reset the mutator configuration to empty. Primarily for test isolation. */
export function resetAbpMutator(): void {
  mutatorConfig = {};
}

/** Error thrown by abpMutator on a non-2xx response; body carries the parsed ABP error envelope (undefined when the response body is not JSON). */
export class AbpApiError<Payload = unknown> extends Error {
  constructor(
    readonly status: number,
    readonly body: Payload,
    readonly method: string,
    readonly url: string,
  ) {
    super(`API ${method} ${url} failed: ${status}`);
    this.name = "AbpApiError";
  }
}

/** orval reads this from the mutator to type each hook's TError as AbpApiError wrapping the endpoint's error schema (the ABP RemoteServiceErrorResponse). */
export type ErrorType<Payload> = AbpApiError<Payload>;

/** Single request boundary for all generated endpoints (orval fetch convention: url first, RequestInit second). */
export async function abpMutator<T>(url: string, options?: RequestInit): Promise<T> {
  const fetchFn = mutatorConfig.fetchFn ?? fetch;
  const res = await fetchFn(`${mutatorConfig.baseUrl ?? ""}${url}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new AbpApiError(res.status, body, options?.method ?? "GET", url);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const disposition = res.headers.get("content-disposition");
  if (disposition !== null) {
    return toFile(await res.blob(), disposition) as T;
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  // ABP 有裸字符串/无 content-type 的端点（如 timezone 当前值），走 text 分支比 json 更稳。
  if (contentType === "" || contentType.startsWith("text/plain")) {
    return (await res.text()) as T;
  }
  // orval 把 `format: binary` 的响应类型标成 Blob；按文本解码会不可逆地弄坏字节。
  return (await res.blob()) as T;
}

/** 有文件名就包成 File（仍是 Blob，生成函数的 `Promise<Blob>` 不变），调用方可直接拿 `.name` 落盘。
 *  `filename*`（RFC 5987，ASP.NET Core 给非 ASCII 文件名用它）优先于 `filename`。 */
function toFile(blob: Blob, disposition: string): Blob {
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(disposition);
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(disposition);
  let name: string | undefined;
  if (extended?.[2]) {
    try {
      name = decodeURIComponent(extended[2].trim());
    } catch {
      // 编码坏掉的 filename* 退回 filename
    }
  }
  name ??= (plain?.[2] ?? plain?.[1])?.trim();
  return name ? new File([blob], name, { type: blob.type }) : blob;
}
