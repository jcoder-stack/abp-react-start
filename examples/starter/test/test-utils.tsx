import type { Identity } from "@jcoder-stack/abp-react/auth";
import type { ApplicationConfiguration } from "@jcoder-stack/abp-react/core";
import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { AppConfigProvider, SessionProvider } from "@jcoder-stack/abp-react/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import layoutMessages from "@/components/abp/layout/layout-messages.json";
import { SidebarProvider } from "@/components/ui/sidebar";

// jsdom 无 matchMedia；sidebar 的 useIsMobile 需要它。
if (typeof window !== "undefined" && window.matchMedia === undefined) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom 无 PointerEvent/hasPointerCapture/scrollIntoView；Radix 的 DropdownMenu/Dialog
// 触发器靠 onPointerDown 开合、内容区靠 hasPointerCapture 判定拖拽，测试环境需要垫上这些。
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}
if (typeof Element !== "undefined" && Element.prototype.hasPointerCapture === undefined) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// jsdom 无 ResizeObserver；Radix Accordion 用它测内容高度做开合动画。
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}
if (typeof Element !== "undefined" && Element.prototype.scrollIntoView === undefined) {
  Element.prototype.scrollIntoView = () => {};
}

/** 相对系统时钟造一个偏离当前月 `count` 个月的夹具日期。写死年月的日期夹具跨月即失效，
 * 日期选择器的用例必须跟着时钟走。`day` 取 15 以避开月末天数不齐带来的溢出。 */
export function monthsAgo(count: number, day = 15): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - count, day);
}

/** react-day-picker 月历标题（`<table aria-label>`）的匹配式。只锚定月名与年份，
 * 不绑定库的排版细节。 */
export function monthCaption(date: Date): RegExp {
  return new RegExp(`${date.toLocaleString("en-US", { month: "long" })}\\s+${date.getFullYear()}`);
}

export const anonymous: Identity = {
  isAuthenticated: false,
  user: null,
  grantedPolicies: {},
  tenant: null,
};

export const admin: Identity = {
  isAuthenticated: true,
  user: { id: "1", userName: "admin", email: "admin@abp.io", roles: ["admin"] },
  grantedPolicies: { "AbpIdentity.Users": true },
  tenant: null,
};

export function makeConfig(
  overrides: Partial<ApplicationConfiguration> = {},
): ApplicationConfiguration {
  return {
    currentUser: { isAuthenticated: false, id: null, userName: null, tenantId: null, roles: [] },
    auth: { grantedPolicies: {} },
    setting: { values: {} },
    localization: {
      currentCulture: { name: "en" },
      languages: [
        { cultureName: "en", displayName: "English" },
        { cultureName: "zh-Hans", displayName: "简体中文" },
      ],
      values: {},
    },
    currentTenant: { id: null, name: null, isAvailable: true },
    features: { values: {} },
    ...overrides,
  };
}

/** 布局组件测试挂具：<Link>/useRouterState 需要真实 Router，ui 挂在内存路由根组件上。 */
export function renderWithProviders(
  ui: ReactNode,
  opts: {
    identity?: Identity;
    config?: ApplicationConfiguration;
    path?: string;
    messages?: FrontendCatalog;
  } = {},
) {
  const rootRoute = createRootRoute({ component: () => <SidebarProvider>{ui}</SidebarProvider> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [opts.path ?? "/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider
        config={opts.config ?? makeConfig()}
        messages={opts.messages ?? layoutMessages}
        fallbackCulture="en"
      >
        <SessionProvider identity={opts.identity ?? anonymous}>
          {/* biome-ignore lint/suspicious/noExplicitAny: 测试挂具的最简根路由树 */}
          <RouterProvider router={router as any} />
        </SessionProvider>
      </AppConfigProvider>
    </QueryClientProvider>,
  );
}
