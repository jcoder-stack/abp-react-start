import { composeFeatures, type FeatureModule } from "./compose";

export type { FeatureModule } from "./compose";

/**
 * Optional features (`jc-abp add <name>` / `jc-abp init --with`) each live in ./<name>/feature.tsx.
 * The entry is named feature.tsx, not index.tsx, so an app's own src/features/<module>/index.tsx
 * business code is never swept into the root bundle by this eager glob.
 */
export const { FeatureProviders, featureHead, featureMessages } = composeFeatures(
  import.meta.glob<{ default: FeatureModule }>("./*/feature.tsx", { eager: true }),
);
