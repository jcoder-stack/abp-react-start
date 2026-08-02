import { defineConfig } from "tsup";

/** 每个子路径导出一个 entry，产出 dist/<域>.js + .d.ts。刻意不关 esm code splitting：跨域共享的模块
 * （logger、core 的错误类）必须在各子路径间保持同一份实例，否则消费者对 `/proxy` 抛出的错误做
 * `instanceof HttpError`（从 `/core` 引入）会失败。composite/incremental 在 dts 里关掉，tsup 传的是
 * 单个 entry 而非完整工程文件列表。 */
export default defineConfig({
  entry: {
    core: "src/core/index.ts",
    permissions: "src/permissions/index.ts",
    i18n: "src/i18n/index.ts",
    logger: "src/logger/index.ts",
    auth: "src/auth/index.ts",
    proxy: "src/proxy/index.ts",
    react: "src/react/index.ts",
    router: "src/router/index.ts",
  },
  format: ["esm"],
  dts: { compilerOptions: { composite: false, incremental: false } },
  clean: true,
});
