import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runGen } from "../src/gen";

const MINI = join(__dirname, "fixtures", "mini-abp-swagger.json");
const DEMO = join(__dirname, "fixtures", "demo-abp-swagger.json");

function listFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String) : [];
}

describe("runGen", () => {
  it("generates endpoints/models/schemas and writes the mutator", { timeout: 60_000 }, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-"));
    const result = await runGen({ cwd, overrides: { input: MINI, output: "src/api" } });
    expect(result.targets[0]?.mutatorWritten).toBe(true);
    const out = join(cwd, "src/api");
    expect(existsSync(join(out, "mutator.ts"))).toBe(true);
    const endpointFiles = listFiles(join(out, "endpoints")).filter((f) => f.endsWith(".ts"));
    expect(endpointFiles.length).toBeGreaterThan(0);
    const endpointSource = endpointFiles
      .map((f) => readFileSync(join(out, "endpoints", f), "utf8"))
      .join("\n");
    expect(endpointSource).toContain("useQuery");
    expect(endpointSource).toContain("QueryOptions");
    expect(endpointSource).toContain("abpMutator");
    expect(listFiles(join(out, "models")).length).toBeGreaterThan(0);
    expect(listFiles(join(out, "schemas")).length).toBeGreaterThan(0);
  });

  it("does not overwrite an existing mutator and honors zod:false", {
    timeout: 60_000,
  }, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-"));
    await runGen({ cwd, overrides: { input: MINI, output: "api", zod: false } });
    const mutatorPath = join(cwd, "api", "mutator.ts");
    writeFileSync(mutatorPath, "// user-edited\n", { flag: "a" });
    const second = await runGen({ cwd, overrides: { input: MINI, output: "api", zod: false } });
    expect(second.targets[0]?.mutatorWritten).toBe(false);
    expect(readFileSync(mutatorPath, "utf8")).toContain("// user-edited");
    expect(existsSync(join(cwd, "api", "schemas"))).toBe(false);
  });

  it("drops stale output from a previous run but keeps the mutator", {
    timeout: 60_000,
  }, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-clean-"));
    await runGen({ cwd, overrides: { input: MINI, output: "src/api" } });
    const out = join(cwd, "src/api");
    // 模拟后端删掉了一个 tag / 一个 DTO：上一轮的产物还躺在盘上，且仍可被 import。
    const staleEndpoint = join(out, "endpoints", "removed", "removed.ts");
    mkdirSync(dirname(staleEndpoint), { recursive: true });
    writeFileSync(staleEndpoint, "export const gone = 1;\n");
    const staleModel = join(out, "models", "removedDto.ts");
    writeFileSync(staleModel, "export type RemovedDto = 1;\n");
    const staleSchema = join(out, "schemas", "removed", "removed.zod.ts");
    mkdirSync(dirname(staleSchema), { recursive: true });
    writeFileSync(staleSchema, "export const removedZod = 1;\n");
    writeFileSync(join(out, "mutator.ts"), "// user-edited\n", { flag: "a" });

    await runGen({ cwd, overrides: { input: MINI, output: "src/api" } });

    expect(existsSync(staleEndpoint)).toBe(false);
    expect(existsSync(staleModel)).toBe(false);
    expect(existsSync(staleSchema)).toBe(false);
    expect(readFileSync(join(out, "mutator.ts"), "utf8")).toContain("// user-edited");
    expect(
      listFiles(join(out, "endpoints")).filter((f) => f.endsWith(".ts")).length,
    ).toBeGreaterThan(0);
  });

  it("fetches a remote OpenAPI document once per run", { timeout: 60_000 }, async () => {
    const spec = readFileSync(MINI, "utf8");
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(spec);
    });
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-remote-"));

    try {
      await runGen({
        cwd,
        overrides: { input: `http://127.0.0.1:${port}/swagger.json`, output: "src/api" },
      });
    } finally {
      server.close();
    }

    // zod 开启时 api 与 apiZod 两个 project 各自解析 input；同一份 spec 拉两次，两次之间
    // 后端有变更就会让 types 与 zod schema 漂移。
    expect(hits).toBe(1);
    expect(listFiles(join(cwd, "src/api/endpoints")).length).toBeGreaterThan(0);
    expect(listFiles(join(cwd, "src/api/schemas")).length).toBeGreaterThan(0);
  });

  it("throws when the spec produces no endpoints", { timeout: 60_000 }, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-empty-"));
    const emptySpec = join(cwd, "empty.json");
    writeFileSync(
      emptySpec,
      JSON.stringify({ openapi: "3.0.1", info: { title: "x", version: "1" }, paths: {} }),
    );
    await expect(
      runGen({ cwd, overrides: { input: emptySpec, output: "src/api", zod: false } }),
    ).rejects.toThrow(/no endpoints/i);
  });

  it("smoke: generates from the real ABP demo swagger snapshot", { timeout: 120_000 }, async () => {
    const raw = JSON.parse(readFileSync(DEMO, "utf8")) as Record<string, unknown>;
    if (raw.__missing === true) return;
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-demo-"));
    await runGen({ cwd, overrides: { input: DEMO, output: "src/api" } });
    expect(listFiles(join(cwd, "src/api/endpoints")).length).toBeGreaterThan(0);
  });

  it("executes generated GET/POST endpoints through the copied mutator (gen↔mutator seam)", {
    timeout: 60_000,
  }, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jc-abp-gen-seam-"));
    await runGen({ cwd, overrides: { input: MINI, output: "src/api" } });
    const out = join(cwd, "src/api");

    const mutatorMod = (await import(pathToFileURL(join(out, "mutator.ts")).href)) as {
      configureAbpMutator: (config: { baseUrl?: string; fetchFn?: typeof fetch }) => void;
    };
    const usersMod = (await import(pathToFileURL(join(out, "endpoints/users/users.ts")).href)) as {
      getUsers: (params?: unknown, options?: RequestInit) => Promise<unknown>;
      createUser: (body: unknown, options?: RequestInit) => Promise<unknown>;
    };

    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    mutatorMod.configureAbpMutator({ baseUrl: "https://bff.example", fetchFn });

    await usersMod.getUsers({ SkipCount: 0, MaxResultCount: 10 });
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://bff.example/api/identity/users?SkipCount=0&MaxResultCount=10",
    );
    const getInit = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(getInit.method).toBe("GET");

    await usersMod.createUser({ userName: "alice" });
    expect(fetchFn.mock.calls[1]?.[0]).toBe("https://bff.example/api/identity/users");
    const postInit = fetchFn.mock.calls[1]?.[1] as RequestInit;
    expect(postInit.method).toBe("POST");
    expect(postInit.body).toBe(JSON.stringify({ userName: "alice" }));
  });
});
