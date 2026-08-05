import { parseCookieHeader, parseCultureCookie } from "@jcoder-stack/abp-react/auth";
import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { CULTURE_COOKIE } from "@jcoder-stack/abp-react/proxy";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { Component, type ReactNode, useCallback, useEffect, useState } from "react";
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
function RouteErrorBody({ error }: ErrorComponentProps) {
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
        <p className="space-x-4 text-sm">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            {L("Shell:BackHome")}
          </Link>
          {/* 权限不够的正解常常是换个账号;注销是鉴权态变化,必须整页跳转 */}
          <a href="/api/auth/logout" className="text-primary underline-offset-4 hover:underline">
            {L("Shell:SignOut")}
          </a>
        </p>
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

interface LastResortState {
  failed: boolean;
}

/**
 * 错误页自身的保险丝。RouteError 是全应用的最后一道可见边界,它若在渲染中抛错,root 之上再无
 * React 边界,结果是整树卸载白屏。这里包一层零依赖的 class 边界(渲染错误只有 componentDidCatch
 * 能接),fallback 为硬编码英文的静态 HTML——刻意不碰词条、路由、任何可能跟着一起坏的东西。
 * 正常运行永远不可见;只有 shell-boundary 自己被改坏时才出场,把白屏降级为可操作的提示。
 */
class LastResortBoundary extends Component<{ children: ReactNode }, LastResortState> {
  state: LastResortState = { failed: false };

  static getDerivedStateFromError(): LastResortState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="space-y-2 p-6">
        <h1 className="text-2xl font-normal">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The error page itself failed to render. Reload the page, or go back home.
        </p>
        <p className="space-x-4 text-sm">
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <a href="/" className="underline underline-offset-4">
            Home
          </a>
        </p>
      </section>
    );
  }
}

/** 路由错误边界(见 RouteErrorBody 的分支说明),外层套 LastResortBoundary 防错误页自炸成白屏。 */
export function RouteError(props: ErrorComponentProps) {
  return (
    <LastResortBoundary>
      <RouteErrorBody {...props} />
    </LastResortBoundary>
  );
}

export function RouteNotFound() {
  const L = useShellLocalization();
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-normal">{L("Shell:NotFound")}</h1>
      <p className="space-x-4 text-sm">
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          {L("Shell:BackHome")}
        </Link>
        <a href="/api/auth/logout" className="text-primary underline-offset-4 hover:underline">
          {L("Shell:SignOut")}
        </a>
      </p>
    </section>
  );
}
