import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { main } from "../src/main";

/** 跑真实 bin，但把它对 dist 的 import 换成一个只管刷输出的 stub，从而只考察进程退出方式。 */
function runBinWith(stubSource: string): Promise<{ code: number | null; stdout: string }> {
  const dir = mkdtempSync(join(tmpdir(), "jc-abp-bin-"));
  const stub = join(dir, "stub.mjs");
  writeFileSync(stub, stubSource);
  const binPath = fileURLToPath(new URL("../bin/jc-abp.js", import.meta.url));
  const entry = join(dir, "bin.mjs");
  writeFileSync(
    entry,
    readFileSync(binPath, "utf8").replace("../dist/index.js", pathToFileURL(stub).href),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

describe("jc-abp bin", () => {
  it("flushes every line of stdout to a pipe and still reports the exit code", async () => {
    const lines = 20_000;
    const { code, stdout } = await runBinWith(
      `export async function main() {
        for (let i = 0; i < ${lines}; i++) console.log("line " + i);
        return 3;
      }\n`,
    );
    expect(stdout.split("\n").filter(Boolean)).toHaveLength(lines);
    expect(stdout.startsWith("line 0\n")).toBe(true);
    expect(stdout.trimEnd().endsWith(`line ${lines - 1}`)).toBe(true);
    expect(code).toBe(3);
  });

  it("lets output still queued when main resolves reach the pipe", async () => {
    const { code, stdout } = await runBinWith(
      `export async function main() {
        setTimeout(() => console.log("trailing"), 50);
        console.log("leading");
        return 0;
      }\n`,
    );
    expect(stdout).toContain("trailing");
    expect(code).toBe(0);
  });
});

describe("main", () => {
  it("prints usage and returns 0 for help", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await main([])).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("jc-abp gen");
    log.mockRestore();
  });

  it("returns 1 with a message for unknown commands and missing add name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main(["frobnicate"])).toBe(1);
    expect(await main(["add"])).toBe(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
