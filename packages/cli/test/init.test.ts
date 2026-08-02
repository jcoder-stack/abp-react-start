import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InitError, quoteForWindowsShell, runInit } from "../src/init";

const COMPONENTS_JSON_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/components.json", import.meta.url),
);

const LIB_UTILS_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/lib-utils.ts", import.meta.url),
);

const APP_THEME_CSS_TEMPLATE_PATH = fileURLToPath(
  new URL("../templates/app-theme.css", import.meta.url),
);

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
];

interface RunnerCall {
  cmd: string;
  args: string[];
  cwd: string;
}

/**
 * A fake registry + app dir mirroring add.test.ts's fakeWorkspace, extended with public/r/*.json for every
 * shadcn block runInit may install. The app carries a components.json already (so seedOrRequireComponentsJson
 * is a no-op), plus an already-themed css entry, a pre-existing src/lib/utils.ts, and a package.json that
 * already declares clsx/tailwind-merge/tw-animate-css, so the seedLibUtils/seedThemeCss steps are no-ops
 * here too *and* installSeededDependencies has nothing left missing, keeping this helper's many non-A3
 * callers unaffected by A3 behavior. fakeWorkspaceWithoutComponentsJson covers the cold-start (seed-or-fail,
 * and fresh utils/theme seeding) case.
 */
function fakeWorkspace(): { root: string; app: string; registryDir: string } {
  const { root, app, registryDir } = fakeWorkspaceWithoutComponentsJson();
  writeFileSync(
    join(app, "components.json"),
    JSON.stringify({ style: "new-york", tailwind: { css: "src/app.css" } }),
  );
  mkdirSync(join(app, "src", "lib"), { recursive: true });
  writeFileSync(join(app, "src", "lib", "utils.ts"), "export function cn() {}\n");
  writeFileSync(
    join(app, "src", "app.css"),
    "/* already themed */\n:root { --background: white; }\n",
  );
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({
      name: "app",
      dependencies: { clsx: "^2.0.0", "tailwind-merge": "^2.0.0" },
      devDependencies: { "tw-animate-css": "^1.0.0" },
    }),
  );
  return { root, app, registryDir };
}

function fakeWorkspaceWithoutComponentsJson(): { root: string; app: string; registryDir: string } {
  const root = mkdtempSync(join(tmpdir(), "jc-abp-init-"));
  const registryDir = join(root, "registry");
  mkdirSync(join(registryDir, "auth"), { recursive: true });
  writeFileSync(join(registryDir, "auth", "handlers.ts"), "export const h = 1;\n");
  const blocksDir = join(registryDir, "public", "r");
  mkdirSync(blocksDir, { recursive: true });
  for (const block of [...SHADCN_BLOCKS, "admin-pages"]) {
    writeFileSync(join(blocksDir, `${block}.json`), "{}\n");
  }
  const app = join(root, "apps", "web");
  mkdirSync(app, { recursive: true });
  return { root, app, registryDir };
}

/** Writes a stub css file at one of runInit's CSS_ENTRY_CANDIDATES paths (relative to `app`), so seedOrRequireComponentsJson finds it. */
function writeCssEntry(app: string, relativePath: string): void {
  const fullPath = join(app, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, "/* tailwind */\n");
}

/**
 * runInit with the npm allow-scripts guard's probe stubbed to "this npm is fine". Every case except the
 * guard's own must stay independent of whatever allow-scripts the developer's ~/.npmrc declares;
 * without this the whole suite's outcome would depend on the machine it runs on. Options spread last so a
 * test can still supply its own probe.
 */
function initWithStubbedProbe(opts: Parameters<typeof runInit>[0]) {
  return runInit({ allowScriptsProbe: () => false, ...opts });
}

function recordingRunner(): {
  runner: (cmd: string, args: string[], cwd: string) => Promise<void>;
  calls: RunnerCall[];
} {
  const calls: RunnerCall[] = [];
  return {
    calls,
    runner: async (cmd, args, cwd) => {
      calls.push({ cmd, args, cwd });
    },
  };
}

