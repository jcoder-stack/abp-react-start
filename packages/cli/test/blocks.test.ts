import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CommandRunner, installShadcnBlock } from "../src/blocks";

/** 一个只含一份块 json 的假 registry + 空项目目录。 */
function workspace(files: { path: string; type: string; target?: string }[]) {
  const root = mkdtempSync(join(tmpdir(), "jc-abp-blocks-"));
  const registryDir = join(root, "registry");
  mkdirSync(join(registryDir, "public", "r"), { recursive: true });
  writeFileSync(join(registryDir, "public", "r", "demo.json"), JSON.stringify({ files }));
  const app = join(root, "app");
  mkdirSync(app, { recursive: true });
  return { app, registryDir };
}

/** 模拟 shadcn：把给定相对路径的文件写进项目。 */
function writingRunner(app: string, relPaths: string[]): CommandRunner {
  return async () => {
    for (const rel of relPaths) {
      mkdirSync(dirname(join(app, rel)), { recursive: true });
      writeFileSync(join(app, rel), "x");
    }
  };
}

describe("installShadcnBlock", () => {
  it("accepts a ~/ target that landed at the project root", async () => {
    const { app, registryDir } = workspace([
      { path: "sw.js", type: "registry:file", target: "~/public/sw.js" },
    ]);
    await expect(
      installShadcnBlock(app, registryDir, "demo", writingRunner(app, ["public/sw.js"])),
    ).resolves.toBeUndefined();
  });

  it("reports a ~/ target as missing when it only exists under src/", async () => {
    const { app, registryDir } = workspace([
      { path: "sw.js", type: "registry:file", target: "~/public/sw.js" },
    ]);
    await expect(
      installShadcnBlock(app, registryDir, "demo", writingRunner(app, ["src/public/sw.js"])),
    ).rejects.toThrow(/reported success \(exit 0\).*public\/sw\.js/);
  });

  it("names the block and the expected path when the registry has no such block", async () => {
    const { app, registryDir } = workspace([]);
    await expect(
      installShadcnBlock(app, registryDir, "nope", writingRunner(app, [])),
    ).rejects.toThrow(/shadcn block "nope" not found in the registry/);
  });

  it("wraps a failing shadcn run with the block name", async () => {
    const { app, registryDir } = workspace([]);
    const failing: CommandRunner = async () => {
      throw new Error("exit 1");
    };
    await expect(installShadcnBlock(app, registryDir, "demo", failing)).rejects.toThrow(
      'installing shadcn block "demo" failed: exit 1',
    );
  });
});
