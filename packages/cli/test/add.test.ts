import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchRelocation, parseJsonc, resolveRegistryDir, runAdd } from "../src/add";

function fakeWorkspace(): { root: string; app: string } {
  const root = mkdtempSync(join(tmpdir(), "jc-abp-add-"));
  mkdirSync(join(root, "registry", "auth", "routes"), { recursive: true });
  writeFileSync(join(root, "registry", "auth", "handlers.ts"), "export const h = 1;\n");
  writeFileSync(
    join(root, "registry", "auth", "routes", "api.auth.login.ts"),
    "export const r = 1;\n",
  );
  const app = join(root, "apps", "web");
  mkdirSync(app, { recursive: true });
  return { root, app };
}

describe("resolveRegistryDir", () => {
  it("walks up to find the registry dir and honors an explicit --from", () => {
    const { root, app } = fakeWorkspace();
    expect(resolveRegistryDir(app)).toBe(join(root, "registry"));
    expect(resolveRegistryDir(app, join(root, "registry"))).toBe(join(root, "registry"));
    expect(() => resolveRegistryDir(mkdtempSync(join(tmpdir(), "no-reg-")))).toThrow(/--from/);
  });
});

describe("matchRelocation", () => {
  it("matches Windows-style backslash paths against relocate rules", () => {
    const relocate = [{ dir: "routes", to: "src/routes" }];
    expect(matchRelocation("routes\\admin\\users.tsx", relocate)).toBe(relocate[0]);
    expect(matchRelocation("routes/admin/users.tsx", relocate)).toBe(relocate[0]);
    expect(matchRelocation("other\\users.tsx", relocate)).toBeUndefined();
  });
});

describe("parseJsonc", () => {
  it("strips comments and trailing commas without touching string contents", () => {
    const parsed = parseJsonc(`{
      // 行注释
      "url": "https://example.test/a", /* 块注释 */
      "note": "keep , ] and ,} and // as written",
      "list": ["a", "b", ],
    }`);

    expect(parsed).toEqual({
      url: "https://example.test/a",
      note: "keep , ] and ,} and // as written",
      list: ["a", "b"],
    });
  });
});

