import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 分发完整性审计。这四类问题对 typecheck / lint / 测试全隐形。仓库自己的代码是完整的，
 * 只有 `jc-abp init` 装出来的项目才会缺文件，人眼逐轮检查漏得掉，只能靠这个脚本兜住。 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));

const problems = [];

const filesOf = (item) => item.files ?? [];
const readSource = (path) => {
  const full = join(root, path);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
};

// ① 每个块用到的 ui/ 原语都要在 registryDependencies 里。registry 不分发 ui/，漏了就装不全
for (const item of registry.items) {
  const declared = new Set(item.registryDependencies ?? []);
  const used = new Set();
  for (const file of filesOf(item)) {
    const source = readSource(file.path);
    if (source === undefined) continue;
    for (const m of source.matchAll(/from "@\/components\/ui\/([a-z-]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((name) => !declared.has(name));
  if (missing.length > 0) {
    problems.push(`${item.name}: registryDependencies 缺 ${missing.join(", ")}`);
  }
}

// ② 同块内互相 import 的文件都要在 files[] 里登记
for (const item of registry.items) {
  const registered = new Set(filesOf(item).map((f) => f.path));
  for (const file of filesOf(item)) {
    const source = readSource(file.path);
    if (source === undefined) continue;
    // 用 target 的目录段而不是源目录名，两者可以不同（ui/blocks/abp-table/* 装到 components/abp/table/*），
    // 拿源目录名去匹配 import 会永远落空，检查形同虚设。
    const srcDir = file.path.replace(/^ui\/blocks\//, "").split("/")[0];
    const importDir =
      file.target?.replace(/^components\//, "").split("/").slice(0, -1).join("/") ?? srcDir;
    for (const m of source.matchAll(
      new RegExp(`from "@/components/${importDir}/([a-z-]+)"`, "g"),
    )) {
      const candidates = [
        `ui/blocks/${srcDir}/${m[1]}.ts`,
        `ui/blocks/${srcDir}/${m[1]}.tsx`,
        `ui/blocks/${srcDir}/${m[1]}.json`,
      ];
      if (candidates.some((c) => existsSync(join(root, c))) && !candidates.some((c) => registered.has(c))) {
        problems.push(`${item.name}: ${file.path} 引用了未登记的同块文件 ${m[1]}`);
      }
    }
  }
}

// ④ 兄弟块只能用安装路径引用，不能写裸名字。shadcn 把裸名字当作官方 registry 的条目，去
// ui.shadcn.com 找同名 item，找不到就整块安装失败退出（实测 abp-sheet 声明 abp-crud 后 404 直接崩）。
// 路径形式则按消费项目的根解析，指向装好的 @jcoder-stack/registry，shadcn 会自动把前置块一并装上。
// 自指例外：本仓库 combobox 块建于官方同名原语之上，那个名字确实指向 shadcn 的 item。
const SIBLING_PREFIX = "./node_modules/@jcoder-stack/registry/public/r/";
const ownNames = new Set(registry.items.map((item) => item.name));
for (const item of registry.items) {
  const deps = item.registryDependencies ?? [];

  const bareSiblings = deps.filter((d) => d !== item.name && ownNames.has(d));
  if (bareSiblings.length > 0) {
    problems.push(
      `${item.name}: registryDependencies 用裸名字引用了兄弟块 ${bareSiblings.join(", ")}——` +
        `shadcn 会去官方 registry 找它并 404；改写成 ${SIBLING_PREFIX}<名字>.json`,
    );
  }

  // 路径形式必须指向真实存在的兄弟块，否则消费方装到一半才会 ENOENT
  for (const dep of deps.filter((d) => d.startsWith(SIBLING_PREFIX))) {
    const name = dep.slice(SIBLING_PREFIX.length).replace(/\.json$/, "");
    if (!ownNames.has(name)) {
      problems.push(`${item.name}: registryDependencies 指向不存在的兄弟块 ${name}（${dep}）`);
    }
  }
}

// ③ blocks/ 下不该有文件游离在所有 item 之外，它会被 typecheck 覆盖却永远分发不出去
const registeredPaths = new Set(registry.items.flatMap((item) => filesOf(item).map((f) => f.path)));
const walk = (dir) => {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (!registeredPaths.has(rel)) problems.push(`游离文件（未被任何 item 登记）: ${rel}`);
  }
};
walk("ui/blocks");

if (problems.length > 0) {
  console.error("分发完整性审计失败：");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`✔ 分发完整性审计通过（${registry.items.length} 个块，${registeredPaths.size} 个文件）`);
