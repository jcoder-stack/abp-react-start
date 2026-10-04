import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SW_SOURCE = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");
const ORIGIN = "https://app.example";

type Handler = (event: unknown) => void;

/** An in-memory CacheStorage good enough for sw.js: named caches keyed by URL, insertion-ordered. */
function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    let store = stores.get(name);
    if (store === undefined) {
      store = new Map();
      stores.set(name, store);
    }
    const cache = store;
    return {
      match: async (req: Request | string) =>
        cache.get(typeof req === "string" ? new URL(req, ORIGIN).href : req.url)?.clone(),
      put: async (req: Request | string, res: Response) => {
        cache.set(typeof req === "string" ? new URL(req, ORIGIN).href : req.url, res);
      },
      add: async (req: Request | string) => {
        const url = typeof req === "string" ? new URL(req, ORIGIN).href : req.url;
        cache.set(
          url,
          new Response(`offline page for ${url}`, { headers: { "content-type": "text/html" } }),
        );
      },
      keys: async () => [...cache.keys()].map((url) => new Request(url)),
      delete: async (req: Request | string) =>
        cache.delete(typeof req === "string" ? req : req.url),
    };
  };
  return {
    stores,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (req: string, opts?: { cacheName?: string }) => {
        const names = opts?.cacheName ? [opts.cacheName] : [...stores.keys()];
        for (const name of names) {
          const hit = await (await open(name)).match(req);
          if (hit) return hit;
        }
        return undefined;
      },
    },
  };
}

function loadWorker(fetchImpl: (req: Request) => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const caches = memoryCaches();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  const context = createContext({
    self,
    caches: caches.api,
    fetch: fetchImpl,
    Request,
    Response,
    URL,
    Promise,
    console,
  });
  runInContext(SW_SOURCE, context);
  const routeFor = context.routeFor as (request: Request, origin: string) => string;

  /** Fires a FetchEvent; resolves to the response sw.js answered with, or undefined when it let the request through. */
  async function dispatchFetch(url: string, init: { method?: string; mode?: RequestMode } = {}) {
    const request = new Request(new URL(url, ORIGIN), { method: init.method ?? "GET" });
    Object.defineProperty(request, "mode", { value: init.mode ?? "cors" });
    let answered: Promise<Response> | undefined;
    handlers.get("fetch")?.({ request, respondWith: (p: Promise<Response>) => (answered = p) });
    return answered === undefined ? undefined : await answered;
  }

  async function lifecycle(type: "install" | "activate") {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)?.({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }

  return { routeFor, dispatchFetch, lifecycle, caches, self };
}

function req(url: string, init: { method?: string; mode?: RequestMode } = {}) {
  const request = new Request(new URL(url, ORIGIN), { method: init.method ?? "GET" });
  Object.defineProperty(request, "mode", { value: init.mode ?? "cors" });
  return request;
}

describe("routeFor", () => {
  const { routeFor } = loadWorker(async () => new Response("x"));

  it.each([
    ["/", "navigate", "navigate"],
    ["/admin/users?tab=2", "navigate", "navigate"],
    ["/assets/index-abc123.js", "cors", "asset"],
    ["/assets/inter-latin.woff2", "no-cors", "asset"],
    ["/api/auth/login", "navigate", "passthrough"],
    ["/api/auth/callback?code=x&state=y", "navigate", "passthrough"],
    ["/api/abp/application-configuration", "cors", "passthrough"],
    ["/_serverFn/abc123?createServerFn", "cors", "passthrough"],
    ["/favicon.svg", "no-cors", "passthrough"],
    ["/sw.js", "same-origin", "passthrough"],
  ] as const)("%s (%s) → %s", (path, mode, expected) => {
    expect(routeFor(req(path, { mode }), ORIGIN)).toBe(expected);
  });

  it("never intercepts non-GET or cross-origin requests", () => {
    expect(routeFor(req("/assets/a.js", { method: "POST" }), ORIGIN)).toBe("passthrough");
    expect(routeFor(new Request("https://fonts.example/a.woff2"), ORIGIN)).toBe("passthrough");
  });
});

describe("fetch handling", () => {
  it("serves the precached offline page when a navigation fails, and never caches HTML", async () => {
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await worker.lifecycle("install");
    const response = await worker.dispatchFetch("/admin", { mode: "navigate" });
    expect(await response?.text()).toContain("offline page for https://app.example/offline.html");

    const cached = [...worker.caches.stores.values()].flatMap((store) => [...store.keys()]);
    expect(cached).toEqual(["https://app.example/offline.html"]);
  });

  it("answers a successful navigation from the network untouched", async () => {
    const worker = loadWorker(async () => new Response("<html>live</html>", { status: 200 }));
    const response = await worker.dispatchFetch("/", { mode: "navigate" });
    expect(await response?.text()).toBe("<html>live</html>");
    const cached = [...worker.caches.stores.values()].flatMap((store) => [...store.keys()]);
    expect(cached).toEqual([]);
  });

  it("serves assets cache-first and only caches successful responses", async () => {
    const network = vi.fn(async (request: Request) =>
      request.url.endsWith("gone.js")
        ? new Response("missing", { status: 404 })
        : new Response(`body of ${request.url}`),
    );
    const worker = loadWorker(network);

    expect(await (await worker.dispatchFetch("/assets/app.js"))?.text()).toBe(
      "body of https://app.example/assets/app.js",
    );
    expect(await (await worker.dispatchFetch("/assets/app.js"))?.text()).toBe(
      "body of https://app.example/assets/app.js",
    );
    expect(network).toHaveBeenCalledTimes(1);

    expect((await worker.dispatchFetch("/assets/gone.js"))?.status).toBe(404);
    expect((await worker.dispatchFetch("/assets/gone.js"))?.status).toBe(404);
    expect(network).toHaveBeenCalledTimes(3);
  });

  it("does not answer passthrough requests at all", async () => {
    const worker = loadWorker(async () => new Response("x"));
    expect(await worker.dispatchFetch("/_serverFn/abc", { method: "POST" })).toBeUndefined();
    expect(await worker.dispatchFetch("/api/auth/login", { mode: "navigate" })).toBeUndefined();
  });
});

describe("lifecycle", () => {
  it("takes over immediately on install and activate", async () => {
    const worker = loadWorker(async () => new Response("x"));
    await worker.lifecycle("install");
    await worker.lifecycle("activate");
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it("drops only its own outdated caches on activate", async () => {
    const worker = loadWorker(async () => new Response("x"));
    await worker.caches.api.open("jc-abp-pwa-assets-v0");
    await worker.caches.api.open("my-app-images");
    await worker.lifecycle("install");
    await worker.lifecycle("activate");
    const names = [...worker.caches.stores.keys()];
    expect(names).not.toContain("jc-abp-pwa-assets-v0");
    expect(names).toContain("my-app-images");
  });
});
