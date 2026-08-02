import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type AddResult, findAddConflicts, parseJsonc, resolveRegistryDir, runAdd } from "./add";

const CONFIG_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/abp.api.config.ts", import.meta.url),
);

const COMPONENTS_JSON_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/components.json", import.meta.url),
);

const LIB_UTILS_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/lib-utils.ts", import.meta.url),
);

const APP_THEME_CSS_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/app-theme.css", import.meta.url),
);

const MENU_NO_ADMIN_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/menu-no-admin.tsx.tpl", import.meta.url),
);

/** app-shell's distributed src/menu.tsx references admin routes (/identity/users etc.); --no-admin overwrites it with this minimal (home-only) template so the app doesn't dead-link/fail typecheck on routes it never installed. */
const MENU_TARGET = "src/menu.tsx";

const ROOT_TEMPLATE_PATH = fileURLToPath(new URL("../templates/root.tsx.tpl", import.meta.url));
const ROUTER_TEMPLATE_PATH = fileURLToPath(new URL("../templates/router.tsx.tpl", import.meta.url));
const APP_MESSAGES_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/app-messages.json", import.meta.url),
);

/** app-shell 分发的 menu.tsx 引用 App::Home / App::System / App::Settings，而「App」桶是应用自己的，
 *  没有任何块会提供它——不播种的话侧栏直接显示原始 key。播种后归应用所有，重跑 init 不覆盖。 */
const APP_MESSAGES_TARGET = "src/i18n/app-messages.json";

/**
 * 脚手架的 __root.tsx 与 router.tsx 不接线，应用一行都跑不起来：块里的组件都要
 * AppConfigProvider/SessionProvider，路由守卫要 context.identity，react-query 要 QueryClient。
 * 这两处以前靠打印指引让用户手抄近六十行，抄漏一处就是编译不过。改为直接写模板，脚手架原版
 * 备份成 .bak——与 src/routes/index.tsx、主题 css 用的是同一套让位机制。
 */
const ROOT_TARGET = "src/routes/__root.tsx";

/** 脚手架装了 devtools 时带回 __root 的两段，缺失时留空——没装 devtools 的脚手架硬写 import 会编译不过。 */
const DEVTOOLS_IMPORTS = `import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
`;
const DEVTOOLS_ELEMENT = `        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
        />
`;
const ROUTER_TARGET = "src/router.tsx";

/** shadcn init 本该播种、但被 seedOrRequireComponentsJson 绕开后遗留的两样东西：cn() helper 与主题 CSS 变量。 */
const LIB_UTILS_TARGET = "src/lib/utils.ts";

/** components.json 里 tailwind.css 指向的入口若已含这个变量，视为已经播过主题，跳过替换。 */
const THEME_MARKER = "--background";

/** Probed in order (relative to cwd); the first existing file wins as the Tailwind css entry to seed into components.json. */
const CSS_ENTRY_CANDIDATES = [
  "src/styles/app.css",
  "src/styles.css",
  "src/index.css",
  "src/app.css",
] as const;

/** shadcn blocks in dependency order: app-shell needs abp-layout's and abp-login's components;
 *  combobox and date-picker before form (form-hook imports from both); data-table and form
 *  before abp-table; tree and form before abp-permission-sheet; all eight before admin-pages,
 *  whose routes nest under app-shell's _layout/_authed layout.
 *
 *  `registryDependencies` can't express this (shadcn resolves sibling names against the official
 *  registry and 404s), see docs/guides/install-blocks.md. admin-pages is appended separately so
 *  --no-admin can drop it. */
const SHADCN_BLOCKS = [
  "abp-layout",
  "abp-login",
  "app-shell",
  "data-table",
  "combobox",
  "date-picker",
  "form",
  "abp-crud",
  "abp-table",
  "abp-sheet",
  "tree",
  "abp-permission-sheet",
] as const;

const ADMIN_PAGES_BLOCK = "admin-pages";

/**
 * 外部脚手架 CLI 锁到已验证的 minor：本文件的多处前提都绑在具体行为上（shadcn 4.13 在缺 components.json
 * 时的 preset 变化、router-cli 的 tsr.config.json 契约），`@latest` 会在某天把它们悄悄换掉。
 * 升级时改这里并重跑一遍真实 init 端到端。
 */
const SHADCN_CLI = "shadcn@4.13";
const ROUTER_CLI = "@tanstack/router-cli@1.167";

