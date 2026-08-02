// 副作用：注册生成 API 客户端的 fetchFn，全应用只接线这一次。
import "@/api/abp-fetch";
import type { FrontendCatalog } from "@jcoder/abp-react/i18n";
import { AppConfigProvider, SessionProvider } from "@jcoder/abp-react/react";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { getAppStateFn, getIdentityFn } from "@/auth/server-fns";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import layoutMessages from "@/components/abp/layout/layout-messages.json";
import loginMessages from "@/components/abp/login/login-messages.json";
import adminMessages from "@/components/abp/permission/admin-messages.json";
import comboboxMessages from "@/components/combobox/combobox-messages.json";
import tableMessages from "@/components/data-table/table-messages.json";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import formMessages from "@/components/form/form-messages.json";
import treeMessages from "@/components/tree/tree-messages.json";
import { Toaster } from "@/components/ui/sonner";
import { clientEnv } from "@/env";
import en from "@/i18n/en.json";
import zhHans from "@/i18n/zh-Hans.json";
import appCss from "@/styles.css?url";
import shellMessages from "./_layout/shell-messages.json";
import { RouteError, RouteNotFound } from "./shell-boundary";

/** 三层（culture → resource → key）深合并；用于把各块词条（"" 桶）与 app 词条（"App" 桶）拼成一份 FrontendCatalog。 */
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
 * Static frontend i18n catalog（stable reference so AppConfigProvider's translator memo doesn't
 * churn）。块词条在前，starter 自有词条（"App" 桶，en/zh-Hans.json）放最后，mergeCatalogs 同 key
 * 后到先赢，这样应用可以不改块源码、只在 src/i18n/*.json 里同名覆盖，就定制块默认文案。
 */
const messages = mergeCatalogs(
  layoutMessages,
  loginMessages,
  tableMessages,
  formMessages,
  treeMessages,
  crudMessages,
  comboboxMessages,
  datePickerMessages,
  adminMessages,
  shellMessages,
  { en, "zh-Hans": zhHans },
);

/** 首绘前应用主题，避免暗色闪白；与 ThemeToggle 共用 localStorage.theme 约定。 */
const THEME_SCRIPT = `(()=>{try{var t=localStorage.getItem("theme");var d=t==="dark"||((t===null||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // guards 读 context.identity；appState 喂两个 Provider。
  // ABP application-configuration 实测秒级；staleTime 内页内导航直接复用缓存，避免每次
  // 路由跳转都付一次后端往返。鉴权态变化（登录/登出/切租户/切语言）都走整页刷新，缓存随之作废。
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
        rel: "stylesheet",
        // 变量字体（wght@100..900）而非离散字重：设计系统用 510/590 这两档，静态字重取不到。
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      // SVG favicon 优先（任意尺寸不失真），.ico 给不支持的浏览器兜底
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/app-icon.svg" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: RootComponent,
});

// 模块级稳定引用，内联箭头会让 SessionContext value 每次 root 渲染都换新，
// 所有 useSession/usePermissionChecker 消费者跟着无谓重渲染。
const fetchIdentity = () => getIdentityFn();

function RootComponent() {
  const { appState } = Route.useRouteContext();
  // lang 必须跟随当前语言，不能写死：读屏发音、断行规则、字体回退与排版的 :lang() 适配
  // 全靠它。切语言走整页跳转，所以 SSR 输出的值就是最终值，不存在水合不一致。
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
        <Scripts />
      </body>
    </html>
  );
}
