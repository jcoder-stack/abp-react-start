export { type AddResult, resolveRegistryDir, runAdd } from "./add";
export { type CliFlags, type CliInvocation, parseCliArgs } from "./args";
export {
  type ApiTarget,
  type ApiTargetInput,
  apiTargetSchema,
  type ConfigImporter,
  defineApiConfig,
  loadApiConfig,
  type ResolvedTarget,
} from "./config";
export {
  FEATURES,
  type FeatureDefinition,
  type FeatureInstallResult,
  installFeature,
  patchRootForFeatures,
} from "./feature";
export { type GenResult, type GenTargetResult, runGen } from "./gen";
export { rewriteRelativeImports } from "./import-rewrite";
export {
  type AddFeatureOptions,
  type CommandRunner,
  InitError,
  type InitOptions,
  type InitResult,
  runAddFeature,
  runInit,
} from "./init";
export { main } from "./main";
export { createOrvalConfig, type OrvalPresetOptions } from "./orval-config";
