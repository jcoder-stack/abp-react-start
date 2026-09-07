import { z } from "zod";

/** 元数据收在单个保留字段里。平铺成 `__path`/`__method`/`__headers` 会把撞名面扩成若干个
 *  保留字——调用方的表单只要有一个同名字段就会被静默覆盖。 */
const META_FIELD = "__abp";
/** 裸字节的落点：multipart 只能承载字段，字节得先包成 Blob 才能过去。 */
const BYTES_FIELD = "__abpBody";

const metaSchema = z.object({
  path: z.string(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  kind: z.enum(["form", "bytes"]),
});

/** 可打包的字节形状。全部可重发——`ReadableStream` 刻意不在其中，它只能消费一次，
 *  会让代理的 401 重放与幂等重试静默退化成「重放一个空正文」。 */
export type UploadBytes = Blob | ArrayBuffer | ArrayBufferView;
/** `packUpload` 收得下的正文形状。 */
export type UploadPayloadBody = FormData | UploadBytes;
/** 解包后交给代理的正文形状。 */
export type UploadBody = FormData | Uint8Array;

export interface UnpackedUpload {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body: UploadBody;
}

/**
 * 把 path/method/headers 与正文打包成 server fn 能原生传输的 FormData。
 *
 * 与 `unpackUpload` 共享字段名约定，两者必须成对修改；单独存在一个模块里正是为了让这份约定
 * 只有一处真相，且能脱离 TanStack Start 的运行时被测试直接 import。
 */
export function packUpload(
  path: string,
  method: string | undefined,
  headers: Record<string, string> | undefined,
  body: UploadPayloadBody,
): FormData {
  const packed = new FormData();
  const kind = body instanceof FormData ? "form" : "bytes";
  packed.set(META_FIELD, JSON.stringify({ path, method, headers, kind }));
  if (body instanceof FormData) {
    body.forEach((value, name) => {
      packed.append(name, value);
    });
  } else {
    // TS 5.7 起 ArrayBufferView 带上了 ArrayBufferLike 泛型参数（含 SharedArrayBuffer 背衬），
    // 而 BlobPart 只认 ArrayBuffer 背衬那支。把泛型参数写进公开类型能消掉这次转换，代价是
    // 拒掉调用方最常写的裸 `Uint8Array` 标注。与 proxy.ts 里那处同源。
    packed.set(BYTES_FIELD, new Blob([body as BlobPart]));
  }
  return packed;
}

/** `packUpload` 的逆操作；元字段一律剔除，剩下的才是要发给上游的正文。 */
export async function unpackUpload(packed: FormData): Promise<UnpackedUpload> {
  const raw = packed.get(META_FIELD);
  if (typeof raw !== "string") throw new Error("abp upload: missing meta field");
  const meta = metaSchema.parse(JSON.parse(raw));
  packed.delete(META_FIELD);
  if (meta.kind === "form") {
    return { path: meta.path, method: meta.method, headers: meta.headers, body: packed };
  }
  const blob = packed.get(BYTES_FIELD);
  if (!(blob instanceof Blob)) throw new Error("abp upload: missing byte body");
  return {
    path: meta.path,
    method: meta.method,
    headers: meta.headers,
    body: new Uint8Array(await blob.arrayBuffer()),
  };
}
