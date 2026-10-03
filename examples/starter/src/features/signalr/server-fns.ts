import type { HubConnectionInfo } from "@jcoder-stack/abp-react/realtime";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { authMiddleware } from "@/auth/middleware";
import { getAuthRuntime } from "@/auth/runtime";
import { hubConnectionInfo, hubInputSchema } from "@/features/signalr/hub-connection-info";

/**
 * The server fn's body. Every server-only value comes in as an argument, so this export stays safe
 * in the client bundle and a test can watch the header go out.
 */
export function serveHubConnectionInfo(
  setHeader: (name: "Cache-Control", value: string) => void,
  opts: Parameters<typeof hubConnectionInfo>[0],
): HubConnectionInfo | null {
  // 令牌只许活在 JS 内存：没有 no-store，浏览器磁盘缓存或共享缓存可能存下乃至串发这条 GET 响应。
  setHeader("Cache-Control", "no-store");
  return hubConnectionInfo(opts);
}

/**
 * Hands the signed-in browser a short-lived token for one SignalR hub: the single, bounded
 * exception to "tokens never reach the browser" (docs/architecture.md). authMiddleware refreshes
 * an expiring session first, so the token handed out is always fresh. Anonymous visitors get null.
 */
export const getHubConnectionInfoFn = createServerFn({ method: "GET" })
  .validator(hubInputSchema)
  .middleware([authMiddleware])
  .handler(({ data, context }) =>
    serveHubConnectionInfo(setResponseHeader, {
      session: context.session,
      abpBaseUrl: getAuthRuntime().env.abpBaseUrl,
      // 不进应用的 src/env.ts：那个文件归应用所有，功能安装不改它。
      hubPrefix: process.env.SIGNALR_HUB_PREFIX,
      hub: data.hub,
    }),
  );
