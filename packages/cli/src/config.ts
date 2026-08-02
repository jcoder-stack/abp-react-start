import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/** One jc-abp gen target: swagger source, output root, and the zod-schemas toggle. */
export const apiTargetSchema = z.object({
  input: z.string().min(1),
  output: z.string().default("src/api"),
  zod: z.boolean().default(true),
});
export type ApiTarget = z.infer<typeof apiTargetSchema>;
export type ApiTargetInput = z.input<typeof apiTargetSchema>;

/** A resolved gen target plus its config name (undefined for a single-target config). */
export interface ResolvedTarget extends ApiTarget {
  name?: string;
}

/** Multi-target config shape: `{ targets: { identity: {...}, business: {...} } }`. */
const multiTargetSchema = z.object({ targets: z.record(z.string(), apiTargetSchema) });

/** Identity helper giving abp.api.config authors completion. Accepts a single target or a
 *  `{ targets }` map. */
export function defineApiConfig<
  T extends ApiTargetInput | { targets: Record<string, ApiTargetInput> },
>(config: T): T {
  return config;
}

const CONFIG_FILES = ["abp.api.config.ts", "abp.api.config.js", "abp.api.config.json"];

/** 动态 import 的注入点；默认走真实 `import()`，测试用它模拟运行时拒绝加载 TypeScript。 */
export type ConfigImporter = (url: string) => Promise<{ default?: Record<string, unknown> }>;

const defaultImporter: ConfigImporter = (url) =>
  import(url) as Promise<{ default?: Record<string, unknown> }>;

function isUnknownFileExtension(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "ERR_UNKNOWN_FILE_EXTENSION" ||
    (typeof message === "string" && message.includes("Unknown file extension"))
  );
}

async function readConfigFile(path: string, importModule: ConfigImporter) {
  if (path.endsWith(".json")) {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  }
  let mod: { default?: Record<string, unknown> };
  try {
    mod = await importModule(pathToFileURL(path).href);
  } catch (error) {
    // Node <22.18 无法直接执行 TypeScript，而 `jc-abp init` 默认播种 .ts 配置。
    // 裸的 ERR_UNKNOWN_FILE_EXTENSION 完全指不到「换个运行时或换 .json」这个出路。
    if (/\.m?ts$/.test(path) && isUnknownFileExtension(error)) {
      throw new Error(
        `无法加载 ${path}：.ts 配置需要运行时能直接执行 TypeScript（Bun，或 Node ≥22.18 的 strip-types）；更老的 Node 请改用 abp.api.config.json`,
        { cause: error },
      );
    }
    throw error;
  }
  if (mod.default === undefined) {
    // 没有 default 时落回空对象，报错会变成「input 必填」，把用户指向一个完全无关的字段。
    throw new Error(
      `${path} 必须用 default export 导出配置：写成 \`export default defineApiConfig({ input: "..." })\`（\`export const config = {...}\` 不会被读取）`,
    );
  }
  return mod.default;
}

/** Resolve the effective targets: a `{ targets }` map yields one ResolvedTarget per entry and rejects any non-undefined override; otherwise a single target from the config file merged with flag overrides (undefined ignored). */
export async function loadApiConfig(opts: {
  cwd: string;
  configPath?: string;
  overrides?: Partial<ApiTargetInput>;
  importModule?: ConfigImporter;
}): Promise<ResolvedTarget[]> {
  const explicit = opts.configPath ? resolve(opts.cwd, opts.configPath) : undefined;
  // 用户点名的 --config 打错路径时必须报错。静默落回空配置会让报错落在毫不相干的 input 缺失上。
  if (explicit !== undefined && !existsSync(explicit)) {
    throw new Error(`config file not found: ${explicit}`);
  }
  const found =
    explicit ?? CONFIG_FILES.map((f) => resolve(opts.cwd, f)).find((f) => existsSync(f));
  const fromFile =
    found && existsSync(found)
      ? await readConfigFile(found, opts.importModule ?? defaultImporter)
      : {};
  if ("targets" in fromFile) {
    // 多 target 下 flags 无从落到某一个 target；静默忽略会让用户以为 --input 生效，
    // 实际按旧配置重新生成并覆盖 output 目录。
    const given = Object.entries(opts.overrides ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key]) => `--${key}`);
    if (given.length > 0) {
      throw new Error(
        `多 target 配置下命令行 ${given.join("/")} 不生效：请改写配置文件里对应 target，或用 --config 指定一份单 target 配置`,
      );
    }
    const parsed = multiTargetSchema.parse(fromFile);
    return Object.entries(parsed.targets).map(([name, target]) => ({ name, ...target }));
  }
  const merged: Record<string, unknown> = { ...fromFile };
  for (const [key, value] of Object.entries(opts.overrides ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return [apiTargetSchema.parse(merged)];
}
