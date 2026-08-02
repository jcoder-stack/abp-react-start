<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lockup-dark.svg">
    <img src="docs/assets/lockup.svg" alt="ABP React Start" width="352" height="64">
  </picture>
</h1>

<p align="center">给 ABP 后端配一套现代 React 前端——登录、权限、多租户、本地化、CRUD 页全都开箱可跑。</p>

---

## 这是什么

对着一个 ABP 后端从零搭前端，重复劳动是固定的那几样：OIDC 握手与 token 刷新、会话怎么存才不泄漏、权限与特性开关怎么下发到组件、多租户与语言怎么切、后端 DTO 怎么变成类型安全的请求、再加一套长得不像模板的后台 UI。

ABP React Start 把这些一次做完：`jc-abp init` 一条命令落地一个能跑的应用——认证外壳、侧栏布局、登录页、用户/角色/租户/设置/个人资料五个管理页，以及一套写自己业务页的表格与表单原语。做完这些它就退场：**给你的是源码，不是运行时依赖**，UI 全在你仓库里，改它不需要绕过任何抽象。

token 全程不进浏览器——所有请求经服务端代理，会话是一张 httpOnly 加密 cookie。这不是可选加固，是默认且唯一的形态。

## 技术栈

| 层 | 用什么 | 为什么 |
| --- | --- | --- |
| 框架 | [TanStack Start](https://tanstack.com/start) 1.x + React 19 | 要 server function 这个编译期边界，才能把 token 关在服务端 |
| 路由 | TanStack Router | 类型安全的文件路由；`beforeLoad` 正好是挂鉴权守卫的位置 |
| 数据 | TanStack Query 5 + [orval](https://orval.dev) | 从 ABP swagger 生成 react-query hooks，DTO 与端点全程类型安全 |
| 表格 / 表单 | TanStack Table 9 + TanStack Form 1 | headless，样式与交互归我们，不跟组件库的观感打架 |
| UI | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS 4 | 源码分发。组件的宿命是被改，那就装进你的仓库 |
| 校验 | zod 4 | server function 入参、env、表单三处共用一套 schema |
| 后端 | ABP Framework | 认证走 OpenIddict（Authorization Code + PKCE）或密码登录 |

主题是一套完整的设计系统，不是 shadcn 默认配色——色板、排版刻度、层次、组件规格见 [`DESIGN.md`](DESIGN.md)。

## 组成

### npm 包（运行时）

运行时全部收在**一个** npm 包 `@jcoder-stack/abp-react` 里，按子路径分域导出——刻意不提供根导出，避免纯前端 bundle 拖进 `proxy`/`auth` 这类服务端代码。

| 子路径 | 作用 |
|---|---|
| `@jcoder-stack/abp-react/logger` | 同构日志：作用域、字段绑定、默认脱敏、env 开关 |
| `@jcoder-stack/abp-react/core` | ABP 线上格式归一：application-configuration 的类型 + zod（容错解析）、`PagedResult<T>`、错误信封（`HttpError`/`toHttpError`） |
| `@jcoder-stack/abp-react/proxy` | ABP 代理网关与调用层：贴 Bearer 转发、401→刷新→重放、幂等重试、超时；策略头组装、会话代调、身份派生；ABP auth 运行时工厂 `createAbpAuthRuntime` 与登录/回调/登出/文化/租户 handler——宿主只在 copy-in 传覆盖项 |
| `@jcoder-stack/abp-react/auth` | 授权认证核心：登录策略层（OIDC/password）+ 会话层（加密分块 cookie、刷新、登出）；宿主无关、后端无关 |
| `@jcoder-stack/abp-react/permissions` | 权限判定原语 `isGranted` + 变参 checker |
| `@jcoder-stack/abp-react/router` | TanStack Router beforeLoad 路由守卫 `requireAuth` / `requirePermission`（`@tanstack/react-router` 作 peerDep，不用 TanStack 的消费者不受牵连） |
| `@jcoder-stack/abp-react/i18n` | 两层合并 translator（后端 ABP 资源覆盖前端词库），可注入 interpolate/plural |
| `@jcoder-stack/abp-react/react` | `AppConfigProvider` / `SessionProvider` + hooks（用户/权限/设置/特性/本地化/菜单）+ `<PermissionGuard>`/`<FeatureGuard>` |

`react` / `@tanstack/react-router` / `zod` 都是 **optional peerDependency**：只写 BFF 的消费者不必装 React 与 router，只写前端的也不必装 zod。

| 包 | 作用 |
|---|---|
| `@jcoder-stack/cli` | `jc-abp` CLI：`gen`（orval 预设生成 react-query 客户端）+ `add`（拉取 registry 外壳）+ `init`（一站式初始化） |

### 源码分发（装进你的仓库）

`@jcoder-stack/registry` 里装的是**源码而非编译产物**，由 `jc-abp init` / `jc-abp add auth` / `npx shadcn add` 按 manifest 落位，落下之后归你维护：

- **认证外壳** → `src/auth/`：server functions、请求中间件、五条 API 路由、`auth.config.ts`。这几个文件必须 copy-in 而不能进 npm 包——[原因见架构文档](docs/architecture.md#为什么-server-fn-和中间件必须-copy-in)。
- **UI blocks** → `src/components/`、`src/routes/`：侧栏布局、登录页、表格、表单、树、日期选择器、五个管理页。

它和 `@jcoder-stack/cli` 一起装作 devDependency——落位完就没它的事了。

## 快速开始

```bash
# 1. 建应用（用官方现行的 @tanstack/cli；不要加 --router-only，那是没有 Start 能力的兼容模式）
npx @tanstack/cli create my-app && cd my-app

# 2. 装运行时包 + 开发期的 CLI 与 registry
bun add @jcoder-stack/abp-react
bun add -D @jcoder-stack/cli @jcoder-stack/registry

# 3. 一站式初始化：播种基线配置与主题，落认证外壳，装齐所有块，并接好 __root.tsx / router.tsx
npx jc-abp init          # --no-admin 可跳过管理后台五页

# 4. 改 .env（照 .env.example 填自己后端的 client id）与 abp.api.config.ts

# 5. 生成 API 客户端并启动
npx jc-abp gen && bun run dev
```

**详细步骤看 [`docs/guides/initialize-a-project.md`](docs/guides/initialize-a-project.md)** —— 每步实际写了哪些文件、怎么对待已有文件、失败长什么样、怎么验证。

两个必须知道的点：

- `init` 是**一次性脚手架步骤，不是增量更新器，也不回滚**。检测到认证外壳已存在会在动第一个文件之前中止；中途失败请换干净目录重来，别重跑。只想更新某个块用 `npx shadcn add <块的 json> --overwrite`。
- 用 npm 且 npmrc 里配了 `allow-scripts=` 时 `init` 会拒绝开工——`npx` 把该配置注入子进程而 npm 不接受这个来源（`EALLOWSCRIPTS`），shadcn 装依赖必然失败。移走它，或改用 bun。

参照应用是 [`examples/starter`](examples/starter)，它本身就是这套流程的产物——由 [`scripts/regenerate-example.sh`](scripts/regenerate-example.sh) 重放「脚手架 → 装包 → init → gen」再叠一份清单化的手写增量得到，所以既是活文档也是 CLI 与 registry 的端到端回归。**要改块组件请改 [`registry/ui/blocks/**`](registry/ui) 再重放脚本**，不要直接改 starter 里的块产物。

## 文档

| 文档 | 内容 |
| --- | --- |
| [架构](docs/architecture.md) | 分层、请求链路、三种分发形态、为什么这么切 |
| [初始化项目](docs/guides/initialize-a-project.md) | 从零到能跑的完整步骤、装出来的项目结构、排查 |
| [按需装块](docs/guides/install-blocks.md) | 只装某几块时的顺序与前置依赖 |
| [列表页与 CRUD](docs/guides/abp-table.md) | `useAbpTable` / `useAbpSheet` 从 service 描述符到整页接线 |
| [表单体系](docs/guides/forms.md) | 四层架构、字段组件、校验的四条通道 |
| [设计规范](DESIGN.md) | 色板、排版、层次、组件规格 |

## 开发

```bash
bun install
bun run typecheck   # 类型检查（含 cli templates）
bun run test        # vitest
bun run lint        # biome
bun run build       # tsup bundle 各包到 dist（发布产物）
```

包的 `exports` 在仓库内指向 `src` 而不是 `dist`——这不是漏配，是 workspace 内直接吃 TS 源码；发布时由 `prepack` 临时改写。机制见[架构文档的发布态一节](docs/architecture.md#发布态与开发态)。

## License

[MIT](LICENSE)
