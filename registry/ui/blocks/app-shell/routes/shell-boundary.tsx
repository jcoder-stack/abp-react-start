import { parseCookieHeader, parseCultureCookie } from "@jcoder-stack/abp-react/auth";
import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { CULTURE_COOKIE } from "@jcoder-stack/abp-react/proxy";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import shellMessages from "./_layout/shell-messages.json";

/**
 * 根路由的错误/404 边界。**刻意不经 AppConfigProvider**：TanStack Router 给根路由的 CatchBoundary
 * 包在 `component`（RootComponent，Provider 在它内部）外层。出错时整棵 Provider 子树被 fallback 替换，
 * useLocalization 在这里必然炸（无 Provider）。故自建一个只读 shell-messages.json 的最小 translator；
 * culture 只在客户端挂载后从 culture cookie 解析（不把 server-only 的请求头读取拉进客户端 bundle），
 * 挂载前统一渲染 fallbackCulture 文案，SSR 与客户端首屏因此一致，不产生 hydration 警告。
 */
function useShellLocalization(): (key: string) => string {
  const [culture, setCulture] = useState("en");
  useEffect(() => {
    const detected = parseCultureCookie(parseCookieHeader(document.cookie)[CULTURE_COOKIE]);
    if (detected && detected in shellMessages) setCulture(detected);
  }, []);
  return useCallback(
    (key: string) => {
      const catalog = shellMessages as FrontendCatalog;
      const value = catalog[culture]?.[""]?.[key] ?? catalog.en?.[""]?.[key];
      return typeof value === "string" ? value : key;
    },
    [culture],
  );
}

/** 路由错误边界：结构化错误都带 `status`（hook 的 AbpApiError 或 app-state/refresh 的 HttpError），故用鸭子类型把 403/401 渲染成权限/登录提示，而非 instanceof 单一类。 */
export function RouteError({ error }: ErrorComponentProps) {
  const L = useShellLocalization();
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: number }).status
      : undefined;
  if (status === 403) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-normal">{L("Shell:Forbidden")}</h1>
        <p className="text-sm text-muted-foreground">{L("Shell:ForbiddenBody")}</p>
        <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
          {L("Shell:BackHome")}
        </Link>
      </section>
    );
  }
  if (status === 401) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-normal">{L("Shell:Unauthorized")}</h1>
        <p className="text-sm text-muted-foreground">{L("Shell:SessionExpired")}</p>
        <a
          href="/api/auth/login"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {L("Shell:SignIn")}
        </a>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-normal">{L("Shell:UnexpectedError")}</h1>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : L("Shell:UnknownError")}
      </p>
      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        {L("Shell:BackHome")}
      </Link>
    </section>
  );
}

export function RouteNotFound() {
  const L = useShellLocalization();
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-normal">{L("Shell:NotFound")}</h1>
      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        {L("Shell:BackHome")}
      </Link>
    </section>
  );
}
