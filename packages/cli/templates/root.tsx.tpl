// 副作用：注册生成 API 客户端的 fetchFn，全应用只接线这一次。
import "@/api/abp-fetch";
import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { AppConfigProvider, SessionProvider } from "@jcoder-stack/abp-react/react";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getAppStateFn, getIdentityFn } from "@/auth/server-fns";
import { Toaster } from "@/components/ui/sonner";
import { clientEnv } from "@/env";
import appCss from "@/styles.css?url";
import { RouteError, RouteNotFound } from "./shell-boundary";
__DEVTOOLS_IMPORTS____MESSAGE_IMPORTS__

/** 三层（culture → resource → key）深合并，把各块词条拼成一份 FrontendCatalog。 */
function mergeCatalogs(...catalogs: FrontendCatalog[]): FrontendCatalog {
  const merged: FrontendCatalog = {};
  for (const catalog of catalogs) {
    for (const [culture, resources] of Object.entries(catalog)) {
      merged[culture] ??= {};
      const mergedResources = merged[culture];
      for (const [resource, entries] of Object.entries(resources)) {
        mergedResources[resource] = { ...mergedResources[resource], ...entries };
      }
    }
  }
  return merged;
}

/**
 * 静态词条表，引用稳定，免得 AppConfigProvider 的 translator memo 每次渲染都重建。
 * 同名 key 后到先赢：在末尾追加你自己的词条即可覆盖块的默认文案，不必改块源码。
 */
const messages = mergeCatalogs(__MESSAGE_ARGS__);

/** 首绘前应用主题，避免暗色闪白；与 ThemeToggle 共用 localStorage.theme 约定。 */
const THEME_SCRIPT = `(()=>{try{var t=localStorage.getItem("theme");var d=t==="dark"||((t===null||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // 守卫读 context.identity；appState 同时喂给两个 Provider。
  // staleTime 内页内导航复用缓存，不为每次跳转付一次后端往返。鉴权态变化（登录/登出/切租户/
  // 切语言）都走整页刷新，缓存随之作废。
  beforeLoad: async ({ context }) => {
    const appState = await context.queryClient.ensureQueryData({
      queryKey: ["app-state"],
      queryFn: () => getAppStateFn(),
      staleTime: 5 * 60_000,
    });
    return { appState, identity: appState.identity };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: clientEnv.VITE_APP_TITLE },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        // 变量字体（wght@100..900）而非离散字重：主题用到 510/590 两档，静态字重取不到。
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: RootComponent,
});

// 模块级稳定引用：内联箭头会让 SessionContext 的 value 每次 root 渲染都换新，
// 所有 useSession/usePermissionChecker 消费者跟着无谓重渲染。
const fetchIdentity = () => getIdentityFn();

function RootComponent() {
  const { appState } = Route.useRouteContext();
  // lang 跟随当前语言，不写死：读屏发音、断行规则与 :lang() 排版适配都靠它。
  // 切语言走整页跳转，所以 SSR 输出的就是最终值，不存在水合不一致。
  return (
    <RootDocument lang={appState.config.localization.currentCulture.name}>
      <AppConfigProvider config={appState.config} messages={messages} fallbackCulture="en">
        <SessionProvider identity={appState.identity} fetchIdentity={fetchIdentity}>
          <Outlet />
        </SessionProvider>
      </AppConfigProvider>
    </RootDocument>
  );
}

function RootDocument({ children, lang }: { children: ReactNode; lang: string }) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 首绘前主题脚本，静态常量无注入面 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster richColors position="top-center" />
__DEVTOOLS_ELEMENT__        <Scripts />
      </body>
    </html>
  );
}
