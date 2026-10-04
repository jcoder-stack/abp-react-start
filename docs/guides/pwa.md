# PWA（可安装 + 离线页）

> 简体中文版。English edition: [`pwa.en.md`](pwa.en.md)

可选功能 `pwa` 让应用可以「添加到主屏幕 / 安装为应用」，断网时显示一个离线页，部署新版本后提示用户刷新。

```bash
npx jc-abp add pwa          # 已有项目
npx jc-abp init --with pwa  # 新项目
```

## 装进来的东西

| 文件 | 作用 |
| --- | --- |
| `public/manifest.webmanifest` | 应用名、图标、颜色。名称取 `.env` 的 `VITE_APP_TITLE`（安装时写入） |
| `public/pwa/*.png` | 四个图标：192、512、512 maskable、180（iOS） |
| `public/sw.js` | Service Worker |
| `public/offline.html` | 离线页，跟随系统明暗、浏览器语言（`navigator.language`）中英文自动切换，不看应用内选的语言 |
| `src/features/pwa/` | 注册 Service Worker、「有新版本」提示、head 里的 manifest 与 theme-color |

## Service Worker 缓存什么

| 请求 | 处理 |
| --- | --- |
| 页面导航 | 只走网络；断网时显示离线页。**页面永不缓存**——它带着登录用户的数据 |
| `/offline.html` | Service Worker 安装时预缓存，断网时就靠它 |
| `/assets/*`（带 hash 的构建产物） | 先查缓存，没有再取网络；状态码 200 且不是 HTML 的响应都会缓存（不只 JS、CSS、字体），写缓存失败也不会让这次响应失败；最多留最近加入的 300 条（先进先出） |
| `/api/*`、`/_serverFn*`、非 GET、跨域请求、Range 请求（`<video>` / `<audio>` 的媒体流） | 不经过 Service Worker |

所以它**不提供离线浏览**：断网时整页加载（打开、刷新、地址栏跳转）只显示离线页；应用内的客户端导航则显示路由的错误界面。好处是共用设备上不会出现上一个用户的数据，登出也不需要清缓存。

`/assets/` 下只能放带内容 hash 的文件（构建产物默认就是）。往里放不带 hash 的文件，它会被永久缓存，改了也不会更新。

托管或 CDN 如果对缺失的文件回 200 的 `index.html`（SPA 兜底），别让这条规则覆盖 `/assets/*`；Service Worker 无论如何都不会把 HTML 存进资源缓存。

## 部署新版本

浏览器每次打开页面都会检查 `sw.js` 是否变化；新 worker 装好后立即接管。页面本身不缓存，所以下次导航拿到的就是新版本。

一直开着的标签页还停在旧版本。路由 chunk 缺失时，TanStack Router 的懒加载会自己整页刷新一次，拿到新版本；「有新版本可用」的提示主要出现在其他懒加载的部分（例如 `React.lazy` 的面板）找不到旧 chunk 时，点「刷新」即可。

## 换品牌

- 图标：替换 `public/pwa/` 下的四个 PNG（尺寸见上表；maskable 与 iOS 那两张要满底、无圆角，主体落在中间 80% 内）。重跑 `jc-abp add pwa` 不会覆盖你的图标。在本仓库里则可以改 `examples/starter/public/app-icon.svg` 后运行 `node scripts/gen-pwa-icons.mjs` 重新生成四张图，首次需要 `bunx playwright install chromium`；用 CLI 的应用开发者直接替换 PNG 即可。
- 名称：改 `.env` 的 `VITE_APP_TITLE`，或直接改 `public/manifest.webmanifest`。注意重跑 `jc-abp add pwa` 会把 manifest 重置为模板再按 `VITE_APP_TITLE` 写名称。
- 颜色：manifest 的 `theme_color` / `background_color` 和 `src/features/pwa/feature.tsx` 里两个 `<meta name="theme-color">` 写死了主题 `--background` 的 hex（manifest 与 meta 读不了 CSS 变量）。改了主题背景色就同步改这几处。

## 升级旧应用

用 0.4 starter 生成的应用，`src/routes/__root.tsx` 的 `links` 里还有 `/manifest.json` 和一个 SVG 的 `apple-touch-icon`，排在本功能的链接前面，旧 manifest 会悄悄胜出。删掉这两条；`jc-abp add pwa` 发现它们时会给出警告。

## 开发时

Service Worker 只在生产构建里注册，`bun run dev` 不注册。但如果你在同一个 `localhost` 端口上跑过生产预览，那个 worker 会留在浏览器里：DevTools → Application → Service workers 里点 Unregister 即可。它对开发服务器的请求不缓存，留着也不会出错。

Service Worker 只在 https 或 `localhost` 下工作。

在本仓库里，`bun run e2e` 会用 Playwright 对生产构建和一个 mock ABP 跑 PWA 的端到端测试。

## 卸载

直接删掉 `src/features/pwa/` 不够：已经装过的浏览器里，旧 worker 会一直留着。在删掉 `src/features/pwa/` 的**同一个版本**里，把 `public/sw.js` 换成下面这个「自我注销」版本（只删 `src/features/pwa/` 而留着旧 `sw.js`，每次打开页面都会重新注册）。它装好后立即接管、清掉 `jc-abp-pwa-` 开头的缓存、再注销自己；它没有 fetch 处理，打开着的标签页已经直接走网络，不需要刷新。

这个小小的 `public/sw.js` 要**一直留着部署**：它一旦 404，错过那段时间的浏览器会一直留着旧 worker。`public/offline.html`、`public/manifest.webmanifest`、`public/pwa/` 与 `src/features/pwa/` 都可以删。

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

## 不在本功能范围内

离线浏览、Web Push（应用关闭时的系统通知）、后台同步。
