import { configureAbpMutator } from "@/api/mutator";
import { abpRequestFn } from "@/auth/server-fns";

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** fetch 形状的封装：生成的 API 客户端 → abpRequestFn（服务端代理边界）。 */
export const abpFetch: typeof fetch = async (input, init) => {
  const path =
    typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  const headers =
    init?.headers === undefined ? undefined : Object.fromEntries(new Headers(init.headers));
  const body = typeof init?.body === "string" ? init.body : undefined;
  const res = await abpRequestFn({ data: { path, method: init?.method, headers, body } });
  const responseBody = NULL_BODY_STATUSES.has(res.status)
    ? null
    : res.bodyBase64 === undefined
      ? (res.body ?? null)
      : Uint8Array.from(atob(res.bodyBase64), (char) => char.charCodeAt(0));
  return new Response(responseBody, {
    status: res.status,
    headers: res.contentType ? { "Content-Type": res.contentType } : {},
  });
};

configureAbpMutator({ fetchFn: abpFetch });