describe("runInit", () => {
  it("runs auth add then the shadcn blocks in dependency order, admin-pages last", async () => {
    const { app, registryDir } = fakeWorkspace();
    const { runner, calls } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.shadcnBlocks).toEqual([...SHADCN_BLOCKS, "admin-pages"]);
    // one `shadcn add` per block (+ admin-pages), then a trailing `tsr generate`. Derived from
    // the list rather than hardcoded so adding a block does not require editing a magic number.
    const expectedCalls = SHADCN_BLOCKS.length + 2;
    // 只数 npx：依赖安装走 npm/bun，与「每块一次 add + 一次 generate」这条断言无关。
    expect(calls.filter((c) => c.cmd === "npx")).toHaveLength(expectedCalls);
    // 锁定到已验证的 minor：@latest 会把 shadcn/router-cli 的行为前提悄悄换掉。
    expect(calls.at(-1)?.args).toEqual([
      expect.stringMatching(/^@tanstack\/router-cli@\d/),
      "generate",
    ]);
    expect(calls.at(-2)?.args).toEqual([
      expect.stringMatching(/^shadcn@\d/),
      "add",
      join(registryDir, "public", "r", "admin-pages.json"),
      "--yes",
      "--overwrite",
    ]);
    expect(calls.filter((c) => c.cmd === "npx")[0]?.args).toEqual([
      expect.stringMatching(/^shadcn@\d/),
      "add",
      join(registryDir, "public", "r", "abp-layout.json"),
      "--yes",
      "--overwrite",
    ]);
    expect(calls.every((c) => c.cwd === app)).toBe(true);
    expect(existsSync(join(app, "src", "auth", "handlers.ts"))).toBe(true);
  });

  it("--no-admin (admin: false) skips admin-pages", async () => {
    const { app } = fakeWorkspace();
    const { runner, calls } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, admin: false, runner });

    expect(result.shadcnBlocks).toEqual(SHADCN_BLOCKS);
    // one `shadcn add` per block, then a trailing `tsr generate`; admin-pages is skipped.
    expect(calls.filter((c) => c.cmd === "npx")).toHaveLength(SHADCN_BLOCKS.length + 1);
    expect(calls.some((c) => c.args.some((a) => a.includes("admin-pages")))).toBe(false);
  });

  it("stops at the first failing shadcn step and does not run the rest", async () => {
    const { app } = fakeWorkspace();
    const calls: RunnerCall[] = [];
    const runner = async (cmd: string, args: string[], cwd: string): Promise<void> => {
      calls.push({ cmd, args, cwd });
      if (args.some((a) => a.includes("data-table"))) {
        throw new Error("npx exited with code 1");
      }
    };

    let caught: unknown;
    try {
      await initWithStubbedProbe({ cwd: app, runner });
    } catch (error) {
      caught = error;
    }
    // abp-layout, abp-login, app-shell, data-table (the failing attempt), and nothing after it.
    expect(calls.filter((c) => c.cmd === "npx")).toHaveLength(4);
    expect(caught).toBeInstanceOf(InitError);
    const initError = caught as InitError;
    expect(initError.message).toContain('shadcn 块 "data-table" 安装失败');
    expect(initError.completedSteps).toEqual([
      "已安装播种文件运行期依赖（npm）: @tanstack/react-router-ssr-query",
      "auth 外壳（jc-abp add auth）",
      "shadcn 块 abp-layout",
      "shadcn 块 abp-login",
      "shadcn 块 app-shell",
    ]);
  });

  it("seeds abp.api.config.ts from the template when absent", async () => {
    const { app } = fakeWorkspace();
    const { runner } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.configSeeded).toBe(true);
    const written = readFileSync(join(app, "abp.api.config.ts"), "utf8");
    expect(written).toContain('output: "src/api"');
    expect(written).toContain("localhost:44316/swagger/v1/swagger.json");
  });

  it("seeds components.json from the template using the first matching css candidate", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    // Two candidates present: src/styles/app.css must win over the lower-priority src/index.css.
    writeCssEntry(app, "src/styles/app.css");
    writeCssEntry(app, "src/index.css");
    const { runner } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.componentsJsonSeeded).toBe(true);
    expect(result.componentsJsonCssPath).toBe("src/styles/app.css");
    const written = JSON.parse(readFileSync(join(app, "components.json"), "utf8"));
    expect(written.tailwind.css).toBe("src/styles/app.css");
  });

  it("seeds components.json content matching the template (css path swapped in, everything else identical)", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/styles.css");
    const { runner } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    const template = JSON.parse(readFileSync(COMPONENTS_JSON_TEMPLATE_PATH, "utf8"));
    const written = JSON.parse(readFileSync(join(app, "components.json"), "utf8"));
    expect(written).toEqual({
      ...template,
      tailwind: { ...template.tailwind, css: "src/styles.css" },
    });
  });

  it("fails fast when neither components.json nor any css entry candidate exists, with zero side effects", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    const { runner, calls } = recordingRunner();

    let caught: unknown;
    try {
      await initWithStubbedProbe({ cwd: app, runner });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InitError);
    const initError = caught as InitError;
    expect(initError.message).toContain("未检测到 components.json");
    expect(initError.message).toContain("Tailwind css 入口");
    expect(initError.completedSteps).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(existsSync(join(app, "components.json"))).toBe(false);
    expect(existsSync(join(app, "src", "auth", "handlers.ts"))).toBe(false);
  });

  it("does not overwrite or reseed an already-existing components.json", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/app.css");
    const existing = JSON.stringify({ style: "custom-existing" });
    writeFileSync(join(app, "components.json"), existing);
    const { runner } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.componentsJsonSeeded).toBe(false);
    expect(result.componentsJsonCssPath).toBeNull();
    expect(readFileSync(join(app, "components.json"), "utf8")).toBe(existing);
  });

  it("leaves an existing abp.api.config.ts untouched", async () => {
    const { app } = fakeWorkspace();
    writeFileSync(join(app, "abp.api.config.ts"), "export default { input: 'custom' };\n");
    const { runner } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.configSeeded).toBe(false);
    expect(readFileSync(join(app, "abp.api.config.ts"), "utf8")).toBe(
      "export default { input: 'custom' };\n",
    );
  });

  it("throws InitError listing missing files when a shadcn block reports success but its declared targets never landed on disk", async () => {
    const { app, registryDir } = fakeWorkspace();
    // Simulate shadcn's exit-0-but-wrote-nothing failure mode for the 4th block (data-table):
    // declare a real files[] entry with a target, but the stub runner below never creates it.
    writeFileSync(
      join(registryDir, "public", "r", "data-table.json"),
      JSON.stringify({
        files: [
          {
            path: "ui/blocks/data-table/use-data-table.ts",
            target: "components/data-table/use-data-table.ts",
          },
        ],
      }),
    );
    const calls: RunnerCall[] = [];
    const runner = async (cmd: string, args: string[], cwd: string): Promise<void> => {
      calls.push({ cmd, args, cwd });
    };

    let caught: unknown;
    try {
      await initWithStubbedProbe({ cwd: app, runner });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InitError);
    const initError = caught as InitError;
    expect(initError.message).toContain('shadcn 块 "data-table" 报告安装成功');
    expect(initError.message).toContain("components/data-table/use-data-table.ts");
    // abp-layout, abp-login, and app-shell declare no files (their fixture json is "{}"), so they pass
    // verification trivially and land in completedSteps; data-table is where it stops.
    expect(initError.completedSteps).toEqual([
      "已安装播种文件运行期依赖（npm）: @tanstack/react-router-ssr-query",
      "auth 外壳（jc-abp add auth）",
      "shadcn 块 abp-layout",
      "shadcn 块 abp-login",
      "shadcn 块 app-shell",
    ]);
    expect(calls.filter((c) => c.cmd === "npx")).toHaveLength(4);
  });

  it("passes verification when the runner actually writes the declared target files (mirrors real shadcn --overwrite behavior)", async () => {
    const { app, registryDir } = fakeWorkspace();
    writeFileSync(
      join(registryDir, "public", "r", "form.json"),
      JSON.stringify({
        files: [
          { path: "ui/blocks/form/sheet-form.tsx", target: "components/form/sheet-form.tsx" },
        ],
      }),
    );
    const runner = async (_cmd: string, args: string[], cwd: string): Promise<void> => {
      const jsonPath = args[2];
      if (jsonPath === undefined) return;
      const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
      for (const file of parsed.files ?? []) {
        const target: string = file.target.startsWith("src/")
          ? file.target
          : join("src", file.target);
        const dest = join(cwd, target);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, "// stub\n");
      }
    };

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.shadcnBlocks).toEqual([...SHADCN_BLOCKS, "admin-pages"]);
    expect(existsSync(join(app, "src", "components", "form", "sheet-form.tsx"))).toBe(true);
  });

  it("verifies untargeted artifacts against the project's own ui alias", async () => {
    const { app, registryDir } = fakeWorkspace();
    writeFileSync(
      join(app, "components.json"),
      JSON.stringify({
        style: "new-york",
        tailwind: { css: "src/app.css" },
        aliases: { ui: "@/primitives" },
      }),
    );
    writeFileSync(
      join(app, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    // registryDependencies 拉来的 ui 原语没有 target，落点由 components.json 的 ui 别名决定。
    writeFileSync(
      join(registryDir, "public", "r", "form.json"),
      JSON.stringify({ files: [{ path: "ui/button.tsx" }] }),
    );
    const runner = async (_cmd: string, _args: string[], cwd: string): Promise<void> => {
      mkdirSync(join(cwd, "src", "primitives"), { recursive: true });
      writeFileSync(join(cwd, "src", "primitives", "button.tsx"), "// stub\n");
    };

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.shadcnBlocks).toContain("form");
  });

  it("ignores registry file entries that are not shaped like a file when verifying artifacts", async () => {
    const { app, registryDir } = fakeWorkspace();
    writeFileSync(
      join(registryDir, "public", "r", "form.json"),
      JSON.stringify({ files: ["oops", { path: 42 }, { path: "ui/x.tsx", target: "src/x.tsx" }] }),
    );
    const runner = async (_cmd: string, _args: string[], cwd: string): Promise<void> => {
      writeFileSync(join(cwd, "src", "x.tsx"), "// stub\n");
    };

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.shadcnBlocks).toContain("form");
  });

  it("seeds src/lib/utils.ts from the template when missing", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/styles.css");
    const { runner } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(readFileSync(join(app, "src", "lib", "utils.ts"), "utf8")).toBe(
      readFileSync(LIB_UTILS_TEMPLATE_PATH, "utf8"),
    );
  });

  it("does not overwrite an existing src/lib/utils.ts", async () => {
    const { app } = fakeWorkspace();
    const { runner } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(readFileSync(join(app, "src", "lib", "utils.ts"), "utf8")).toBe(
      "export function cn() {}\n",
    );
  });

  it("replaces a theme-less css entry with the baseline template, backing up the original", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/app.css");
    const { runner } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(readFileSync(join(app, "src", "app.css"), "utf8")).toBe(
      readFileSync(APP_THEME_CSS_TEMPLATE_PATH, "utf8"),
    );
    expect(readFileSync(join(app, "src", "app.css.bak"), "utf8")).toBe("/* tailwind */\n");
  });

  it("leaves a css entry that already declares --background untouched (no backup created)", async () => {
    const { app } = fakeWorkspace();
    const { runner } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(readFileSync(join(app, "src", "app.css"), "utf8")).toBe(
      "/* already themed */\n:root { --background: white; }\n",
    );
    expect(existsSync(join(app, "src", "app.css.bak"))).toBe(false);
  });

  it("installs clsx/tailwind-merge/tw-animate-css via npm install when lib/utils.ts and the theme css are both freshly seeded", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/styles.css");
    const { runner, calls } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(calls[0]).toEqual({
      cmd: "npm",
      args: [
        "install",
        "clsx",
        "tailwind-merge",
        "tw-animate-css",
        "@tanstack/react-router-ssr-query",
      ],
      cwd: app,
    });
  });

  // The lockfile probe walks up from cwd: in a workspace the lockfile sits at the root, not in the member app.
  it.each([
    ["the target app itself", (paths: { root: string; app: string }) => paths.app],
    ["the workspace root above the app", (paths: { root: string; app: string }) => paths.root],
  ])("installs seeded dependencies via bun add when bun.lock lives in %s", async (_label, pick) => {
    const paths = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(paths.app, "src/styles.css");
    writeFileSync(join(pick(paths), "bun.lock"), "");
    const { runner, calls } = recordingRunner();

    await initWithStubbedProbe({ cwd: paths.app, runner });

    expect(calls[0]).toEqual({
      cmd: "bun",
      args: ["add", "clsx", "tailwind-merge", "tw-animate-css", "@tanstack/react-router-ssr-query"],
      cwd: paths.app,
    });
  });

  it("only installs the deps still missing from package.json (theme css already themed with tw-animate-css already declared, utils freshly seeded)", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    // Pre-themed css entry (seedThemeCss is then a no-op), but no src/lib/utils.ts yet.
    writeCssEntry(app, "src/styles.css");
    writeFileSync(join(app, "src", "styles.css"), ":root { --background: white; }\n");
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify({ name: "app", devDependencies: { "tw-animate-css": "^1.0.0" } }),
    );
    const { runner, calls } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(calls[0]).toEqual({
      cmd: "npm",
      args: ["install", "clsx", "tailwind-merge", "@tanstack/react-router-ssr-query"],
      cwd: app,
    });
  });

  // Regression for the retry-idempotency bug: a run that seeds src/lib/utils.ts and the theme css but
  // dies before/at the dependency install step (e.g. the `npm install` itself failing) leaves both files
  // on disk with no seededLibUtils/seededThemeCss flag surviving to the next `jc-abp init`, so whether to
  // install must be re-derived from the target's package.json every run, not from "did this run seed it".
  it("installs still-missing seeded dependencies on a rerun where lib/utils.ts and the theme css already exist but package.json never caught up (init retried after a previous partial failure)", async () => {
    const { app } = fakeWorkspace();
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app" }));
    const { runner, calls } = recordingRunner();

    await initWithStubbedProbe({ cwd: app, runner });

    expect(calls[0]).toEqual({
      cmd: "npm",
      args: [
        "install",
        "clsx",
        "tailwind-merge",
        "tw-animate-css",
        "@tanstack/react-router-ssr-query",
      ],
      cwd: app,
    });
  });

  it("renames a scaffold-leftover src/routes/index.tsx to .bak before installing blocks so the app-shell landing can claim the path", async () => {
    const { app } = fakeWorkspace();
    mkdirSync(join(app, "src", "routes"), { recursive: true });
    writeFileSync(join(app, "src", "routes", "index.tsx"), "export default function Home() {}\n");
    const { runner } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.scaffoldIndexRenamed).toBe(true);
    expect(existsSync(join(app, "src", "routes", "index.tsx"))).toBe(false);
    expect(readFileSync(join(app, "src", "routes", "index.tsx.bak"), "utf8")).toBe(
      "export default function Home() {}\n",
    );
  });

  it("reports scaffoldIndexRenamed: false and leaves nothing behind when src/routes/index.tsx never existed", async () => {
    const { app } = fakeWorkspace();
    const { runner } = recordingRunner();

    const result = await initWithStubbedProbe({ cwd: app, runner });

    expect(result.scaffoldIndexRenamed).toBe(false);
    expect(existsSync(join(app, "src", "routes", "index.tsx.bak"))).toBe(false);
  });

  it("overwrites src/menu.tsx with the minimal menu when admin is disabled", async () => {
    const { app } = fakeWorkspace();
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "src", "menu.tsx"), "// sentinel: full menu from app-shell\n");
    const result = await initWithStubbedProbe({ cwd: app, admin: false, runner: async () => {} });
    const menu = readFileSync(join(app, "src", "menu.tsx"), "utf8");
    expect(menu).toContain('MenuItem<FileRouteTypes["to"]>');
    expect(menu).not.toContain("identity");
    expect(result.menuRewrittenForNoAdmin).toBe(true);
  });

  it("leaves src/menu.tsx alone on a default (admin) install", async () => {
    const { app } = fakeWorkspace();
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "src", "menu.tsx"), "// sentinel: full menu from app-shell\n");
    const result = await initWithStubbedProbe({ cwd: app, runner: async () => {} });
    expect(readFileSync(join(app, "src", "menu.tsx"), "utf8")).toContain("sentinel");
    expect(result.menuRewrittenForNoAdmin).toBe(false);
  });

  it("seeds tsr.config.json and runs tsr generate after the blocks", async () => {
    const { app } = fakeWorkspace();
    const calls: RunnerCall[] = [];
    const result = await initWithStubbedProbe({
      cwd: app,
      runner: async (cmd, args, cwd) => {
        calls.push({ cmd, args, cwd });
      },
    });

    expect(JSON.parse(readFileSync(join(app, "tsr.config.json"), "utf8"))).toEqual({
      target: "react",
    });
    expect(result.tsrConfigSeeded).toBe(true);
    const gen = calls.at(-1);
    expect(gen?.args).toEqual([expect.stringMatching(/^@tanstack\/router-cli@\d/), "generate"]);
    expect(result.routeTreeGenerated).toBe(true);
  });

  it("keeps an existing tsr.config.json and tolerates a failing generate", async () => {
    const { app } = fakeWorkspace();
    writeFileSync(join(app, "tsr.config.json"), '{ "target": "react", "custom": true }');

    const result = await initWithStubbedProbe({
      cwd: app,
      runner: async (_cmd, args) => {
        if (args[0]?.startsWith("@tanstack/router-cli@")) throw new Error("offline");
      },
    });

    expect(readFileSync(join(app, "tsr.config.json"), "utf8")).toContain("custom");
    expect(result.tsrConfigSeeded).toBe(false);
    expect(result.routeTreeGenerated).toBe(false);
  });
});

