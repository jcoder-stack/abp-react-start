import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJsonc } from "./add";

/** Runs one non-interactive shell command; the real implementation shells out to npx, tests inject a stub. */
export type CommandRunner = (cmd: string, args: string[], cwd: string) => Promise<void>;

/**
 * 外部脚手架 CLI 锁到已验证的 minor：shadcn 4.13 在缺 components.json 时的 preset 变化等前提都绑在
 * 具体行为上，`@latest` 会在某天把它们悄悄换掉。升级时改这里并重跑一遍真实 init 端到端。
 */
export const SHADCN_CLI = "shadcn@4.13";

/** JSON.parse 的产物是 any，先收窄成 record 再取字段，成员访问才受类型检查约束。 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

interface RegistryFileEntry {
  path: string;
  target?: string;
}

function readJsonFile(
  path: string,
  parse: (text: string) => unknown,
): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return asRecord(parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

/** Where shadcn drops a registry file that declares no target: the project's own `ui` alias
 *  from components.json, walked through tsconfig `paths`. So `"@/primitives"` with
 *  `"@/*": ["./src/*"]` resolves to `src/primitives`.
 *
 *  Falls back to the default `src/components/ui` when either side is missing or unresolvable.
 *  A wrong guess here would report installed artifacts as missing and abort init. */
function resolveUiDir(cwd: string): string {
  const fallback = join("src", "components", "ui");
  const alias = asRecord(readJsonFile(resolve(cwd, "components.json"), JSON.parse)?.aliases)?.ui;
  if (typeof alias !== "string") return fallback;
  const tsconfig = readJsonFile(resolve(cwd, "tsconfig.json"), parseJsonc);
  const paths = asRecord(asRecord(tsconfig?.compilerOptions)?.paths) ?? {};
  for (const [pattern, targets] of Object.entries(paths)) {
    const prefix = pattern.endsWith("/*") ? pattern.slice(0, -1) : undefined;
    if (prefix === undefined || !alias.startsWith(prefix)) continue;
    const first = Array.isArray(targets) ? targets[0] : undefined;
    if (typeof first !== "string" || !first.endsWith("/*")) continue;
    return join(first.slice(0, -2), alias.slice(prefix.length));
  }
  return fallback;
}

/**
 * Where a registry item's file ends up on disk, relative to cwd. `~/…` is shadcn's project-root
 * prefix (public/ assets, config files); other explicit targets are either "components/..." →
 * src/components/..., or an already-root-relative "src/..." for pages. Items without a target
 * (shadcn ui primitives pulled in via registryDependencies) land under `uiDir`.
 */
function resolveArtifactTarget(file: RegistryFileEntry, uiDir: string): string {
  if (file.target) {
    if (file.target.startsWith("~/")) return file.target.slice(2);
    return file.target.startsWith("src/") ? file.target : join("src", file.target);
  }
  return join(uiDir, file.path.split("/").pop() ?? file.path);
}

function isRegistryFileEntry(value: unknown): value is RegistryFileEntry {
  const entry = asRecord(value);
  if (typeof entry?.path !== "string") return false;
  return entry.target === undefined || typeof entry.target === "string";
}

/** Reads a shadcn block's own registry JSON and returns which of its declared file targets are
 *  missing on disk. That's the tell for shadcn silently aborting a batch write while still
 *  exiting 0. */
function findMissingArtifacts(cwd: string, jsonPath: string): string[] {
  let files: RegistryFileEntry[];
  try {
    const declared = asRecord(JSON.parse(readFileSync(jsonPath, "utf8")))?.files;
    files = Array.isArray(declared) ? declared.filter(isRegistryFileEntry) : [];
  } catch {
    return [];
  }
  const uiDir = resolveUiDir(cwd);
  return files
    .map((file) => resolveArtifactTarget(file, uiDir))
    .filter((relTarget) => !existsSync(resolve(cwd, relTarget)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `shadcn add` one block from the registry's built json, then verify every declared file landed:
 * shadcn can silently abort a whole write batch on a non-TTY stdin while still exiting 0.
 * Throws a plain Error naming the block; callers decide how to wrap it.
 */
export async function installShadcnBlock(
  cwd: string,
  registryDir: string,
  block: string,
  runner: CommandRunner,
): Promise<void> {
  const jsonPath = join(registryDir, "public", "r", `${block}.json`);
  if (!existsSync(jsonPath)) {
    throw new Error(`shadcn block "${block}" not found in the registry (expected at ${jsonPath})`);
  }
  try {
    // --overwrite is required alongside --yes: --yes only skips the "continue installing?" prompt,
    // not shadcn's per-file "already exists, overwrite?" prompt. Without it, a cross-block file
    // conflict (e.g. two blocks sharing label.tsx with different content) makes shadcn silently
    // abort that block's entire write batch on a non-TTY stdin while still exiting 0, hence
    // findMissingArtifacts below.
    // npx 自身的 -y：交互终端下（用户真实场景）npx 首次下载 CLI 会停在 "Ok to proceed?" 等确认，
    // init 的进度输出会把这个提问淹没，看起来像挂死。非 TTY 下 npx 本就静默继续，加了也无副作用。
    await runner("npx", ["-y", SHADCN_CLI, "add", jsonPath, "--yes", "--overwrite"], cwd);
  } catch (error) {
    throw new Error(`installing shadcn block "${block}" failed: ${errorMessage(error)}`);
  }
  const missing = findMissingArtifacts(cwd, jsonPath);
  if (missing.length > 0) {
    throw new Error(
      `shadcn block "${block}" reported success (exit 0), but these declared files are missing on disk — ` +
        `most likely shadcn silently aborted the whole write batch: ${missing.join(", ")}`,
    );
  }
}