describe("runAdd", () => {
  it("copies the item tree into src/<name> and lists the files (no manifest)", () => {
    const { app } = fakeWorkspace();
    const result = runAdd({ name: "auth", cwd: app });
    expect(result.files).toEqual(["src/auth/handlers.ts", "src/auth/routes/api.auth.login.ts"]);
    expect(readFileSync(join(app, "src", "auth", "handlers.ts"), "utf8")).toContain("h = 1");
    expect(existsSync(join(app, "src", "auth", "routes", "api.auth.login.ts"))).toBe(true);
  });

  it("distributes files per manifest.json and rewrites relocated imports", () => {
    const root = mkdtempSync(join(tmpdir(), "jc-abp-add-m-"));
    mkdirSync(join(root, "registry", "auth", "routes"), { recursive: true });
    writeFileSync(join(root, "registry", "auth", "handlers.ts"), "export const h = 1;\n");
    writeFileSync(
      join(root, "registry", "auth", "routes", "api.auth.login.ts"),
      'import { handleLogin } from "../handlers";\nexport const r = handleLogin;\n',
    );
    writeFileSync(
      join(root, "registry", "auth", "manifest.json"),
      JSON.stringify({
        base: "src/auth",
        relocate: [{ dir: "routes", to: "src/routes", importRewrite: ["../", "../auth/"] }],
      }),
    );
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
    const result = runAdd({ name: "auth", cwd: app });
    expect(result.files).toEqual(["src/auth/handlers.ts", "src/routes/api.auth.login.ts"]);
    expect(result.files.some((file) => file.includes("\\"))).toBe(false);
    expect(readFileSync(join(app, "src", "routes", "api.auth.login.ts"), "utf8")).toContain(
      'from "../auth/handlers"',
    );
  });

  it("relocates an app dir to src/ and a root dir to the project root, dotfiles included", () => {
    const root = mkdtempSync(join(tmpdir(), "jc-abp-add-r-"));
    mkdirSync(join(root, "registry", "auth", "app"), { recursive: true });
    mkdirSync(join(root, "registry", "auth", "root"), { recursive: true });
    writeFileSync(join(root, "registry", "auth", "handlers.ts"), "export const h = 1;\n");
    writeFileSync(join(root, "registry", "auth", "app", "env.ts"), "export const e = 1;\n");
    writeFileSync(
      join(root, "registry", "auth", "root", ".env.example"),
      "VITE_APP_TITLE=ABP React Start\n",
    );
    writeFileSync(
      join(root, "registry", "auth", "manifest.json"),
      JSON.stringify({
        base: "src/auth",
        relocate: [
          { dir: "app", to: "src" },
          { dir: "root", to: "." },
        ],
      }),
    );
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });

    const result = runAdd({ name: "auth", cwd: app });

    expect(result.files).toEqual([".env.example", "src/auth/handlers.ts", "src/env.ts"]);
    expect(readFileSync(join(app, ".env.example"), "utf8")).toContain("VITE_APP_TITLE");
  });

  it("skips an existing skipIfExists target instead of failing the whole add", () => {
    const root = mkdtempSync(join(tmpdir(), "jc-abp-add-s-"));
    mkdirSync(join(root, "registry", "auth", "app"), { recursive: true });
    mkdirSync(join(root, "registry", "auth", "root"), { recursive: true });
    writeFileSync(join(root, "registry", "auth", "app", "env.ts"), "export const e = 1;\n");
    writeFileSync(join(root, "registry", "auth", "root", ".env.example"), "FROM_REGISTRY\n");
    writeFileSync(
      join(root, "registry", "auth", "manifest.json"),
      JSON.stringify({
        base: "src/auth",
        relocate: [
          { dir: "app", to: "src" },
          { dir: "root", to: ".", skipIfExists: true },
        ],
      }),
    );
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, ".env.example"), "USER_ORIGINAL\n");

    const result = runAdd({ name: "auth", cwd: app });

    expect(result.files).toEqual(["src/env.ts"]);
    expect(result.skipped).toEqual([".env.example"]);
    expect(readFileSync(join(app, ".env.example"), "utf8")).toBe("USER_ORIGINAL\n");
  });

  it("copies a file that no import rewrite touches byte-for-byte", () => {
    const root = mkdtempSync(join(tmpdir(), "jc-abp-add-bin-"));
    mkdirSync(join(root, "registry", "auth", "assets"), { recursive: true });
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80, 0x0d, 0x0a]);
    writeFileSync(join(root, "registry", "auth", "assets", "logo.png"), bytes);
    writeFileSync(
      join(root, "registry", "auth", "manifest.json"),
      JSON.stringify({ base: "src/auth" }),
    );
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });

    runAdd({ name: "auth", cwd: app });

    expect(readFileSync(join(app, "src", "auth", "assets", "logo.png")).equals(bytes)).toBe(true);
  });

  function workspaceWithManifest(manifest: unknown): { root: string; app: string } {
    const root = mkdtempSync(join(tmpdir(), "jc-abp-add-esc-"));
    mkdirSync(join(root, "registry", "auth", "routes"), { recursive: true });
    writeFileSync(join(root, "registry", "auth", "handlers.ts"), "export const h = 1;\n");
    writeFileSync(join(root, "registry", "auth", "routes", "r.ts"), "export const r = 1;\n");
    writeFileSync(join(root, "registry", "auth", "manifest.json"), JSON.stringify(manifest));
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
    return { root, app };
  }

  it("rejects a manifest base that climbs out of the project", () => {
    const { app } = workspaceWithManifest({ base: "../../escape" });
    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/escapes the project/);
    expect(existsSync(join(app, "..", "..", "escape"))).toBe(false);
  });

  it("rejects a relocate target outside the project (absolute path)", () => {
    const { app } = workspaceWithManifest({
      base: "src/auth",
      relocate: [{ dir: "routes", to: "/etc" }],
    });
    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/escapes the project/);
  });

  it("rejects a relocate target that reaches outside through a symlink inside the project", () => {
    const { app } = workspaceWithManifest({
      base: "src/auth",
      relocate: [{ dir: "routes", to: "src/link" }],
    });
    const outside = mkdtempSync(join(tmpdir(), "jc-abp-add-outside-"));
    mkdirSync(join(app, "src"), { recursive: true });
    symlinkSync(outside, join(app, "src", "link"), "dir");

    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/escapes the project/);
    expect(existsSync(join(outside, "r.ts"))).toBe(false);
  });

  it("rejects an item name with path segments", () => {
    const { app } = fakeWorkspace();
    expect(() => runAdd({ name: "../x", cwd: app })).toThrow(/invalid item name/);
  });

  it("rejects a malformed manifest with a targeted error", () => {
    const { app } = workspaceWithManifest({ base: "src", relocate: "nope" });
    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/manifest/);
  });

  it("reports a manifest that is not valid JSON at all instead of a bare SyntaxError", () => {
    const { root, app } = workspaceWithManifest({ base: "src/auth" });
    writeFileSync(join(root, "registry", "auth", "manifest.json"), '{ "base": "src/auth"');

    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/manifest\.json .*合法 JSON/);
  });

  it("refuses to overwrite an existing destination and rejects unknown items", () => {
    const { app } = fakeWorkspace();
    runAdd({ name: "auth", cwd: app });
    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/exists/i);
    expect(() => runAdd({ name: "nope", cwd: app })).toThrow(/not found/i);
  });

  it("names every conflicting destination, not just the first one", () => {
    const { app } = workspaceWithManifest({ base: "src/auth" });
    runAdd({ name: "auth", cwd: app });

    let message = "";
    try {
      runAdd({ name: "auth", cwd: app });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(join("src", "auth", "handlers.ts"));
    expect(message).toContain(join("src", "auth", "routes", "r.ts"));
  });

  function fakeWorkspaceRequiringPathAlias(): { root: string; app: string } {
    const root = mkdtempSync(join(tmpdir(), "jc-abp-add-alias-"));
    mkdirSync(join(root, "registry", "auth"), { recursive: true });
    writeFileSync(join(root, "registry", "auth", "runtime.ts"), "export const r = 1;\n");
    writeFileSync(
      join(root, "registry", "auth", "manifest.json"),
      JSON.stringify({ base: "src/auth", requiresPathAlias: "@/*" }),
    );
    const app = join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
    return { root, app };
  }

  it("fails fast with guidance when the target tsconfig parses but lacks the alias", () => {
    const { app } = fakeWorkspaceRequiringPathAlias();
    writeFileSync(
      join(app, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "#/*": ["./src/*"] } } }),
    );

    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/@\/\*/);
    expect(() => runAdd({ name: "auth", cwd: app })).toThrow(/tsconfig\.json/);
    expect(existsSync(join(app, "src"))).toBe(false);
  });

  it("accepts a jsonc tsconfig with comments and trailing commas", () => {
    const { app } = fakeWorkspaceRequiringPathAlias();
    writeFileSync(
      join(app, "tsconfig.json"),
      `{
  "compilerOptions": {
    /* Bundler mode */
    "paths": {
      "@/*": ["./src/*"], // alias into src
    },
  },
}`,
    );

    const result = runAdd({ name: "auth", cwd: app });

    expect(result.files).toEqual(["src/auth/runtime.ts"]);
  });

  it("passes through when the alias cannot be determined (missing or unparseable tsconfig)", () => {
    const missing = fakeWorkspaceRequiringPathAlias();
    expect(runAdd({ name: "auth", cwd: missing.app }).files).toEqual(["src/auth/runtime.ts"]);

    const garbled = fakeWorkspaceRequiringPathAlias();
    writeFileSync(join(garbled.app, "tsconfig.json"), "not json at all {{{");
    expect(runAdd({ name: "auth", cwd: garbled.app }).files).toEqual(["src/auth/runtime.ts"]);
  });
});
