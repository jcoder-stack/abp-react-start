import { configureAbpMutator } from "@/api/mutator";
import { abpRequestFn, abpUploadFn } from "@/auth/server-fns";
import { packUpload, type UploadPayloadBody } from "@/auth/upload-payload";

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

interface AbpResult {
  status: number;
  contentType: string | null;
  contentDisposition?: string | null;
  body?: string;
  bodyBase64?: string;
}

/** 文本类正文继续走 JSON 边界；其余（FormData、字节）改走原生 multipart 的 upload fn。
 *  `URLSearchParams` 归到文本：它就是 urlencoded 的字符串形态，序列化后无损。 */
function textBodyOf(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return undefined;
}

/** 收窄成可打包的二进制正文；`null` 表示这个形状送不过去（目前只有流）。 */
function binaryBodyOf(body: BodyInit): UploadPayloadBody | null {
  if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) return body;
  return ArrayBuffer.isView(body) ? body : null;
}

function toResponse(res: AbpResult): Response {
  const responseBody = NULL_BODY_STATUSES.has(res.status)
    ? null
    : res.bodyBase64 === undefined
      ? (res.body ?? null)
      : Uint8Array.from(atob(res.bodyBase64), (char) => char.charCodeAt(0));
  const headers = new Headers();
  if (res.contentType) headers.set("Content-Type", res.contentType);
  // 文件名只在这个头里；丢了它，下载落盘就只能是一个无名 Blob。
  if (res.contentDisposition) headers.set("Content-Disposition", res.contentDisposition);
  return new Response(responseBody, { status: res.status, headers });
}

/** fetch 形状的封装：生成的 API 客户端 → abpRequestFn / abpUploadFn（服务端代理边界）。 */
export const abpFetch: typeof fetch = async (input, init) => {
  const path =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  const headers =
    init?.headers === undefined ? undefined : Object.fromEntries(new Headers(init.headers));
  const body = init?.body;
  const text = textBodyOf(body);
  if (body === undefined || body === null || text !== undefined) {
    return toResponse(await abpRequestFn({ data: { path, method: init?.method, headers, body: text } }));
  }
  const binary = binaryBodyOf(body);
  if (binary === null) {
    throw new TypeError(
      "abpFetch: a ReadableStream body cannot be replayed after a 401 refresh; buffer it into a Blob or bytes first",
    );
  }
  return toResponse(await abpUploadFn({ data: packUpload(path, init?.method, headers, binary) }));
};

configureAbpMutator({ fetchFn: abpFetch });
