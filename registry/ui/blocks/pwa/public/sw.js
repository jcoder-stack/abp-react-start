const PREFIX = "jc-abp-pwa-";
// 手写、不经打包：浏览器按字节比对它来发现新版本，改动策略时把 VERSION 加一，旧缓存在 activate 时清掉。
// （注释不放在文件第一个语句之前：shadcn add 会剥掉那里的注释。）
const VERSION = "1";
const ASSET_CACHE = `${PREFIX}assets-v${VERSION}`;
const OFFLINE_CACHE = `${PREFIX}offline-v${VERSION}`;
const OFFLINE_URL = "/offline.html";
/** Hashed assets pile up across deploys; past this many entries the oldest go. */
const MAX_ASSET_ENTRIES = 300;

/**
 * Where a request goes. HTML and API responses carry the signed-in user's data, so they are
 * never cached: navigations go to the network (offline page on failure) and everything under
 * /api or /_serverFn — including the OIDC login/callback redirects — is not intercepted at all.
 * Only hashed /assets/* are immutable and safe to cache.
 */
function routeFor(request, origin) {
  if (request.method !== "GET") return "passthrough";
  const url = new URL(request.url);
  if (url.origin !== origin) return "passthrough";
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) {
    return "passthrough";
  }
  if (request.mode === "navigate") return "navigate";
  if (url.pathname.startsWith("/assets/")) return "asset";
  return "passthrough";
}

async function trimAssets(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSET_ENTRIES))) {
    await cache.delete(key);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // 部署后旧 chunk 会 404：缓存它等于把坏响应钉死。
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimAssets(cache);
  }
  return response;
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
    return offline ?? Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      // 绝对 URL：Request 不接受相对路径（在 worker 外的测试环境里同样成立）；reload 绕过 HTTP 缓存取最新离线页。
      .then((cache) => cache.add(new Request(new URL(OFFLINE_URL, self.location.origin), { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(PREFIX) && name !== ASSET_CACHE && name !== OFFLINE_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const route = routeFor(event.request, self.location.origin);
  if (route === "navigate") event.respondWith(networkWithOfflineFallback(event.request));
  else if (route === "asset") event.respondWith(cacheFirst(event.request));
});
