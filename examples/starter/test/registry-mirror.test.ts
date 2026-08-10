import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const STARTER = join(REPO_ROOT, "examples/starter");

interface RegistryFile {
  path: string;
  target: string;
}
interface Registry {
  items: { name: string; files?: RegistryFile[] }[];
}

/** 块源码在 starter 里的落点。`target` 有两种形状：`src/…` 相对项目根，其余相对 `src/`。 */
function starterPath(target: string): string {
  return target.startsWith("src/") ? join(STARTER, target) : join(STARTER, "src", target);
}

/** starter 相对路径是否属于「手写增量」——那些文件刻意与分发块不同，不该参与比对。
 *  清单取自 `scripts/regenerate-example.sh` 的 `HANDWRITTEN_PATHS`，两处共用同一份真相：
 *  在那边它决定重放时抢救什么，在这里决定豁免什么。另立一份会让两处慢慢说不到一起去。 */
function readHandwrittenPaths(): string[] {
  const script = readFileSync(join(REPO_ROOT, "scripts/regenerate-example.sh"), "utf8");
  const block = /HANDWRITTEN_PATHS=\(([\s\S]*?)\n\)/.exec(script);
  if (!block)
    throw new Error(
      "regenerate-example.sh 里找不到 HANDWRITTEN_PATHS——清单改了形状，本测试要跟着改",
    );
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const handwritten = readHandwrittenPaths();
const registry: Registry = JSON.parse(
  readFileSync(join(REPO_ROOT, "registry/registry.json"), "utf8"),
);

const pairs = registry.items.flatMap((item) =>
  (item.files ?? []).map((f) => ({
    block: item.name,
    registryFile: join(REPO_ROOT, "registry", f.path),
    starterFile: starterPath(f.target),
    target: f.target,
    // target 归一成相对项目根，才能与 HANDWRITTEN_PATHS 的写法对齐
    rel: f.target.startsWith("src/") ? f.target : `src/${f.target}`,
  })),
);

const compared = pairs.filter(
  (p) => !handwritten.some((h) => p.rel === h || p.rel.startsWith(`${h}/`)),
);

describe("registry 块与 starter 镜像", () => {
  it("清单本身非空，且豁免没有把所有文件都吃掉", () => {
    expect(pairs.length).toBeGreaterThan(50);
    expect(compared.length).toBeGreaterThan(50);
  });

  it.each(compared.map((p) => [p.target, p] as const))("%s 两侧逐字一致", (_target, pair) => {
    // 分发给用户的是 registry 那份；starter 那份跑测试与真机验收。两者一旦分叉，
    // 仓库自身的 lint/typecheck/test 全绿，只有装出来的项目拿到旧代码——纯静默故障。
    const fromRegistry = readFileSync(pair.registryFile, "utf8");
    const fromStarter = readFileSync(pair.starterFile, "utf8");
    expect(fromStarter).toBe(fromRegistry);
  });
});