describe("runInit preflight", () => {
  // 这组用例要读 npmrc 链，不隔离的话结论会跟着开发机 ~/.npmrc 走：本机真有 allow-scripts 时，
  // 「空值不算命中」这条会被用户配置顶穿而假红。指向一个不存在的路径 = 用户级配置为空。
  beforeEach(() => {
    vi.stubEnv("NPM_CONFIG_USERCONFIG", join(tmpdir(), "jc-abp-absent-userconfig", ".npmrc"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Records every probe call so a test can assert the guard skipped the probe entirely, not merely that it let init through. */
  function countingProbe(rejects: boolean): { probe: (value: string) => boolean; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      probe: (value) => {
        calls.push(value);
        return rejects;
      },
    };
  }

  it("refuses to start when the npm on PATH rejects the configured allow-scripts, before seeding anything", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/styles/app.css");
    writeFileSync(join(app, ".npmrc"), "registry=https://example.test\nallow-scripts=some-pkg\n");
    const { runner, calls } = recordingRunner();
    const { probe, calls: probeCalls } = countingProbe(true);

    await expect(runInit({ cwd: app, runner, allowScriptsProbe: probe })).rejects.toThrow(
      /EALLOWSCRIPTS/,
    );

    expect(probeCalls).toEqual(["some-pkg"]);
    expect(calls).toEqual([]);
    expect(existsSync(join(app, "components.json"))).toBe(false);
    expect(existsSync(join(app, "src", "lib", "utils.ts"))).toBe(false);
    expect(existsSync(join(app, "src", "auth"))).toBe(false);
  });

  it("names the offending npmrc and a way out in the allow-scripts error", async () => {
    const { app } = fakeWorkspace();
    writeFileSync(join(app, ".npmrc"), "allow-scripts=some-pkg\n");

    await expect(
      runInit({ cwd: app, runner: async () => {}, allowScriptsProbe: () => true }),
    ).rejects.toThrow(new RegExp(`${join(app, ".npmrc").replace(/\\/g, "\\\\")}[\\s\\S]*bun`));
  });

  it("proceeds when the npm on PATH accepts that allow-scripts", async () => {
    const { app } = fakeWorkspace();
    writeFileSync(join(app, ".npmrc"), "allow-scripts=some-pkg\n");
    const { probe, calls: probeCalls } = countingProbe(false);

    const result = await runInit({ cwd: app, runner: async () => {}, allowScriptsProbe: probe });

    expect(probeCalls).toEqual(["some-pkg"]);
    expect(result.shadcnBlocks).toContain("abp-table");
  });

  it("skips the probe entirely when a bun lockfile puts the project on bun", async () => {
    const { root, app } = fakeWorkspace();
    writeFileSync(join(root, "bun.lock"), "");
    writeFileSync(join(app, ".npmrc"), "allow-scripts=some-pkg\n");
    const { probe, calls: probeCalls } = countingProbe(true);

    await runInit({ cwd: app, runner: async () => {}, allowScriptsProbe: probe });

    expect(probeCalls).toEqual([]);
  });

  it("treats an empty allow-scripts as harmless and never probes", async () => {
    const { app } = fakeWorkspace();
    writeFileSync(join(app, ".npmrc"), "allow-scripts=\n");
    const { probe, calls: probeCalls } = countingProbe(true);

    await runInit({ cwd: app, runner: async () => {}, allowScriptsProbe: probe });

    expect(probeCalls).toEqual([]);
  });

  it("refuses to re-run on a project that already carries the auth shell, before seeding anything", async () => {
    const { app } = fakeWorkspaceWithoutComponentsJson();
    writeCssEntry(app, "src/styles/app.css");
    mkdirSync(join(app, "src", "auth"), { recursive: true });
    writeFileSync(join(app, "src", "auth", "handlers.ts"), "// from an earlier init\n");
    const { runner, calls } = recordingRunner();

    await expect(initWithStubbedProbe({ cwd: app, runner })).rejects.toThrow(
      /已经有 auth 外壳的文件[\s\S]*src[/\\]auth/,
    );

    expect(calls).toEqual([]);
    expect(existsSync(join(app, "components.json"))).toBe(false);
    expect(readFileSync(join(app, "src", "auth", "handlers.ts"), "utf8")).toBe(
      "// from an earlier init\n",
    );
  });
});

describe("quoteForWindowsShell", () => {
  /** cmd.exe 的 `%VAR%` 展开发生在元字符解析之前，且只认「两个 `%` 之间是个存在的变量名」。 */
  function expandPercent(line: string, env: Record<string, string>): string {
    return line.replace(/%([^%\s]*)%/g, (whole, name: string) => env[name] ?? whole);
  }

  /** cmd.exe 的扫描：`^` 转义下一个字符（引号区内失效），未转义的 `"` 按奇偶切换引号区。返回交给子进程的命令行，以及引号区外是否留有活跃元字符：
   *  `&` 逃出引号区就成了命令分隔符。 */
  function parseThroughCmd(line: string): { childCommandLine: string; escapedMetachar: boolean } {
    let childCommandLine = "";
    let inQuotes = false;
    let escapedMetachar = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "^" && !inQuotes) {
        childCommandLine += line[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch !== undefined && "&|<>".includes(ch)) escapedMetachar = true;
      childCommandLine += ch;
    }
    return { childCommandLine, escapedMetachar };
  }

  /** 子进程侧的 MSVCRT argv 解析：`\"` 是字面引号，反斜杠只在引号前有转义含义，引号区外的空白切分参数。 */
  function parseCrtArgv(commandLine: string): string[] {
    const argv: string[] = [];
    let current = "";
    let started = false;
    let inQuotes = false;
    let backslashes = 0;
    for (const ch of commandLine) {
      if (ch === "\\") {
        backslashes += 1;
        continue;
      }
      if (ch === '"') {
        current += "\\".repeat(backslashes >> 1);
        if (backslashes % 2 === 1) current += '"';
        else inQuotes = !inQuotes;
        backslashes = 0;
        started = true;
        continue;
      }
      current += "\\".repeat(backslashes);
      backslashes = 0;
      if (!inQuotes && (ch === " " || ch === "\t")) {
        if (started) argv.push(current);
        current = "";
        started = false;
        continue;
      }
      current += ch;
      started = true;
    }
    current += "\\".repeat(backslashes);
    if (started) argv.push(current);
    return argv;
  }

  /** 把转义后的一行走完 win32 的真实链路：cmd 展开 `%VAR%` → cmd 扫描元字符与引号 → 子进程按 CRT 规则拆 argv。 */
  function throughWindows(
    args: string[],
    env: Record<string, string> = {},
  ): { argv: string[]; escapedMetachar: boolean } {
    const line = quoteForWindowsShell(args).join(" ");
    const { childCommandLine, escapedMetachar } = parseThroughCmd(expandPercent(line, env));
    return { argv: parseCrtArgv(childCommandLine), escapedMetachar };
  }

  it("keeps an odd number of embedded quotes from closing the quoted region early", () => {
    // 偶数个引号会自行配平，掩盖缺陷；奇数个才暴露「引号区提前闭合、其后的 & 逃出成命令分隔符」。
    const args = ['a" & del x'];

    const { argv, escapedMetachar } = throughWindows(args);

    expect(escapedMetachar).toBe(false);
    expect(argv).toEqual(args);
  });

  it("delivers paths with spaces and metacharacters to the child verbatim", () => {
    const args = ["C:\\Users\\John Doe\\x.json", "shadcn@latest", "a&b(c)|d<e>f"];

    const { argv, escapedMetachar } = throughWindows(args);

    expect(escapedMetachar).toBe(false);
    expect(argv).toEqual(args);
  });

  it("stops cmd from expanding %VAR% inside an argument", () => {
    const args = ["%TMP%\\r\\app-shell.json"];

    const { argv, escapedMetachar } = throughWindows(args, { TMP: "C:\\evil & del" });

    expect(escapedMetachar).toBe(false);
    expect(argv).toEqual(args);
  });
});
