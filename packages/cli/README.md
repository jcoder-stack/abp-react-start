# @jcoder/cli

`jc-abp` CLI：`gen`（orval 预设生成 react-query 客户端）+ `add`（拉取 registry 外壳）+ `init`（一站式初始化）。

`abp-react-start` 内核包之一——从零自研的纯 React ABP 前端框架，总览见仓库根 README。

## 安装

```bash
bun add -D @jcoder/cli @jcoder/registry
```

`add` 与 `init` 从 `@jcoder/registry` 取外壳源码，两者要一起装。

## 命令

### `jc-abp init [--no-admin]`

一站式初始化：落 auth 外壳、按依赖序装 shadcn 管理后台 block、播种 `abp.api.config.ts`、生成 routeTree。`--no-admin` 跳过 admin-pages 并换用最小菜单。

初始化前会做两道前置检查（是否已初始化过、npm 能否装 block），任一不过就中止且不落任何文件。中途失败的报错会列出已完成的步骤——init 不做回滚。

### `jc-abp gen [--input <url|file>] [--output <dir>] [--config <file>]`

读 `abp.api.config.{ts,js,json}`（flags 覆盖），用 orval 生成 endpoints/models/schemas 与 mutator。

```ts
// abp.api.config.ts
import { defineApiConfig } from "@jcoder/cli";

export default defineApiConfig({
  input: "https://localhost:44300/swagger/v1/swagger.json",
  output: "src/api",
  zod: true,
});
```

多后端用 `{ targets: { identity: {...}, business: {...} } }` 形态；flags 无从落到某个 target，传了 `--input`/`--output` 即报错，请改写配置文件或用 `--config` 指定一份单 target 配置。

CLI 整体要求 Node ≥18，但 `.ts` 配置需要运行时能直接执行 TypeScript（Bun，或 Node ≥22.18 的 strip-types）——`init`/`add` 在 Node 18 上照常可用，只有读 `.ts` 配置的 `gen` 不行，更老的 Node 请改用 `abp.api.config.json`（此时 `gen` 会给出同样的提示）。

### `jc-abp add <name> [--from <registryDir>] [--dest <dir>]`

把 registry 外壳（如 `auth`）拷进项目，默认落 `src/<name>`，**拒绝覆盖任何已存在的文件**。带 manifest 的条目会按声明分发到各自目标目录并改写相对 import。

### `jc-abp help`

打印用法。
