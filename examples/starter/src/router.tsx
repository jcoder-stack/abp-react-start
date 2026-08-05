import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { RouteError, RouteNotFound } from "@/routes/shell-boundary";
import { routeTree } from "./routeTree.gen";

/** Create a per-request router with a fresh QueryClient wired for SSR dehydrate/hydrate. */
export function getRouter() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    // 路由级默认边界:每条路由的错误/404 渲染在自己的位置上,壳内页面出错侧栏保持在位;
    // 页面不必再各自挂 errorComponent。root 的显式挂载仍在(它兜 beforeLoad 的失败)。
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
    // 悬停即预载目标路由模块与 beforeLoad（appState 已有 staleTime 缓存，预载不产生额外后端往返）。
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
