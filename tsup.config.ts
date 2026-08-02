import { defineConfig } from "tsup";

/** Shared build for publishable packages: bundle src/index.ts to ESM + type declarations. composite/incremental are disabled here because tsup passes a single entry, not the full project file list. */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { compilerOptions: { composite: false, incremental: false } },
  clean: true,
});