/** Runs one non-interactive shell command; the real implementation shells out to npx, tests inject a stub. */
export type CommandRunner = (cmd: string, args: string[], cwd: string) => Promise<void>;

/** cmd.exe 认的元字符（含引号与空白）。`^` 逐字符前置后它们全部失去语法含义。 */
const CMD_METACHARS = /[()[\]%!^"`<>&|;, *?\t]/g;

/**
 * Escapes args for the `cmd.exe /d /s /c` line Node opens under `shell: true` (win32 only; a POSIX shell never sees these).
 * Two layers in order: MSVCRT quoting so the child's own argv parser recovers each argument verbatim, then a `^` before
 * every cmd metacharacter (the surrounding quotes included), so cmd's quote-parity scan never enters a quoted region and
 * an argument's `&`/`|` can never become a command separator. Carets on both halves of a `%VAR%` pair land inside the
 * variable name, which is what keeps cmd from expanding it.
 * 只覆盖 Node 打开的这一次 cmd 解析：`npx.cmd` 一类批处理垫片用 `%*` 把参数再展开一遍时会二次解析，那一层不在此函数职责内。
 */
export function quoteForWindowsShell(args: string[]): string[] {
  return args.map((arg) => {
    // MSVCRT 规则：引号前的反斜杠成对翻倍、内嵌引号写成 \"，末尾反斜杠翻倍以免吃掉收尾引号。
    const crtQuoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
    return crtQuoted.replace(CMD_METACHARS, "^$&");
  });
}

async function defaultRunner(cmd: string, args: string[], cwd: string): Promise<void> {
  const finalArgs = process.platform === "win32" ? quoteForWindowsShell(args) : args;
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(cmd, finalArgs, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/** Thrown when an init step fails; message includes what already landed since init does not roll back. */
export class InitError extends Error {
  constructor(
    message: string,
    readonly completedSteps: string[],
  ) {
    super(
      completedSteps.length > 0
        ? `${message}\n已完成: ${completedSteps.join(" → ")}`
        : `${message}\n未完成任何步骤`,
    );
    this.name = "InitError";
  }
}

export interface InitOptions {
  cwd: string;
  /** Install the admin-pages block too (default true; --no-admin sets false). */
  admin?: boolean;
  runner?: CommandRunner;
  /** Overrides the npm allow-scripts probe (see AllowScriptsProbe); tests inject one to stay off the real npm. */
  allowScriptsProbe?: AllowScriptsProbe;
}

/** What runInit did. One field per step: what the auth copy-in wrote, which blocks were
 *  installed and in what order, and which files were freshly seeded, renamed out of the way or
 *  overwritten along the way. */
export interface InitResult {
  addResult: AddResult;
  shadcnBlocks: string[];
  configPath: string;
  configSeeded: boolean;
  componentsJsonSeeded: boolean;
  componentsJsonCssPath: string | null;
  scaffoldIndexRenamed: boolean;
  menuRewrittenForNoAdmin: boolean;
  tsrConfigSeeded: boolean;
  routeTreeGenerated: boolean;
  /** __root.tsx / router.tsx 是否已写入接线模板（脚手架原版备份到同名 .bak）。 */
  rootWired: boolean;
  routerWired: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** JSON.parse 的产物是 any，先收窄成 record 再取字段，成员访问才受类型检查约束。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function findCssEntry(cwd: string): string | undefined {
  return CSS_ENTRY_CANDIDATES.find((candidate) => existsSync(resolve(cwd, candidate)));
}

/**
 * jc-abp init 需要一份指向 new-york/neutral 基线的 components.json 才能让后续 shadcn add 装出对齐本框架
 * registry block 的原语：shadcn@latest 4.13 在缺 components.json 时，无论交互还是非交互都只产出 nova/vega
 * 等 Base UI preset 系列，结构性生不出经典 new-york + Radix 基线（自己代跑 shadcn init 这条路已死）。
 * 缺失时改为自己按 CSS_ENTRY_CANDIDATES 探测 Tailwind css 入口播种一份模板；一个候选都探不到才 fail-fast，
 * 那种情况下 css 路径没法替它猜。
 */
function seedOrRequireComponentsJson(
  cwd: string,
  completed: string[],
): { seeded: boolean; cssPath: string | null } {
  const componentsJsonPath = resolve(cwd, "components.json");
  if (existsSync(componentsJsonPath)) {
    return { seeded: false, cssPath: null };
  }

  const cssPath = findCssEntry(cwd);
  if (cssPath === undefined) {
    throw new InitError(
      `未检测到 components.json（${componentsJsonPath}），也没能在常见位置探测到 Tailwind css 入口` +
        `（探测过 ${CSS_ENTRY_CANDIDATES.join(" / ")}）。请先建好 css 入口文件后重跑 jc-abp init，` +
        `或手动放一份 components.json（最小字段：style "new-york"、tailwind.baseColor "neutral"、` +
        `tailwind.css 指向你的入口，其余参照 https://ui.shadcn.com/docs/components-json）。`,
      completed,
    );
  }

  const template = readFileSync(COMPONENTS_JSON_TEMPLATE_PATH, "utf8");
  writeFileSync(componentsJsonPath, template.replace("__CSS_PATH__", cssPath));
  completed.push(`components.json（播种，css: ${cssPath}，基线 new-york/neutral）`);
  return { seeded: true, cssPath };
}

/** Seeds src/lib/utils.ts (shadcn's cn() helper) when missing; every block's files import it via @/lib/utils. No-op (idempotent) if already there. */
function seedLibUtils(cwd: string, completed: string[]): boolean {
  const utilsPath = resolve(cwd, LIB_UTILS_TARGET);
  if (existsSync(utilsPath)) return false;
  mkdirSync(dirname(utilsPath), { recursive: true });
  copyFileSync(LIB_UTILS_TEMPLATE_PATH, utilsPath);
  completed.push(`${LIB_UTILS_TARGET}（播种，shadcn cn() helper）`);
  return true;
}

/** The project's tailwind css entry: the path just seeded into components.json, or whatever a
 *  pre-existing components.json already declares under tailwind.css. Undefined if neither is
 *  available, in which case seedThemeCss skips rather than guessing. */
function resolveCssEntryPath(cwd: string, freshlySeededCssPath: string | null): string | undefined {
  if (freshlySeededCssPath) return freshlySeededCssPath;
  try {
    const parsed = asRecord(JSON.parse(readFileSync(resolve(cwd, "components.json"), "utf8")));
    const css = asRecord(parsed?.tailwind)?.css;
    return typeof css === "string" ? css : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Seeds the shadcn baseline theme CSS block (--background/--primary/... + @theme inline + @layer base) into
 * the project's css entry, since seedOrRequireComponentsJson bypasses `shadcn init` which would normally do
 * this. Every block's classes (bg-primary, text-foreground, ...) depend on these variables existing. Detects
 * "already themed" by presence of THEME_MARKER and skips; otherwise backs up the original to `<css>.bak` and
 * replaces the whole file with the template. Skips silently (no error) if the css entry can't be located or
 * doesn't exist on disk. That's a pre-existing project misconfiguration, outside init's remit.
 */
function seedThemeCss(cwd: string, cssRelPath: string | undefined, completed: string[]): boolean {
  if (cssRelPath === undefined) return false;
  const cssPath = resolve(cwd, cssRelPath);
  if (!existsSync(cssPath)) return false;
  if (readFileSync(cssPath, "utf8").includes(THEME_MARKER)) return false;

  copyFileSync(cssPath, `${cssPath}.bak`);
  copyFileSync(APP_THEME_CSS_TEMPLATE_PATH, cssPath);
  completed.push(
    `${cssRelPath}（缺主题变量，已整体替换为基线主题模板；原内容备份到 ${cssRelPath}.bak）`,
  );
  return true;
}

/** The npm packages that seedLibUtils's and seedThemeCss's templates import but never declare in
 *  any package.json. installSeededDependencies installs whichever subset the target app's
 *  manifest is missing. */
const LIB_UTILS_RUNTIME_DEPS = ["clsx", "tailwind-merge"];
const THEME_CSS_RUNTIME_DEPS = ["tw-animate-css"];

/** 生成的 src/router.tsx 用它把 QueryClient 接进 SSR 的 dehydrate/hydrate。没有任何块声明它
 *  （react-query 由 abp-crud 等块带进来，这个只有根接线用得到），所以由 init 自己装。 */
const ROOT_WIRING_RUNTIME_DEPS = ["@tanstack/react-router-ssr-query"];

const BUN_LOCKFILES = ["bun.lock", "bun.lockb"];

/**
 * Detects which package manager to shell out to for installSeededDependencies: a bun lockfile means
 * bun add, otherwise npm install. Those two are what the shipped shadcn blocks and examples are
 * validated against. The probe walks up from cwd because in a workspace/monorepo the lockfile lives
 * at the workspace root, not in the member app; picking npm there breaks on the member's own
 * `workspace:*` dependency ranges, which npm cannot parse.
 */
function detectPackageManager(cwd: string): "bun" | "npm" {
  let dir = resolve(cwd);
  while (true) {
    if (BUN_LOCKFILES.some((lockfile) => existsSync(join(dir, lockfile)))) return "bun";
    if (existsSync(join(dir, "package-lock.json"))) return "npm";
    const parent = dirname(dir);
    if (parent === dir) return "npm";
    dir = parent;
  }
}

/** npm's error code for an environment- or command-line-sourced `allow-scripts` on a project install. */
const ALLOW_SCRIPTS_REJECTION_CODE = "EALLOWSCRIPTS";

/** The npm config files npx resolves before exporting the result to its children, in npm's precedence order (project beats user). Only these can carry an `allow-scripts` into shadcn's dependency install. */
function npmrcCandidates(cwd: string): string[] {
  return [resolve(cwd, ".npmrc"), process.env.NPM_CONFIG_USERCONFIG ?? join(homedir(), ".npmrc")];
}

/** The effective `allow-scripts` in the npmrc chain, plus the file that declares it. Undefined
 *  when nothing declares one, or when the winning declaration is empty: npm accepts
 *  `allow-scripts=` from the environment, so an empty value is not the hazard
 *  `assertNpmCanInstallBlocks` looks for.
 *
 *  Only the first declaring file is consulted, empty or not. That is the one npm's precedence
 *  lets win, so a project-level `allow-scripts=` really does disarm a machine-wide one. */
function findConfiguredAllowScripts(cwd: string): { file: string; value: string } | undefined {
  for (const file of npmrcCandidates(cwd)) {
    if (!existsSync(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const match = /^[^\S\n]*allow-scripts[^\S\n]*=[^\S\n]*(.*?)[^\S\n]*$/m.exec(content);
    if (!match) continue;
    const value = match[1] ?? "";
    return value === "" ? undefined : { file, value };
  }
  return undefined;
}

/** Whether the npm on PATH rejects an environment-sourced `allow-scripts` (see assertNpmCanInstallBlocks). Injectable so tests never shell out; the default implementation reproduces the failure in a throwaway project rather than comparing npm version numbers, since only the running npm can answer this. */
export type AllowScriptsProbe = (value: string) => boolean;

function npmRejectsEnvAllowScripts(value: string): boolean {
  const probeDir = mkdtempSync(join(tmpdir(), "jc-abp-npm-probe-"));
  try {
    writeFileSync(join(probeDir, "package.json"), '{"name":"probe","private":true}\n');
    const probe = spawnSync("npm", ["install", "--dry-run", "--no-audit", "--no-fund"], {
      cwd: probeDir,
      encoding: "utf8",
      env: { ...process.env, npm_config_allow_scripts: value },
      shell: process.platform === "win32",
    });
    return `${probe.stdout ?? ""}${probe.stderr ?? ""}`.includes(ALLOW_SCRIPTS_REJECTION_CODE);
  } catch {
    // 探测本身跑不起来（npm 不在 PATH、临时目录不可写）时放行：这道闸只负责拦已证实会炸的组合。
    return false;
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
}

/**
 * Refuses to start when the machine's npm config makes every block install fail. init runs shadcn through
 * npx, npx exports the resolved npm config to its child as npm_config_*, and npm then rejects an
 * environment-sourced `allow-scripts` for a project install, so shadcn dies the moment it installs a block's
 * dependencies. Stripping the variable from the environment we hand npx does not help: npx re-derives it from
 * the npmrc chain, overriding even an explicit empty value. bun ignores this config entirely, hence the
 * package-manager gate. Runs before anything is written because init does not roll back.
 */
function assertNpmCanInstallBlocks(
  cwd: string,
  probe: AllowScriptsProbe,
  completed: string[],
): void {
  if (detectPackageManager(cwd) !== "npm") return;
  const configured = findConfiguredAllowScripts(cwd);
  if (!configured || !probe(configured.value)) return;
  throw new InitError(
    `${configured.file} 里配置了 allow-scripts，而本机的 npm 会因此拒绝 shadcn 的依赖安装` +
      `（${ALLOW_SCRIPTS_REJECTION_CODE}）：init 经 npx 启动 shadcn，npx 把解析后的 npm 配置以 ` +
      `npm_config_* 注入子进程，npm 不接受这个来源的 allow-scripts。已在开工前中止，目录未被改动。` +
      `解法任选其一：①把 allow-scripts 从 ${configured.file} 里移走（npm 提示的替代位置是本项目 ` +
      `package.json 的 "allowScripts" 字段），装完 init 再决定是否加回；②临时 npm config delete ` +
      `allow-scripts；③改用 bun——目录树里存在 bun.lock 时 shadcn 走 bun add，完全不经过这条链路。`,
    completed,
  );
}

/**
 * Refuses to re-run on a project that already went through init. init is one-shot scaffolding, not an
 * updater: it seeds config files first and only then copies the auth shell, which refuses to overwrite
 * anything, so a second run aborts mid-way, after the seeding, with no rollback. The auth shell's own
 * targets are the reliable tell (the blocks install with --overwrite and say nothing about prior runs).
 * Registry-resolution and path-alias failures are swallowed here so the real add step reports them with
 * its own fuller message.
 */
function assertNoPriorInit(cwd: string, completed: string[]): void {
  let conflicts: string[];
  try {
    conflicts = findAddConflicts({ name: "auth", cwd });
  } catch {
    return;
  }
  if (conflicts.length === 0) return;
  throw new InitError(
    `目标目录里已经有 auth 外壳的文件（${conflicts.join("、")}），说明这里跑过 jc-abp init。` +
      `init 是一次性脚手架步骤，不做增量更新，重跑会在写了一半时停下。已在开工前中止，目录未被改动。` +
      `请换一个全新的项目目录；确实要在原地重来就先删掉上一次的产物（至少这几个文件）再跑。` +
      `只想更新某个块的话用 npx shadcn add <块的 registry json> --overwrite，不必走 init。`,
    completed,
  );
}

/** Names declared under the target app's own dependencies/devDependencies. Empty if package.json
 *  is missing or unparsable, which installSeededDependencies treats as "nothing installed yet"
 *  rather than failing init over it. */
function readManifestDependencyNames(cwd: string): Set<string> {
  try {
    const pkg = asRecord(JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8")));
    return new Set([
      ...Object.keys(asRecord(pkg?.dependencies) ?? {}),
      ...Object.keys(asRecord(pkg?.devDependencies) ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

/**
 * Installs whichever of clsx/tailwind-merge/tw-animate-css the target app's package.json is still
 * missing. Gated by file existence (needsLibUtilsDeps/needsThemeCssDeps: does src/lib/utils.ts / the
 * css entry actually exist), not by whether seedLibUtils/seedThemeCss freshly wrote it *this* run.
 * A run that dies after seeding those files but before this step (the install itself failing, say)
 * leaves them on disk with nothing to remember that by on the next `jc-abp init`, so re-deriving
 * "does this app need the dependency" from the manifest each time is what makes retries actually
 * idempotent instead of leaving clsx/tailwind-merge/tw-animate-css permanently uninstalled.
 */
async function installSeededDependencies(
  cwd: string,
  needsLibUtilsDeps: boolean,
  needsThemeCssDeps: boolean,
  runner: CommandRunner,
  completed: string[],
): Promise<void> {
  const existing = readManifestDependencyNames(cwd);
  const packages = [
    ...(needsLibUtilsDeps ? LIB_UTILS_RUNTIME_DEPS : []),
    ...(needsThemeCssDeps ? THEME_CSS_RUNTIME_DEPS : []),
    ...ROOT_WIRING_RUNTIME_DEPS,
  ].filter((name) => !existing.has(name));
  if (packages.length === 0) return;

  const pm = detectPackageManager(cwd);
  const args = pm === "bun" ? ["add", ...packages] : ["install", ...packages];
  try {
    await runner(pm, args, cwd);
  } catch (error) {
    throw new InitError(
      `安装播种文件运行期依赖失败（${packages.join(", ")}）: ${errorMessage(error)}`,
      completed,
    );
  }
  completed.push(`已安装播种文件运行期依赖（${pm}）: ${packages.join(", ")}`);
}

/**
 * The scaffold's default `src/routes/index.tsx` routes to "/", the exact same path app-shell now ships
 * its own landing page to. Must run BEFORE the blocks install: we move the scaffold's file aside to `.bak`
 * so app-shell's landing can claim the path cleanly, while a user who'd customized the scaffold index can
 * still recover it. (If it ran after install it would rename app-shell's freshly written landing away.)
 * Loose match: existence alone is sufficient, since the scaffold is the only thing at this path before app-shell.
 * Returns whether it actually renamed anything.
 */
/** `layout-messages.json` → `layoutMessages`；供 __root 模板生成 import 标识符。 */
function messagesIdentifier(fileName: string): string {
  return fileName
    .replace(/\.json$/, "")
    .split("-")
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

/** src 下所有块词条文件，`@/` 别名路径，按路径排序保证同一组块每次生成的结果一致。 */
function findMessageCatalogs(cwd: string): { alias: string; identifier: string }[] {
  const srcDir = resolve(cwd, "src");
  if (!existsSync(srcDir)) return [];
  const found: { alias: string; identifier: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith("-messages.json")) {
        const rel = full
          .slice(srcDir.length + 1)
          .split(sep)
          .join("/");
        found.push({ alias: `@/${rel}`, identifier: messagesIdentifier(entry.name) });
      }
    }
  };
  walk(srcDir);
  // 应用自己的词条（src/i18n）排最后：mergeCatalogs 同名 key 后到先赢，这样改一处 json 就能
  // 覆盖块的默认文案，不必动块源码。
  const rank = (alias: string) => (alias.startsWith("@/i18n/") ? 1 : 0);
  return found.sort((a, b) => rank(a.alias) - rank(b.alias) || a.alias.localeCompare(b.alias));
}

/**
 * router.tsx 只差四处：两个 import、一个 QueryClient 实例、`context`、SSR 集成。这是真正的增量，
 * 所以就地补而不整体覆写——调用方自己的引号风格、`createRouter` 别名、其它 createRouter 选项都留着。
 * 返回 null 表示锚点没对上（脚手架换了形状），调用方退回整份模板。已接过线则原样返回，保证可重跑。
 */
export function patchRouterSource(source: string): string | null {
  if (source.includes("setupRouterSsrQueryIntegration")) return source;

  // `const router = createTanStackRouter({` —— 工厂名可能被 as 改过，连名字一起捕获。
  const call = source.match(/(\n[ \t]*)(const\s+router\s*=\s*)([A-Za-z_$][\w$]*)\(\{/);
  if (!call) return null;
  const [callLine, indent, assignment, factory] = call;

  // 选项对象里的 routeTree 那一行，context 插在它后面（同一层缩进）。
  const routeTree = source.match(/(\n([ \t]*)routeTree,)/);
  if (!routeTree) return null;

  const ret = source.match(/\n[ \t]*return\s+router;?/);
  if (!ret) return null;

  let out = source;
  out = out.replace(
    callLine,
    `${indent}const queryClient = new QueryClient();${indent}${assignment}${factory}({`,
  );
  out = out.replace(routeTree[0], `${routeTree[1]}\n${routeTree[2]}context: { queryClient },`);
  out = out.replace(
    ret[0],
    `\n  setupRouterSsrQueryIntegration({ router, queryClient });${ret[0]}`,
  );
  return `import { QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
${out}`;
}

/**
 * 接线 __root.tsx 与 router.tsx，脚手架原版备份成 .bak。
 *
 * 两者处理方式不同，因为改动性质不同：router 是加四行，就地补；__root 得把 `createRootRoute` 换成
 * `createRootRouteWithContext`、把 `shellComponent` 拆成 `component` + 文档壳，而两个 Provider 要包的
 * `<Outlet/>` 在脚手架版本里压根不存在（它走的是 shellComponent 的 children），补不出来，只能整份替换。
 *
 * 词条 import 按 src 下实际存在的 `*-messages.json` 生成，所以 --no-admin 或任何块子集都自然正确，
 * 不必维护一份块→词条的映射表。
 */
function seedRootWiring(cwd: string, completed: string[]): { root: boolean; router: boolean } {
  const appMessagesPath = resolve(cwd, APP_MESSAGES_TARGET);
  if (!existsSync(appMessagesPath)) {
    mkdirSync(dirname(appMessagesPath), { recursive: true });
    copyFileSync(APP_MESSAGES_TEMPLATE_PATH, appMessagesPath);
    completed.push(`${APP_MESSAGES_TARGET}（播种应用自有词条）`);
  }

  const catalogs = findMessageCatalogs(cwd);
  const imports = catalogs.map((c) => `import ${c.identifier} from "${c.alias}";`).join("\n");
  const args = catalogs.map((c) => c.identifier).join(", ");

  const rootPath = resolve(cwd, ROOT_TARGET);
  // 脚手架原本挂了 devtools 就带回来：整份替换不该顺手拿走用户已经装着的调试面板。
  const scaffoldRoot = existsSync(rootPath) ? readFileSync(rootPath, "utf8") : "";
  const keepDevtools = scaffoldRoot.includes("TanStackDevtools");
  if (existsSync(rootPath)) copyFileSync(rootPath, `${rootPath}.bak`);
  else mkdirSync(dirname(rootPath), { recursive: true });
  writeFileSync(
    rootPath,
    readFileSync(ROOT_TEMPLATE_PATH, "utf8")
      .replace("__DEVTOOLS_IMPORTS__", keepDevtools ? DEVTOOLS_IMPORTS : "")
      .replace("__DEVTOOLS_ELEMENT__", keepDevtools ? DEVTOOLS_ELEMENT : "")
      .replace("__MESSAGE_IMPORTS__", imports)
      .replace("__MESSAGE_ARGS__", args),
  );
  completed.push(`${ROOT_TARGET}（已接线，脚手架原版备份到 ${ROOT_TARGET}.bak）`);

  const routerPath = resolve(cwd, ROUTER_TARGET);
  const existing = existsSync(routerPath) ? readFileSync(routerPath, "utf8") : null;
  const patched = existing === null ? null : patchRouterSource(existing);
  if (existing !== null) copyFileSync(routerPath, `${routerPath}.bak`);
  else mkdirSync(dirname(routerPath), { recursive: true });
  writeFileSync(routerPath, patched ?? readFileSync(ROUTER_TEMPLATE_PATH, "utf8"));
  completed.push(
    patched === null
      ? `${ROUTER_TARGET}（认不出脚手架形状，已整份替换；原版备份到 ${ROUTER_TARGET}.bak）`
      : `${ROUTER_TARGET}（已就地补 QueryClient 接线，原版备份到 ${ROUTER_TARGET}.bak）`,
  );

  return { root: true, router: true };
}

function renameConflictingScaffoldIndex(cwd: string, completed: string[]): boolean {
  const scaffoldIndexPath = resolve(cwd, "src/routes/index.tsx");
  if (!existsSync(scaffoldIndexPath)) return false;
  renameSync(scaffoldIndexPath, `${scaffoldIndexPath}.bak`);
  completed.push(
    "src/routes/index.tsx → src/routes/index.tsx.bak（脚手架默认首页，与 app-shell 落地页同路径，已改名让位）",
  );
  return true;
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
 * Where a registry item's file ends up on disk, relative to cwd. Every file this repo's own registry emits
 * declares an explicit target (either "components/..." → src/components/..., or an already-root-relative
 * "src/..." for pages); shadcn resolves those against the project root, prefixing src/ because init always
 * leaves a src dir behind (it seeds src/lib/utils.ts before any block installs). Items without a target
 * (shadcn ui primitives pulled in via registryDependencies, not our own files[]) land under `uiDir`.
 */
function resolveArtifactTarget(file: RegistryFileEntry, uiDir: string): string {
  if (file.target) {
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

/** Runs the init steps in order, stopping at the first failure. There is no rollback: InitError
 *  names the failed step and everything already completed.
 *
 *  Steps: components.json → lib/utils.ts + theme css + their deps → auth shell → shadcn blocks
 *  in dependency order → rename a conflicting scaffold src/routes/index.tsx → --no-admin menu
 *  → tsr.config.json + route tree (best-effort) → abp.api.config.ts. */
export async function runInit(opts: InitOptions): Promise<InitResult> {
  const runner = opts.runner ?? defaultRunner;
  const blocks = opts.admin === false ? SHADCN_BLOCKS : [...SHADCN_BLOCKS, ADMIN_PAGES_BLOCK];
  const completed: string[] = [];

  // 两道前置闸都在第一次写盘之前：init 无回滚，能提前判死的组合就别让它走到半路。
  assertNoPriorInit(opts.cwd, completed);
  assertNpmCanInstallBlocks(
    opts.cwd,
    opts.allowScriptsProbe ?? npmRejectsEnvAllowScripts,
    completed,
  );

  const { seeded: componentsJsonSeeded, cssPath: componentsJsonCssPath } =
    seedOrRequireComponentsJson(opts.cwd, completed);

  seedLibUtils(opts.cwd, completed);
  const cssEntryPath = resolveCssEntryPath(opts.cwd, componentsJsonCssPath);
  seedThemeCss(opts.cwd, cssEntryPath, completed);
  await installSeededDependencies(
    opts.cwd,
    existsSync(resolve(opts.cwd, LIB_UTILS_TARGET)),
    cssEntryPath !== undefined && existsSync(resolve(opts.cwd, cssEntryPath)),
    runner,
    completed,
  );

  let addResult: AddResult;
  try {
    addResult = runAdd({ name: "auth", cwd: opts.cwd });
  } catch (error) {
    throw new InitError(`auth 外壳落位失败: ${errorMessage(error)}`, completed);
  }
  completed.push("auth 外壳（jc-abp add auth）");

  let registryDir: string;
  try {
    registryDir = resolveRegistryDir(opts.cwd);
  } catch (error) {
    throw new InitError(`定位 registry 目录失败: ${errorMessage(error)}`, completed);
  }

  // 先给脚手架默认首页让位，app-shell 才能把落地页写到 src/routes/index.tsx（若在安装后改名会把落地页误移走）。
  const scaffoldIndexRenamed = renameConflictingScaffoldIndex(opts.cwd, completed);

  for (const block of blocks) {
    const jsonPath = join(registryDir, "public", "r", `${block}.json`);
    if (!existsSync(jsonPath)) {
      throw new InitError(
        `registry 中找不到 shadcn 块 "${block}"（期望路径 ${jsonPath}）`,
        completed,
      );
    }
    try {
      // --overwrite is required alongside --yes: --yes only skips the "continue installing?" prompt,
      // not shadcn's per-file "already exists, overwrite?" prompt. Without it, a cross-block file
      // conflict (e.g. two blocks sharing label.tsx with different content) makes shadcn silently
      // abort that block's entire write batch on a non-TTY stdin while still exiting 0. The exit
      // code alone can't be trusted, hence findMissingArtifacts below.
      await runner("npx", [SHADCN_CLI, "add", jsonPath, "--yes", "--overwrite"], opts.cwd);
    } catch (error) {
      throw new InitError(`shadcn 块 "${block}" 安装失败: ${errorMessage(error)}`, completed);
    }
    const missing = findMissingArtifacts(opts.cwd, jsonPath);
    if (missing.length > 0) {
      throw new InitError(
        `shadcn 块 "${block}" 报告安装成功（exit 0），但以下声明的产物文件在磁盘上缺失，` +
          `很可能是 shadcn 静默中止了整批写入: ${missing.join(", ")}`,
        completed,
      );
    }
    completed.push(`shadcn 块 ${block}`);
  }

  let menuRewrittenForNoAdmin = false;
  if (opts.admin === false) {
    copyFileSync(MENU_NO_ADMIN_TEMPLATE_PATH, resolve(opts.cwd, MENU_TARGET));
    menuRewrittenForNoAdmin = true;
    completed.push("src/menu.tsx（--no-admin 覆写为最小菜单）");
  }

  const rootWiring = seedRootWiring(opts.cwd, completed);

  const tsrConfigPath = resolve(opts.cwd, "tsr.config.json");
  const tsrConfigSeeded = !existsSync(tsrConfigPath);
  if (tsrConfigSeeded) {
    writeFileSync(tsrConfigPath, '{\n  "target": "react"\n}\n');
    completed.push("tsr.config.json（播种，target react）");
  }
  let routeTreeGenerated = false;
  try {
    // bin 名是 tsr，但 npm 上存在同名无关包，必须走完整包名。
    await runner("npx", [ROUTER_CLI, "generate"], opts.cwd);
    routeTreeGenerated = true;
    completed.push("routeTree.gen.ts（tsr generate）");
  } catch {
    // best-effort，失败不阻断：dev/build 启动时 Vite 插件会再生。
  }

  const configPath = resolve(opts.cwd, "abp.api.config.ts");
  const configSeeded = !existsSync(configPath);
  if (configSeeded) {
    copyFileSync(CONFIG_TEMPLATE_PATH, configPath);
  }

  return {
    addResult,
    shadcnBlocks: [...blocks],
    configPath,
    configSeeded,
    componentsJsonSeeded,
    componentsJsonCssPath,
    scaffoldIndexRenamed,
    menuRewrittenForNoAdmin,
    tsrConfigSeeded,
    routeTreeGenerated,
    rootWired: rootWiring.root,
    routerWired: rootWiring.router,
  };
}
