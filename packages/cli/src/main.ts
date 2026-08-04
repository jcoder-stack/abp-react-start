import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { runAdd } from "./add";
import { parseCliArgs } from "./args";
import { runGen } from "./gen";
import { normalizeBackendUrl, runInit } from "./init";
import { findErrorCode, TLS_TRUST_CODES, UNREACHABLE_CODES } from "./upstream-errors";

/** jc-abp usage text (v1: gen + add + init; watch is deferred). */
const USAGE = `jc-abp — ABP React frontend tooling

Usage:
  jc-abp gen [--input <url|file>] [--output <dir>] [--config <file>]
      Read abp.api.config.{ts,js,json} (flags override) and generate endpoints/models/schemas + mutator via orval.
      With a multi-target config ({ targets: {...} }) --input/--output cannot land on one target and are rejected.
  jc-abp add <name> [--from <registryDir>] [--dest <dir>]
      Copy a registry shell (e.g. auth) into the project (default src/<name>; never overwrites).
  jc-abp init [--no-admin] [--backend <url>]
      One-stop setup: auth shell + shadcn admin blocks in dependency order (--no-admin skips admin-pages
      and swaps in a minimal menu) + seed abp.api.config.ts and .env + generate the route tree.
      Interactive terminals get one question — the ABP backend URL (Enter skips); --backend answers it for scripts/CI.
  jc-abp help
`;

/** init 收尾打印的 __root.tsx / router.tsx 接线教程；正文是模板文本，dispatch 只负责打印，免得近百行样例代码长在函数里、还要跟 starter 的 __root.tsx 两头维护。 */
const WIRING_GUIDE_PATH = fileURLToPath(new URL("../templates/wiring-guide.txt", import.meta.url));

/**
 * 交互式问一次 ABP 后端地址；回车跳过，非 TTY（CI、管道）直接跳过。
 * 地址不合法时就地重问——这是 init 唯一的交互，错一次就中止太苛刻。
 */
async function promptBackendUrl(): Promise<string | undefined> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return undefined;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (
        await rl.question("ABP backend URL (e.g. https://localhost:44316, Enter to skip): ")
      ).trim();
      if (answer === "") return undefined;
      const normalized = normalizeBackendUrl(answer);
      if (normalized !== null) return normalized;
      console.log("Not a valid URL — enter a full http(s):// address, or press Enter to skip.");
    }
  } finally {
    rl.close();
  }
}

/**
 * init 收尾的连通性探测（best-effort，永不让 init 失败）：任何 HTTP 响应（含 404/405）都证明
 * TCP+TLS 通了，返回 null；只有连不上才有话说。3 秒超时——它的价值是在最早的时刻抓住手误，
 * 不值得为一个慢后端拖住收尾。
 * @returns 给用户看的一行提示，null 表示无需提示。
 */
export async function probeBackend(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    await fetchFn(`${url}/swagger/v1/swagger.json`, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return null;
  } catch (error) {
    const code = findErrorCode(error);
    if (code !== null && TLS_TRUST_CODES.has(code)) {
      // 证书握手失败反而证明地址填对了——有一台真后端在回话。
      return (
        `note: the backend at ${url} is up, but its certificate is not trusted by this process ` +
        `(${code}) — set AUTH_EXTRA_CA_FILE in .env before running gen or dev (see the notes in .env).`
      );
    }
    if (code !== null && UNREACHABLE_CODES.has(code)) {
      return (
        `note: the backend at ${url} is not reachable right now (${code}) — init finished fine; ` +
        "start the backend (or fix the address in .env and abp.api.config.ts) before running jc-abp gen."
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return `note: probing ${url} failed (${message}) — verify the address before running jc-abp gen.`;
  }
}

/** CLI entry: dispatch gen/add/help; returns the process exit code. */
export async function main(argv: string[]): Promise<number> {
  let invocation: ReturnType<typeof parseCliArgs>;
  try {
    invocation = parseCliArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  try {
    if (invocation.command === "help") {
      console.log(USAGE);
      return 0;
    }
    if (invocation.command === "gen") {
      const result = await runGen({
        cwd: process.cwd(),
        configPath: invocation.flags.config,
        overrides: { input: invocation.flags.input, output: invocation.flags.output },
      });
      for (const target of result.targets) {
        console.log(
          `generated ${target.name ? `${target.name} ` : ""}into ${target.outputDir}${target.mutatorWritten ? " (mutator.ts created)" : ""}`,
        );
      }
      return 0;
    }
    if (invocation.command === "init") {
      let backend: string | undefined;
      if (invocation.flags.backend !== undefined) {
        const normalized = normalizeBackendUrl(invocation.flags.backend);
        if (normalized === null) {
          console.error(`--backend is not a valid http(s) URL: ${invocation.flags.backend}`);
          return 1;
        }
        backend = normalized;
      } else {
        backend = await promptBackendUrl();
      }
      const result = await runInit({ cwd: process.cwd(), admin: invocation.flags.admin, backend });
      if (result.componentsJsonSeeded) {
        console.log(
          `seeded components.json (css: ${result.componentsJsonCssPath}, baseline new-york/neutral)`,
        );
      }
      console.log(`auth shell installed: ${result.addResult.files.length} files`);
      console.log(`shadcn blocks installed: ${result.shadcnBlocks.join(", ")}`);
      console.log(
        result.routeTreeGenerated
          ? "routeTree.gen.ts regenerated (the new routes are in the route types)."
          : "routeTree.gen.ts generation failed this time (install unaffected): the first dev/build regenerates it; until then src/menu.tsx may briefly show type errors.",
      );
      console.log(
        result.configSeeded
          ? `created ${result.configPath}${result.backendUrl !== null ? " (input points at your backend)" : ""}`
          : `${result.configPath} already exists, left as is`,
      );
      if (result.envSeeded) {
        console.log(
          result.backendUrl !== null
            ? `created .env (backend ${result.backendUrl}, session secret generated) — AUTH_CLIENT_ID is still blank, fill it before starting`
            : "created .env (session secret generated) — backend skipped, fill AUTH_ISSUER / AUTH_ABP_BASE_URL / AUTH_CLIENT_ID before starting",
        );
      } else {
        console.log(".env already exists, left untouched");
      }
      if (result.scaffoldIndexRenamed) {
        console.log(
          "the scaffold's default home page was backed up to src/routes/index.tsx.bak; `/` is now " +
            "app-shell's landing page at src/routes/index.tsx — edit that file to customize it.",
        );
      }
      if (result.menuRewrittenForNoAdmin) {
        console.log(
          "--no-admin: src/menu.tsx was overwritten with the minimal menu (the distributed menu links to admin routes that are not installed).",
        );
      }
      if (backend !== undefined) {
        const note = await probeBackend(backend);
        if (note !== null) console.log(note);
      }
      console.log(`\n${readFileSync(WIRING_GUIDE_PATH, "utf8").trimEnd()}`);
      return 0;
    }
    const name = invocation.positionals[0];
    if (name === undefined) {
      console.error("add requires a name: jc-abp add <name>");
      return 1;
    }
    const result = runAdd({
      name,
      cwd: process.cwd(),
      from: invocation.flags.from,
      dest: invocation.flags.dest,
    });
    console.log(`copied ${result.files.length} files:`);
    for (const file of result.files) {
      console.log(`  ${file}`);
    }
    if (result.skipped.length > 0) {
      console.log(`skipped ${result.skipped.length} existing files (not overwritten):`);
      for (const file of result.skipped) {
        console.log(`  ${file}`);
      }
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
