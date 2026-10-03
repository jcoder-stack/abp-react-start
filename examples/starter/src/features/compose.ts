import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { type ComponentType, createElement, type JSX, type ReactNode } from "react";

/** What `src/features/<name>/feature.tsx` default-exports. Every field is optional. */
export interface FeatureModule {
  /** Wraps the app inside SessionProvider, so it can read the session and the app config. */
  Provider?: ComponentType<{ children: ReactNode }>;
  head?: { meta?: JSX.IntrinsicElements["meta"][]; links?: JSX.IntrinsicElements["link"][] };
  messages?: FrontendCatalog;
}

export interface ComposedFeatures {
  FeatureProviders: ComponentType<{ children: ReactNode }>;
  featureHead: { meta: JSX.IntrinsicElements["meta"][]; links: JSX.IntrinsicElements["link"][] };
  featureMessages: FrontendCatalog[];
}

function isFeatureModule(value: unknown): value is FeatureModule {
  return typeof value === "object" && value !== null;
}

/**
 * Folds the installed feature modules into what __root.tsx consumes. Folder order fixes both the
 * provider nesting and the catalog merge order, so every build composes the same way.
 */
export function composeFeatures(
  modules: Record<string, { default: FeatureModule }>,
): ComposedFeatures {
  const features = Object.keys(modules)
    .sort()
    .flatMap((path) => {
      const mod = modules[path];
      if (mod === undefined) return [];
      // 类型说 default 一定在；漏写 default export 的 feature.tsx 会在每条路由上炸成「reading 'Provider'」，这里点名文件。
      if (!isFeatureModule(mod.default))
        throw new Error(`${path} must default-export a FeatureModule`);
      return [mod.default];
    });
  const providers = features.flatMap((feature) => (feature.Provider ? [feature.Provider] : []));

  function FeatureProviders({ children }: { children: ReactNode }) {
    return providers.reduceRight<ReactNode>(
      (inner, Provider) => createElement(Provider, null, inner),
      children,
    );
  }

  return {
    FeatureProviders,
    featureHead: {
      meta: features.flatMap((feature) => feature.head?.meta ?? []),
      links: features.flatMap((feature) => feature.head?.links ?? []),
    },
    featureMessages: features.flatMap((feature) => (feature.messages ? [feature.messages] : [])),
  };
}
