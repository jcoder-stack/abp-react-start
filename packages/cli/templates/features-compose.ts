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
      return mod === undefined ? [] : [mod.default];
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
