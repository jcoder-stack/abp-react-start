import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { CommandRunner } from "../src/blocks";
import {
  type FeatureDefinition,
  installFeature,
  patchRootForFeatures,
  resolveFeatures,
  seedFeatureAggregator,
} from "../src/feature";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

/** 只看语法：补丁产物至少得是能被编译器读懂的 TSX。 */
function syntaxErrors(source: string): string[] {
  const out = ts.transpileModule(source, {
    fileName: "__root.tsx",
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

function expectWired(patched: string | null): string {
  expect(patched).not.toBeNull();
  const out = patched ?? "";
  expect(syntaxErrors(out)).toEqual([]);
  expect(out.match(/from "@\/features";/g)).toHaveLength(1);
  expect(out).toMatch(/= mergeCatalogs\(\s*\.\.\.featureMessages[,)]/);
  expect(out).toMatch(/\.\.\.featureHead\.meta,\s*\]/);
  expect(out).toMatch(/\.\.\.featureHead\.links,\s*\]/);
  expect(out).toMatch(
    /<SessionProvider[^>]*>\s*<FeatureProviders>\s*<Outlet\s*\/>\s*<\/FeatureProviders>\s*<\/SessionProvider>/,
  );
  return out;
}

describe("patchRootForFeatures", () => {
  it.each(["root-v0.4.tsx.txt", "root-starter-v0.4.tsx.txt"])(
    "wires a 0.4 root (%s) at all three points",
    (name) => {
      expectWired(patchRootForFeatures(fixture(name)));
    },
  );

  it("leaves an already-wired root alone so reruns are no-ops", () => {
    const once = expectWired(patchRootForFeatures(fixture("root-v0.4.tsx.txt")));
    expect(patchRootForFeatures(once)).toBe(once);
  });

  it("accepts <Outlet/> without the space", () => {
    const source = fixture("root-v0.4.tsx.txt").replace("<Outlet />", "<Outlet/>");
    expectWired(patchRootForFeatures(source));
  });

  it("keeps CRLF files CRLF", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(/\n/g, "\r\n");
    const out = expectWired(patchRootForFeatures(source));
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("puts the import after the last import even when that one spans lines", () => {
    // 0.4 模板里块词条 import 排在最后；把最后一条改成多行，插入点必须落在它的 `} from` 之后。
    const source = fixture("root-v0.4.tsx.txt").replace(
      'import appMessages from "@/i18n/app-messages.json";',
      'import {\n  default as appMessages,\n} from "@/i18n/app-messages.json";',
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain('} from "@/i18n/app-messages.json";\nimport { FeatureProviders');
  });

  it("finds the import end past a trailing comment, even with a multi-line tag below", () => {
    const source = fixture("root-v0.4.tsx.txt")
      .replace(
        'import appMessages from "@/i18n/app-messages.json";',
        'import appMessages from "@/i18n/app-messages.json"; // app-owned',
      )
      .replace(
        '<Toaster richColors position="top-center" />',
        '<Toaster\n          richColors\n          position="top-center"\n        />',
      );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain(
      'import appMessages from "@/i18n/app-messages.json"; // app-owned\nimport { FeatureProviders',
    );
  });

  it("puts the import after one that ends in an import attribute", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(
      'import appMessages from "@/i18n/app-messages.json";',
      'import appMessages from "@/i18n/app-messages.json" with { type: "json" };',
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain('with { type: "json" };\nimport { FeatureProviders');
  });

  it("returns null when a multi-line import has a shape we do not know", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(
      'import appMessages from "@/i18n/app-messages.json";',
      'import {\n\n  default as appMessages,\n} from "@/i18n/app-messages.json";',
    );
    expect(patchRootForFeatures(source)).toBeNull();
  });

  it("does not leave a hole when the last link is followed by a block comment", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(
      '{ rel: "stylesheet", href: appCss },',
      '{ rel: "stylesheet", href: appCss }, /* app css */',
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).not.toContain(",,");
    expect(out).not.toContain("*/,");
    expect(out).toContain("appCss }, /* app css */");
  });

  it("puts the comma before a line comment that follows an uncommaed last link", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(
      '{ rel: "stylesheet", href: appCss },',
      '{ rel: "stylesheet", href: appCss } // app css',
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain("appCss }, // app css");
  });

  it("feeds featureMessages to an empty mergeCatalogs()", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(
      "mergeCatalogs(layoutMessages, appMessages)",
      "mergeCatalogs()",
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain("= mergeCatalogs(...featureMessages)");
  });

  it.each([
    ["the outlet is missing", (s: string) => s.replace("<Outlet />", "")],
    [
      "the outlet sits outside SessionProvider",
      (s: string) =>
        s.replace("<Outlet />", "").replace("<Toaster", "<Outlet />\n        <Toaster"),
    ],
    [
      "there are two head meta arrays",
      (s: string) => s.replace("links: [", "links: [], meta: [], links2: ["),
    ],
    [
      "the catalogs are not built with mergeCatalogs",
      (s: string) => s.replace("= mergeCatalogs(", "= combine("),
    ],
  ])("returns null (no partial patch) when %s", (_, mutate) => {
    expect(patchRootForFeatures(mutate(fixture("root-v0.4.tsx.txt")))).toBeNull();
  });
});

describe("seedFeatureAggregator", () => {
  it("seeds both aggregator files once and is a no-op afterwards", () => {
    const app = mkdtempSync(join(tmpdir(), "jc-abp-agg-"));
    expect(seedFeatureAggregator(app)).toEqual([
      "src/features/index.ts",
      "src/features/compose.ts",
    ]);
    expect(seedFeatureAggregator(app)).toEqual([]);
  });

  it("refuses to touch an app's own src/features/index.ts, writing nothing", () => {
    const app = mkdtempSync(join(tmpdir(), "jc-abp-agg-"));
    mkdirSync(join(app, "src", "features"), { recursive: true });
    writeFileSync(join(app, "src", "features", "index.ts"), 'export * from "./orders";\n');
    expect(() => seedFeatureAggregator(app)).toThrow(
      /src\/features\/index\.ts.*not the jc-abp feature aggregator/,
    );
    expect(existsSync(join(app, "src", "features", "compose.ts"))).toBe(false);
  });
});

const DEMO: FeatureDefinition = { name: "demo", env: ["DEMO_URL=http://x", "# DEMO_MODE=fast"] };

/** 一个 0.4 形态的已 init 项目 + 只含 demo 块的 registry。 */
function project(opts: { root?: string; envExample?: string; env?: string } = {}) {
  const base = mkdtempSync(join(tmpdir(), "jc-abp-feature-"));
  const registryDir = join(base, "registry");
  mkdirSync(join(registryDir, "public", "r"), { recursive: true });
  writeFileSync(
    join(registryDir, "public", "r", "demo.json"),
    JSON.stringify({
      files: [
        { path: "feature.tsx", type: "registry:file", target: "src/features/demo/feature.tsx" },
        { path: "demo.txt", type: "registry:file", target: "~/public/demo.txt" },
      ],
    }),
  );
  const app = join(base, "app");
  mkdirSync(join(app, "src", "routes"), { recursive: true });
  writeFileSync(
    join(app, "src", "routes", "__root.tsx"),
    opts.root ?? fixture("root-v0.4.tsx.txt"),
  );
  if (opts.envExample !== undefined) writeFileSync(join(app, ".env.example"), opts.envExample);
  if (opts.env !== undefined) writeFileSync(join(app, ".env"), opts.env);
  return { app, registryDir };
}

/** 像 shadcn 一样把 demo 块的两个文件写进项目。 */
function shadcn(app: string): CommandRunner {
  return async () => {
    for (const rel of ["src/features/demo/feature.tsx", "public/demo.txt"]) {
      mkdirSync(dirname(join(app, rel)), { recursive: true });
      writeFileSync(join(app, rel), "x");
    }
  };
}

const read = (app: string, rel: string) => readFileSync(join(app, rel), "utf8");

describe("installFeature", () => {
  it("wires a 0.4 project end to end and keeps the previous root next to it", async () => {
    const { app, registryDir } = project({
      envExample: "AUTH_ISSUER=\n",
      env: "AUTH_ISSUER=https://a\n",
    });
    const before = read(app, "src/routes/__root.tsx");

    const result = await installFeature({
      cwd: app,
      registryDir,
      feature: DEMO,
      runner: shadcn(app),
    });

    expect(result).toEqual({
      name: "demo",
      aggregatorSeeded: ["src/features/index.ts", "src/features/compose.ts"],
      root: "wired",
      envKeysAdded: ["DEMO_URL", "DEMO_MODE"],
    });
    expect(read(app, "src/routes/__root.tsx")).toContain("<FeatureProviders>");
    expect(read(app, "src/routes/__root.tsx.pre-features.bak")).toBe(before);
    expect(read(app, ".env.example")).toBe("AUTH_ISSUER=\nDEMO_URL=http://x\n# DEMO_MODE=fast\n");
    expect(read(app, ".env")).toBe("AUTH_ISSUER=https://a\nDEMO_URL=http://x\n# DEMO_MODE=fast\n");
  });

  it("changes nothing on a rerun", async () => {
    const { app, registryDir } = project({ envExample: "" });
    await installFeature({ cwd: app, registryDir, feature: DEMO, runner: shadcn(app) });
    const root = read(app, "src/routes/__root.tsx");
    const example = read(app, ".env.example");

    const again = await installFeature({
      cwd: app,
      registryDir,
      feature: DEMO,
      runner: shadcn(app),
    });

    expect(again).toEqual({
      name: "demo",
      aggregatorSeeded: [],
      root: "already",
      envKeysAdded: [],
    });
    expect(read(app, "src/routes/__root.tsx")).toBe(root);
    expect(read(app, ".env.example")).toBe(example);
  });

  it("never overwrites a key the env file already has, commented or not", async () => {
    const { app, registryDir } = project({ envExample: "# DEMO_URL=keep-me\n" });
    const result = await installFeature({
      cwd: app,
      registryDir,
      feature: DEMO,
      runner: shadcn(app),
    });
    expect(result.envKeysAdded).toEqual(["DEMO_MODE"]);
    expect(read(app, ".env.example")).toBe("# DEMO_URL=keep-me\n# DEMO_MODE=fast\n");
  });

  it("starts appended lines on their own line when the env file has no trailing newline", async () => {
    const { app, registryDir } = project({ envExample: "AUTH_ISSUER=" });
    await installFeature({ cwd: app, registryDir, feature: DEMO, runner: shadcn(app) });
    expect(read(app, ".env.example")).toBe("AUTH_ISSUER=\nDEMO_URL=http://x\n# DEMO_MODE=fast\n");
  });

  it("does not create a .env the project never had", async () => {
    const { app, registryDir } = project({ envExample: "" });
    await installFeature({ cwd: app, registryDir, feature: DEMO, runner: shadcn(app) });
    expect(existsSync(join(app, ".env"))).toBe(false);
  });

  it("leaves an unrecognized root byte-identical but still installs the feature", async () => {
    const odd = "export const Route = createRootRoute({ component: App });\n";
    const { app, registryDir } = project({ root: odd });
    const result = await installFeature({
      cwd: app,
      registryDir,
      feature: DEMO,
      runner: shadcn(app),
    });
    expect(result.root).toBe("manual");
    expect(read(app, "src/routes/__root.tsx")).toBe(odd);
    expect(existsSync(join(app, "src/routes/__root.tsx.pre-features.bak"))).toBe(false);
    expect(existsSync(join(app, "src/features/demo/feature.tsx"))).toBe(true);
  });

  it("fails loudly when shadcn exits 0 without writing the feature", async () => {
    const { app, registryDir } = project();
    await expect(
      installFeature({ cwd: app, registryDir, feature: DEMO, runner: async () => {} }),
    ).rejects.toThrow(/reported success \(exit 0\)/);
  });
});

describe("resolveFeatures", () => {
  const table = [DEMO, { name: "other", env: [] }];

  it("resolves known names in the order given", () => {
    expect(resolveFeatures(["other", "demo"], table).map((f) => f.name)).toEqual(["other", "demo"]);
  });

  it("names every unknown feature and what is available", () => {
    expect(() => resolveFeatures(["demo", "x", "y"], table)).toThrow(
      "unknown feature: x, y (available: demo, other)",
    );
    expect(() => resolveFeatures(["x"], [])).toThrow("unknown feature: x (available: none)");
  });
});
