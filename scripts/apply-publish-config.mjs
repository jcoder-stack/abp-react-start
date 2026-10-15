#!/usr/bin/env node
// prepack 生命周期钩子：把当前包 package.json 里 publishOverrides 声明的字段（main/types/exports 等）应用到
// 顶层，让 npm pack/publish 打出的 tarball 里 main/exports 指向 dist 而非仓库内部开发用的 src（workspace
// 内 tsc -b/vitest 直接吃 src，发布态需要换成 dist）。原始 package.json 备份为 package.json.prepack-backup，
// postpack 阶段由 restore-publish-config.mjs 换回并删掉备份。零依赖：只用 node 内置模块，被 npm 在打包该
// package.json 所在目录时以该目录为 cwd 调用。
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// 包名与目录名并不总能互推（@jcoder-stack/abp-react 在 packages/ 下，@jcoder-stack/registry 在仓库根下），
// 所以按根 package.json 的 workspaces 逐个读 name 匹配，而不是从包名反推路径。
function findWorkspacePackage(depName) {
  let dir = process.cwd();
  for (;;) {
    const rootPkgPath = resolve(dir, "package.json");
    if (existsSync(rootPkgPath)) {
      const globs = JSON.parse(readFileSync(rootPkgPath, "utf8")).workspaces;
      if (Array.isArray(globs)) {
        for (const glob of globs) {
          const dirs = glob.endsWith("/*")
            ? readdirSync(resolve(dir, glob.slice(0, -2)), { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => resolve(dir, glob.slice(0, -2), entry.name))
            : [resolve(dir, glob)];
          for (const candidate of dirs) {
            const candidatePkg = resolve(candidate, "package.json");
            if (!existsSync(candidatePkg)) continue;
            if (JSON.parse(readFileSync(candidatePkg, "utf8")).name === depName) return candidatePkg;
          }
        }
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const pkgPath = resolve(process.cwd(), "package.json");
const backupPath = `${pkgPath}.prepack-backup`;

if (existsSync(backupPath)) {
  throw new Error(
    `发现残留备份 ${backupPath}：上一次 prepack/postpack 没有配对完成。请先核实并手动清理（用备份内容还原` +
      `package.json 后删掉备份文件），再重新 pack。`,
  );
}

const raw = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(raw);
// 覆盖值放在自定义的 publishOverrides 而非 publishConfig：npm 把 publishConfig 的每个键当 npm config 读，
// main/types/exports 不是合法 config，会打 "Unknown publishConfig config ... will stop working in the next
// major version" 警告——npm 12 已把 .npmrc/CLI 的未知配置升级为报错，publishConfig 很可能跟进。自定义字段
// npm 不读，只由本脚本消费，应用后从发布态 manifest 里删掉。
const overrides = pkg.publishOverrides ?? {};
const overrideKeys = Object.keys(overrides);

for (const key of overrideKeys) {
  pkg[key] = overrides[key];
}
delete pkg.publishOverrides;

// npm publish 不认识 bun/pnpm 的 workspace: 协议，会把 "workspace:*" 原样写进 tarball，装到宿主时直接
// 解析失败。发布态把它替换成对应 workspace 包的真实版本 ^<version>。找不到包或版本还是占位的 0.0.0 时
// 抛错终止，防止发出装不上的依赖区间。
let workspaceRewrites = 0;
for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const deps = pkg[field];
  if (!deps) continue;
  for (const [depName, range] of Object.entries(deps)) {
    if (!range.startsWith("workspace:")) continue;
    const depPkgPath = findWorkspacePackage(depName);
    if (depPkgPath === null) {
      throw new Error(`${field}.${depName} 是 ${range}，但在 workspaces 里找不到同名包。`);
    }
    const depVersion = JSON.parse(readFileSync(depPkgPath, "utf8")).version;
    if (!depVersion || depVersion === "0.0.0") {
      throw new Error(
        `${field}.${depName} 是 ${range}，但 ${depPkgPath} 的 version 还是占位的 ${depVersion ?? "空"}——` +
          `先给 workspace 包定版再发布。`,
      );
    }
    deps[depName] = `^${depVersion}`;
    workspaceRewrites += 1;
  }
}

if (overrideKeys.length === 0 && workspaceRewrites === 0) {
  process.exit(0);
}

writeFileSync(backupPath, raw);
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
