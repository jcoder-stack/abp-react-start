#!/usr/bin/env node
// postpack 生命周期钩子：把 apply-publish-config.mjs 备份的原始 package.json 换回来，删掉备份文件。
// 与 apply-publish-config.mjs 成对使用，零依赖，只用 node 内置模块。
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pkgPath = resolve(process.cwd(), "package.json");
const backupPath = `${pkgPath}.prepack-backup`;

if (!existsSync(backupPath)) {
  process.exit(0);
}

writeFileSync(pkgPath, readFileSync(backupPath, "utf8"));
unlinkSync(backupPath);
