import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runAdd } from "./add";
import { parseCliArgs } from "./args";
import { runGen } from "./gen";
import { runInit } from "./init";

/** jc-abp usage text (v1: gen + add + init; watch is deferred). */
const USAGE = `jc-abp — ABP React 前端工具

用法:
  jc-abp gen [--input <url|file>] [--output <dir>] [--config <file>]
      读取 abp.api.config.{ts,js,json}（flags 覆盖），用 orval 生成 endpoints/models/schemas + mutator
      多 target 配置（{ targets: {...} }）下 --input/--output 无从落到某个 target，传了即报错
  jc-abp add <name> [--from <registryDir>] [--dest <dir>]
      把 registry 外壳（如 auth）拷贝进项目（默认 src/<name>，拒绝覆盖）
  jc-abp init [--no-admin]
      一站式初始化：落 auth 外壳 + 按依赖序装 shadcn 管理后台 block（--no-admin 跳过 admin-pages 并换最小菜单）+ 播种 abp.api.config.ts + 生成 routeTree
  jc-abp help
`;

/** init 收尾打印的 __root.tsx / router.tsx 接线教程；正文是模板文本，dispatch 只负责打印，免得近百行样例代码长在函数里、还要跟 starter 的 __root.tsx 两头维护。 */
const WIRING_GUIDE_PATH = fileURLToPath(new URL("../templates/wiring-guide.txt", import.meta.url));

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
      const result = await runInit({ cwd: process.cwd(), admin: invocation.flags.admin });
      if (result.componentsJsonSeeded) {
        console.log(
          `已播种 components.json（css: ${result.componentsJsonCssPath}，基线 new-york/neutral）`,
        );
      }
      console.log(`auth 外壳已落位: ${result.addResult.files.length} 个文件`);
      console.log(`shadcn 块已安装: ${result.shadcnBlocks.join(", ")}`);
      console.log(
        result.routeTreeGenerated
          ? "routeTree.gen.ts 已重新生成（新装路由已进类型）。"
          : "routeTree.gen.ts 本次生成失败（不影响安装）：首次 dev/build 会自动重新生成，期间 src/menu.tsx 可能有短暂类型报错。",
      );
      console.log(
        result.configSeeded
          ? `已生成 ${result.configPath}`
          : `${result.configPath} 已存在，跳过播种`,
      );
      if (result.scaffoldIndexRenamed) {
        console.log(
          "已将脚手架默认首页备份为 src/routes/index.tsx.bak；`/` 现由 app-shell 的落地页 " +
            "src/routes/index.tsx 接管，如需自定义首页请直接编辑它。",
        );
      }
      if (result.menuRewrittenForNoAdmin) {
        console.log(
          "--no-admin：src/menu.tsx 已覆写为最小菜单（admin 路由未安装，分发菜单会指向不存在的页面）。",
        );
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
      console.log(`跳过 ${result.skipped.length} 个已存在文件（未覆盖）:`);
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
