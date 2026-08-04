import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { main, probeBackend } from "../src/main";

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

describe("probeBackend", () => {
  const URL_ = "https://localhost:44316";

  function failingFetch(code: string): typeof fetch {
    return (async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("x"), { code }),
      });
    }) as unknown as typeof fetch;
  }

  it("stays silent when the backend answers at all — even with 404", async () => {
    const fetchFn = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await probeBackend(URL_, fetchFn)).toBe(null);
  });

  it("reads a certificate failure as good news: the address is right, trust is missing", async () => {
    const note = await probeBackend(URL_, failingFetch("DEPTH_ZERO_SELF_SIGNED_CERT"));
    expect(note).toContain("is up");
    expect(note).toContain("AUTH_EXTRA_CA_FILE");
  });

  it("points an unreachable backend at gen, not at init", async () => {
    const note = await probeBackend(URL_, failingFetch("ECONNREFUSED"));
    expect(note).toContain("not reachable");
    expect(note).toContain("init finished fine");
    expect(note).toContain("jc-abp gen");
  });

  it("never throws on an unrecognized failure", async () => {
    const fetchFn = (async () => {
      throw new Error("weird");
    }) as unknown as typeof fetch;
    const note = await probeBackend(URL_, fetchFn);
    expect(note).toContain("weird");
  });
});
