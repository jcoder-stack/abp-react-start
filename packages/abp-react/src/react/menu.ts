import { type ReactNode, useMemo } from "react";
import { isAbpTrue } from "../core";
import { type GrantedPolicies, isGranted } from "../permissions";
import { useAppConfig } from "./app-config";
import { useSession } from "./session";

/** A declarative menu node; pruned by buildMenu against permissions / features / auth. */
export interface MenuItem<To extends string = string> {
  key: string;
  label: string;
  to?: To;
  icon?: ReactNode;
  order?: number;
  requiredPolicy?: string | string[];
  requiredFeature?: string;
  requireAuth?: boolean;
  children?: MenuItem<To>[];
}

/** Inputs buildMenu prunes against: granted policies, feature values, and auth state. */
export interface MenuBuildContext {
  grantedPolicies: GrantedPolicies;
  features?: Record<string, string | undefined>;
  isAuthenticated?: boolean;
}

function itemAllowed(item: MenuItem<string>, ctx: MenuBuildContext): boolean {
  if (item.requireAuth === true && ctx.isAuthenticated !== true) {
    return false;
  }
  if (item.requiredPolicy !== undefined && !isGranted(ctx.grantedPolicies, item.requiredPolicy)) {
    return false;
  }
  if (item.requiredFeature !== undefined && !isAbpTrue(ctx.features?.[item.requiredFeature])) {
    return false;
  }
  return true;
}

/** Prune a menu tree by permissions/features/auth; parents with no link and no surviving children are dropped; a linked parent that loses every child comes back without a `children` key at all, so renderers never draw an empty expander; sorted by order ascending. Pure. */
export function buildMenu<To extends string>(
  items: MenuItem<To>[],
  ctx: MenuBuildContext,
): MenuItem<To>[] {
  const result: MenuItem<To>[] = [];
  for (const item of items) {
    if (!itemAllowed(item, ctx)) {
      continue;
    }
    const children = item.children ? buildMenu(item.children, ctx) : undefined;
    if (
      item.children !== undefined &&
      item.to === undefined &&
      (children === undefined || children.length === 0)
    ) {
      continue;
    }
    if (children === undefined) {
      result.push(item);
    } else if (children.length === 0) {
      const { children: emptied, ...withoutChildren } = item;
      result.push(withoutChildren);
    } else {
      result.push({ ...item, children });
    }
  }
  return result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Statically concatenate multiple menu lists into one (v1: no dedup). */
export function mergeMenu<To extends string>(...lists: MenuItem<To>[][]): MenuItem<To>[] {
  return lists.flat();
}

/** Depth-first: the ancestor chain (inclusive) of the exact `to === pathname` match, else the longest `to` prefix match, else []. Pure. */
export function findBreadcrumbs<To extends string>(
  items: MenuItem<To>[],
  pathname: string,
): MenuItem<To>[] {
  let best: MenuItem<To>[] = [];
  let bestLength = -1;
  const walk = (nodes: MenuItem<To>[], trail: MenuItem<To>[]): MenuItem<To>[] | null => {
    for (const node of nodes) {
      const chain = [...trail, node];
      if (node.to === pathname) return chain;
      if (
        node.to !== undefined &&
        node.to.length > bestLength &&
        (node.to === "/"
          ? pathname === "/"
          : pathname === node.to || pathname.startsWith(`${node.to}/`))
      ) {
        best = chain;
        bestLength = node.to.length;
      }
      if (node.children) {
        const found = walk(node.children, chain);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(items, []) ?? best;
}

/** The breadcrumb chain for the given pathname against a menu tree; pass the pathname from your router. Memoized. */
export function useBreadcrumbs<To extends string>(
  items: MenuItem<To>[],
  pathname: string,
): MenuItem<To>[] {
  return useMemo(() => findBreadcrumbs(items, pathname), [items, pathname]);
}

/** The pruned menu tree for the given config, built against the current ABP context. Memoized. */
export function useMenu<To extends string>(items: MenuItem<To>[]): MenuItem<To>[] {
  const { identity } = useSession();
  const config = useAppConfig();
  return useMemo(
    () =>
      buildMenu(items, {
        grantedPolicies: identity.grantedPolicies,
        features: config.features.values,
        isAuthenticated: identity.isAuthenticated,
      }),
    [items, identity, config],
  );
}
