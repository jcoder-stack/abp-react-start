# PWA (installable + offline page)

> English edition. 简体中文版：[`pwa.md`](pwa.md)

The optional `pwa` feature lets users "add to home screen / install as an app", shows an offline page when the network is down, and prompts for a reload after a new deploy.

```bash
npx jc-abp add pwa          # existing project
npx jc-abp init --with pwa  # new project
```

## What gets installed

| File | Purpose |
| --- | --- |
| `public/manifest.webmanifest` | App name, icons, colors. The name comes from `VITE_APP_TITLE` in `.env` (written at install time) |
| `public/pwa/*.png` | Four icons: 192, 512, 512 maskable, 180 (iOS) |
| `public/sw.js` | The service worker |
| `public/offline.html` | The offline page; follows the system light/dark scheme and switches between Chinese and English by the browser language (`navigator.language`), not by the language chosen inside the app |
| `src/features/pwa/` | Registers the service worker, the "new version available" prompt, and the manifest link and theme-color in the head |

## What the service worker caches

| Request | Handling |
| --- | --- |
| Page navigations | Network only; the offline page when the network is down. **Pages are never cached**: they carry the signed-in user's data |
| `/offline.html` | Precached when the service worker installs; it is what shows when the network is down |
| `/assets/*` (hashed build output) | Cache first, network on a miss; every status 200 response that is not HTML is cached (not just JS, CSS and fonts), a failed cache write never fails the response, and only the 300 most recently added entries are kept (FIFO) |
| `/api/*`, `/_serverFn*`, non-GET, cross-origin and Range requests (`<video>` / `<audio>` media streams) | Not handled by the service worker |

So it does **not provide offline browsing**: with the network down, full page loads (opening, reloading, typing an address) show only the offline page, and in-app (client-side) navigations show the route's error UI. The upside is that no previous user's data shows up on a shared device, and signing out needs no cache clearing.

`/assets/` must hold only content-hashed files (build output already is). An unhashed file placed there is cached forever and never updates.

If your host or CDN answers missing files with `index.html` at status 200 (an SPA fallback), keep that rule away from `/assets/*`; the service worker refuses to put HTML in the asset cache anyway.

## Shipping a new version

On each page load the browser checks whether `sw.js` changed; a freshly installed worker takes over immediately. Pages are not cached, so the next navigation already gets the new version.

A tab that has been open the whole time is still on the old version. When a route chunk is missing, TanStack Router's lazy route loading reloads the page once by itself and gets the new version. The "new version available" prompt mainly shows when another lazily loaded part (a `React.lazy` panel, for example) cannot find its old chunk; click "Reload".

## Rebranding

- Icons: replace the four PNGs under `public/pwa/` (sizes in the table above; the maskable and iOS ones must be full-bleed with no rounded corners, with the artwork inside the central 80%). Rerunning `jc-abp add pwa` does not overwrite your icons. In this repo you can instead edit `examples/starter/public/app-icon.svg` and run `node scripts/gen-pwa-icons.mjs` to regenerate all four; it needs a one-time `bunx playwright install chromium`. App developers using the CLI just replace the PNGs.
- Name: change `VITE_APP_TITLE` in `.env`, or edit `public/manifest.webmanifest` directly. Note that rerunning `jc-abp add pwa` resets the manifest to the template and then writes the name from `VITE_APP_TITLE`.
- Colors: the manifest's `theme_color` / `background_color` and the two `<meta name="theme-color">` elements in `src/features/pwa/feature.tsx` hard-code the theme's `--background` hex (manifests and meta tags cannot read CSS variables). Update them together when you change the theme background.

## Upgrading an older app

Apps generated from the 0.4 starter still have `/manifest.json` and an SVG `apple-touch-icon` in the `links` of `src/routes/__root.tsx`, ahead of this feature's links, so the old manifest silently wins. Remove both; `jc-abp add pwa` warns when it finds them.

## During development

The service worker is registered only in production builds; `bun run dev` does not register it. But if you ran a production preview on the same `localhost` port, that worker stays in the browser: click Unregister under DevTools → Application → Service workers. It does not cache requests to the dev server, so leaving it is harmless.

Service workers only work over https or on `localhost`.

In this repo, `bun run e2e` runs the PWA end-to-end tests with Playwright against a production build and a mock ABP.

## Uninstalling

Deleting `src/features/pwa/` is not enough: the old worker stays in browsers that already installed it. In **the same release** that deletes `src/features/pwa/`, replace `public/sw.js` with the "self-unregistering" version below (deleting `src/features/pwa/` while the old `sw.js` stays means every page load registers it again). It takes over at once, deletes the `jc-abp-pwa-` caches, then unregisters itself; it has no fetch handler, so open tabs already reach the network and need no reload.

Keep that tiny `public/sw.js` **deployed indefinitely**: once it 404s, browsers that missed the window keep the old worker. You may delete `public/offline.html`, `public/manifest.webmanifest`, `public/pwa/` and `src/features/pwa/`.

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("jc-abp-pwa-")) await caches.delete(name);
      }
      await self.registration.unregister();
    })(),
  );
});
```

## Out of scope

Offline browsing, Web Push (system notifications while the app is closed), background sync.
