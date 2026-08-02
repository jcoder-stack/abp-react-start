import { redirect } from "@tanstack/react-router";
import type { Identity } from "../auth";
import { isGranted, type PermissionStrategy } from "../permissions";

/** guard 期望的路由上下文：祖先路由（__root beforeLoad）已放入 identity。 */
export interface GuardContext {
  identity: Identity;
}

export interface RequirePermissionOptions {
  /** 缺权限时跳转目标（默认 "/forbidden"）。 */
  redirectTo?: string;
  /** 多策略组合方式（默认 "all"）。 */
  strategy?: PermissionStrategy;
  /** 给出时，未认证访客先被送去登录（带 returnUrl）而非 403；不给则匿名一律 403。 */
  loginPath?: string;
}

// identity 缺失是宿主接线错误：requireAuth 若按 falsy 处理会静默重定向登录，掩盖真因，故显式抛错。
function requireIdentity(context: GuardContext, guardName: string): Identity {
  const identity = (context as Partial<GuardContext>).identity;
  if (identity === undefined) {
    throw new Error(
      `${guardName}: context.identity missing — inject identity in an ancestor route's beforeLoad (see __root)`,
    );
  }
  return identity;
}

/**
 * beforeLoad 守卫工厂：缺权限时 redirect（默认 /forbidden）。纯 UX，安全判定在 ABP。
 * 匿名访客的 grantedPolicies 恒为空，默认因此得到 403；推荐把整个受保护子树挂在
 * `requireAuth()` 父路由下，或给本守卫传 `loginPath` 让匿名先去登录。
 * context 缺 identity 时抛 Error。
 */
export function requirePermission(policy: string | string[], opts: RequirePermissionOptions = {}) {
  return ({ context, location }: { context: GuardContext; location?: { href: string } }): void => {
    const identity = requireIdentity(context, "requirePermission");
    if (isGranted(identity.grantedPolicies, policy, { strategy: opts.strategy })) return;
    if (opts.loginPath !== undefined && !identity.isAuthenticated) {
      throw redirect({ href: withReturnUrl(opts.loginPath, location?.href ?? "/") });
    }
    throw redirect({ to: opts.redirectTo ?? "/forbidden" });
  };
}

// loginPath 允许自带 query（如 ?provider=x），拼死 "?" 会产出 "?...?..." 这种非法 URL。
function withReturnUrl(loginPath: string, href: string): string {
  const separator = loginPath.includes("?") ? "&" : "?";
  return `${loginPath}${separator}returnUrl=${encodeURIComponent(href)}`;
}

/** beforeLoad 守卫工厂：未认证时 redirect 到 OIDC 登录（带 returnUrl）。loginPath 自带 query 时用 & 续接。context 缺 identity 时抛 Error。 */
export function requireAuth(opts: { loginPath?: string } = {}) {
  return ({ context, location }: { context: GuardContext; location: { href: string } }): void => {
    const identity = requireIdentity(context, "requireAuth");
    if (!identity.isAuthenticated) {
      throw redirect({ href: withReturnUrl(opts.loginPath ?? "/api/auth/login", location.href) });
    }
  };
}
