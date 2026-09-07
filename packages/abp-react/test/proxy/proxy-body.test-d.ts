import type { AbpProxyRequest } from "../../src/proxy/proxy";

/**
 * 类型契约：`body` 收下所有**可重发**的载荷形状，且拒绝流。
 *
 * 代理的核心能力是 401→刷新→重放与幂等重试，两者都要求同一个 body 能被发第二次。
 * `ReadableStream` 只能消费一次，收下它等于让这两条路径静默退化成「重放一个空正文」——
 * 上游看到的是内容缺失的请求而不是错误，最难查。故在类型层就挡掉。
 *
 * 本文件由 `bun run typecheck` 静态检查、从不执行；`@ts-expect-error` 失守会让 typecheck 失败。
 */

declare const bytes: Uint8Array;
declare const buffer: ArrayBuffer;
declare const form: FormData;
declare const stream: ReadableStream<Uint8Array>;

const asText: AbpProxyRequest = { path: "/api/x", body: '{"a":1}' };
const asBytes: AbpProxyRequest = { path: "/api/x", body: bytes };
const asBuffer: AbpProxyRequest = { path: "/api/x", body: buffer };
const asForm: AbpProxyRequest = { path: "/api/x", body: form };
const omitted: AbpProxyRequest = { path: "/api/x" };

// @ts-expect-error 流不可重发，会静默废掉 401 重放与幂等重试
const asStream: AbpProxyRequest = { path: "/api/x", body: stream };
// @ts-expect-error Blob 未收录：Node 侧读取是异步的，重放语义与其余形状不一致
const asBlob: AbpProxyRequest = { path: "/api/x", body: new Blob([]) };

export type { AbpProxyRequest };
export { asBlob, asBuffer, asBytes, asForm, asStream, asText, omitted };
