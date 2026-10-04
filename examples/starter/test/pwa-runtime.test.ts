// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { watchForNewVersion } from "@/features/pwa/new-version";
import { registerServiceWorker } from "@/features/pwa/register";

describe("registerServiceWorker", () => {
  it("registers /sw.js at the root scope in production, bypassing the HTTP cache for update checks", async () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    await registerServiceWorker({ container: { register }, isProd: true });
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("does nothing in development", async () => {
    const register = vi.fn();
    await registerServiceWorker({ container: { register }, isProd: false });
    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing where service workers are unsupported", async () => {
    await expect(
      registerServiceWorker({ container: undefined, isProd: true }),
    ).resolves.toBeUndefined();
  });

  it("swallows a failed registration", async () => {
    const register = vi.fn(async () => {
      throw new DOMException("insecure", "SecurityError");
    });
    await expect(
      registerServiceWorker({ container: { register }, isProd: true }),
    ).resolves.toBeUndefined();
  });
});

describe("watchForNewVersion", () => {
  it("reports the first failed chunk load only, without swallowing the error", () => {
    const onNewVersion = vi.fn();
    const stop = watchForNewVersion(window, onNewVersion);
    const first = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(first);
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    expect(onNewVersion).toHaveBeenCalledOnce();
    expect(first.defaultPrevented).toBe(false);
    stop();
  });

  it("stops listening once cancelled", () => {
    const onNewVersion = vi.fn();
    watchForNewVersion(window, onNewVersion)();
    window.dispatchEvent(new Event("vite:preloadError"));
    expect(onNewVersion).not.toHaveBeenCalled();
  });
});
