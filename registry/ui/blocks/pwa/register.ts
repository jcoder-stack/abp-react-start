import { createLogger, type Logger } from "@jcoder-stack/abp-react/logger";

const defaultLogger = createLogger({ scope: "pwa" });

/**
 * Registers /sw.js for the whole origin in production builds only: in development Vite serves
 * modules from /src and /@vite, and a worker left over from a production preview would only get
 * in the way. Never throws — an app that cannot register (old browser, plain http) works as before.
 */
export async function registerServiceWorker(
  opts: {
    container?: Pick<ServiceWorkerContainer, "register"> | undefined;
    isProd?: boolean;
    logger?: Logger;
  } = {},
): Promise<void> {
  const isProd = opts.isProd ?? import.meta.env.PROD;
  const container =
    "container" in opts ? opts.container : (globalThis.navigator?.serviceWorker ?? undefined);
  const logger = opts.logger ?? defaultLogger;
  if (!isProd || container === undefined) return;
  try {
    // updateViaCache: "none"：检查 sw.js 更新时绕过 HTTP 缓存，部署后尽快拿到新 worker。
    await container.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch (error) {
    logger.debug("service worker registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
