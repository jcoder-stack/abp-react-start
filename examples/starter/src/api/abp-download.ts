import { AbpApiError } from "@/api/mutator";

/** 与 `src/routes/api.stream.$.ts` 的挂载点一致。 */
const STREAM_PREFIX = "/api/stream";

/** blob URL 交给浏览器后多久释放：click 同步返回时下载未必已开始读它（FileSaver.js 同取 40s）。 */
const REVOKE_DELAY_MS = 40_000;

/** `total` 为 null 表示上游没给可信的长度（分块传输或被压缩），只能报已收字节。 */
export interface AbpDownloadProgress {
  loaded: number;
  total: number | null;
}

export interface AbpDownloadOptions {
  onProgress?: (progress: AbpDownloadProgress) => void;
  signal?: AbortSignal;
}

/** 与 mutator 里的同名逻辑重复：两者分属 `jc-abp gen` 模板与 app-shell 块，各自独立分发，互相 import 会让只装其一的项目编译不过。 */
function filenameOf(disposition: string | null): string | undefined {
  if (disposition === null) return undefined;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(disposition);
  if (extended?.[2]) {
    try {
      return decodeURIComponent(extended[2].trim());
    } catch {
      // 编码坏掉的 filename* 退回 filename
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(disposition);
  return (plain?.[2] ?? plain?.[1])?.trim() || undefined;
}

async function readWithProgress(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  total: number | null,
  onProgress: (progress: AbpDownloadProgress) => void,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  onProgress({ loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress({ loaded, total });
  }
}

/**
 * 经流式路由取回一个 ABP 文件，服务端不缓冲、不转 base64。
 *
 * `url` 传 orval 生成的 `get…Url()`（如 `getGetApiAppFileIdDownloadUrl(id)`），接口改名或删除会在编译期暴露。
 * 非 2xx 抛 `AbpApiError`（与生成的 hook 同形，可直接交给 `abpErrorMessage` 出文案）；
 * 响应带文件名时返回 `File`，否则返回 `Blob`。只在浏览器端调用：请求的是本站相对路径。
 */
export async function fetchAbpFile(url: string, opts: AbpDownloadOptions = {}): Promise<Blob> {
  const res = await fetch(`${STREAM_PREFIX}${url}`, { signal: opts.signal });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new AbpApiError(res.status, body, "GET", url);
  }
  const type = res.headers.get("content-type") ?? "";
  const length = Number(res.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  const blob =
    opts.onProgress && res.body
      ? new Blob(await readWithProgress(res.body, total, opts.onProgress), { type })
      : await res.blob();
  const name = filenameOf(res.headers.get("content-disposition"));
  return name ? new File([blob], name, { type: blob.type }) : blob;
}

/** 让浏览器把 blob 存成文件；`filename` 缺省时用 `File` 自带的名字。 */
export function saveBlob(blob: Blob, filename?: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename ?? (blob instanceof File ? blob.name : "download");
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS);
}

/** `fetchAbpFile` + `saveBlob`：取回即落盘。`filename` 覆盖响应里的文件名。 */
export async function downloadAbpFile(
  url: string,
  opts: AbpDownloadOptions & { filename?: string } = {},
): Promise<void> {
  saveBlob(await fetchAbpFile(url, opts), opts.filename);
}
