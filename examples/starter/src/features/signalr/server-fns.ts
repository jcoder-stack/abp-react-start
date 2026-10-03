import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/auth/middleware";
import { getAuthRuntime } from "@/auth/runtime";
import { hubConnectionInfo, hubInputSchema } from "@/features/signalr/hub-connection-info";

/**
 * Hands the signed-in browser a short-lived token for one SignalR hub: the single, bounded
 * exception to "tokens never reach the browser" (docs/architecture.md). authMiddleware refreshes
 * an expiring session first, so the token handed out is always fresh. Anonymous visitors get null.
 */
export const getHubConnectionInfoFn = createServerFn({ method: "GET" })
  .validator(hubInputSchema)
  .middleware([authMiddleware])
  .handler(({ data, context }) =>
    hubConnectionInfo({
      session: context.session,
      abpBaseUrl: getAuthRuntime().env.abpBaseUrl,
      // 不进应用的 src/env.ts：那个文件归应用所有，功能安装不改它。
      hubPrefix: process.env.SIGNALR_HUB_PREFIX,
      hub: data.hub,
    }),
  );
