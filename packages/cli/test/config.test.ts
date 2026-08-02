import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadApiConfig } from "../src/config";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "jc-abp-config-"));
}

describe("loadApiConfig", () => {
  it("loads abp.api.config.ts and applies defaults", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "abp.api.config.ts"), `export default { input: "./swagger.json" };\n`);
    const [target] = await loadApiConfig({ cwd });
    expect(target).toEqual({ input: "./swagger.json", output: "src/api", zod: true });
  });

  it("falls back to abp.api.config.json and merges flag overrides (undefined ignored)", async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, "abp.api.config.json"),
      JSON.stringify({ input: "./a.json", output: "gen/api", zod: false }),
    );
    const [target] = await loadApiConfig({
      cwd,
      overrides: { input: "./b.json", output: undefined },
    });
    expect(target?.input).toBe("./b.json");
    expect(target?.output).toBe("gen/api");
    expect(target?.zod).toBe(false);
  });

  it("works from overrides alone when no config file exists", async () => {
    const [target] = await loadApiConfig({
      cwd: tempDir(),
      overrides: { input: "http://x/swagger.json" },
    });
    expect(target?.input).toBe("http://x/swagger.json");
  });

  it("resolves multiple named targets from a { targets } config", async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, "abp.api.config.json"),
      JSON.stringify({
        targets: {
          identity: { input: "./identity.json", output: "src/api/identity" },
          business: { input: "./business.json", output: "src/api/business", zod: false },
        },
      }),
    );
    const targets = await loadApiConfig({ cwd });
    expect(targets).toHaveLength(2);
    const identity = targets.find((t) => t.name === "identity");
    expect(identity?.output).toBe("src/api/identity");
    expect(identity?.zod).toBe(true);
    expect(targets.find((t) => t.name === "business")?.zod).toBe(false);
  });

  it("rejects command-line overrides under a multi-target config instead of dropping them", async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, "abp.api.config.json"),
      JSON.stringify({ targets: { identity: { input: "./identity.json" } } }),
    );
    await expect(loadApiConfig({ cwd, overrides: { input: "./other.json" } })).rejects.toThrow(
      /--input[\s\S]*--config/,
    );
  });

  it("accepts a multi-target config when every override is undefined", async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, "abp.api.config.json"),
      JSON.stringify({
        targets: { identity: { input: "./identity.json" }, business: { input: "./business.json" } },
      }),
    );
    const targets = await loadApiConfig({
      cwd,
      overrides: { input: undefined, output: undefined },
    });
    expect(targets.map((t) => t.name)).toEqual(["identity", "business"]);
  });

  it("explains the runtime requirement when a .ts config cannot be imported", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "abp.api.config.ts"), `export default { input: "./swagger.json" };\n`);
    const importModule = () => {
      const error: NodeJS.ErrnoException = new TypeError('Unknown file extension ".ts"');
      error.code = "ERR_UNKNOWN_FILE_EXTENSION";
      return Promise.reject(error);
    };
    await expect(loadApiConfig({ cwd, importModule })).rejects.toThrow(
      /Bun[\s\S]*22\.18[\s\S]*abp\.api\.config\.json/,
    );
  });

  it("lets an unrelated config import failure bubble up unchanged", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "abp.api.config.ts"), `export default { input: "./swagger.json" };\n`);
    const cause = new SyntaxError("Unexpected token '}'");
    await expect(loadApiConfig({ cwd, importModule: () => Promise.reject(cause) })).rejects.toBe(
      cause,
    );
  });

  it("points at the missing default export instead of blaming the input field", async () => {
    const cwd = tempDir();
    // `export const config = {...}`：模块加载成功，但导出面上没有 default。
    writeFileSync(join(cwd, "abp.api.config.ts"), `export const config = { input: "./s.json" };\n`);

    await expect(loadApiConfig({ cwd, importModule: () => Promise.resolve({}) })).rejects.toThrow(
      /default export/,
    );
  });

  it("throws when neither a config file nor an input override supplies input", async () => {
    await expect(loadApiConfig({ cwd: tempDir() })).rejects.toThrow();
  });

  it("rejects an explicit configPath that does not exist instead of silently ignoring it", async () => {
    await expect(loadApiConfig({ cwd: tempDir(), configPath: "typo.config.ts" })).rejects.toThrow(
      /config file not found/,
    );
  });

  it("honors an absolute configPath as-is, ignoring cwd", async () => {
    const cwd = tempDir();
    const elsewhere = tempDir();
    const absoluteConfig = join(elsewhere, "custom.config.json");
    writeFileSync(absoluteConfig, JSON.stringify({ input: "./abs.json" }));
    const [target] = await loadApiConfig({ cwd, configPath: absoluteConfig });
    expect(target?.input).toBe("./abs.json");
  });
});
