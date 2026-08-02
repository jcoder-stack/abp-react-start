# starter — jc-abp 参照应用

`jc-abp init` 全流程跑完后的最终形态：`@jcoder-stack/*` 内核 + registry 认证外壳 + shadcn 管理台 block 拼出的一个可跑的 ABP 前端（TanStack Start）。用作活文档、CLI 回归基准，也是联调冒烟环境。架构细节见根 [`README.md`](../../README.md)（尤其[「初始化后的项目结构」](../../README.md#初始化后的项目结构)一节）与 [`docs/`](../../docs)，本文档只讲这个应用本身怎么跑、有哪些页面。

## 这个目录是生成出来的

本应用**不手工演进**，而是 [`scripts/regenerate-example.sh`](../../scripts/regenerate-example.sh) 的产物：

    @tanstack/cli create → 装 @jcoder-stack 包 → jc-abp init → jc-abp gen  ＋  一份清单化的手写增量

这样脚手架/CLI/registry 有毛病能在重放里当场暴露，产物结构也跟真实开发者拿到的一致。由此有两条纪律：

- **改组件请改 [`registry/ui/blocks/**`](../../registry/ui) 或 [`packages/cli/**`](../../packages/cli)，然后重放脚本**，不要直接改 starter 里由 registry 块分发的文件（`src/routes/_layout*.tsx`、`src/routes/login.tsx`、`src/routes/_layout/_authed/{identity/**,tenants,settings,profile}/**`、`src/components/{abp,data-table,form,tree,combobox,date-picker}/**`、`src/routes/-showcase/**`、`src/permissions.ts`、`src/api/abp-fetch.ts`）——下次重放就会被覆盖。
- **`src/api/**` 是 `jc-abp gen` 的 orval 产物，`src/components/ui/**` 是 shadcn 官方原语原样安装**，两者都不手改。

手写增量只有这些（脚本 `HANDWRITTEN_PATHS` 清单，重放时原样保留）：`src/routes/__root.tsx` 与 `src/router.tsx`（`init` 会写一份基础接线，这里保留的是 starter 自己加了词条与 favicon/manifest 的版本）、`src/routes/_layout/forbidden.tsx`、`src/routes/_layout/_authed/books/**`、`src/menu.tsx`、`src/i18n/*.json`、`test/**`、`tsconfig.json`、`vite.config.ts`、`.gitignore`、`.cta.json`、`public/**`、`.env`、本 README。`src/menu.tsx` 是 app-shell 净版加一条 Book 项——这是它与块产物之间唯一预期的 diff。

重放（默认对着 `https://localhost:44316` 的演示后端）：

```bash
bun install && bun run build          # 脚本吃 packages/cli/dist
scripts/regenerate-example.sh         # 就地重放 examples/starter
scripts/regenerate-example.sh --target /tmp/demo --preserve-from examples/starter --backend https://your-abp:44300
```

`--target` 指到 `examples/*` 之外（如上面的 `/tmp/demo`）时，`workspace:*` 依赖与 registry 目录都没法在仓库内解析——这条路径只对拿已发布 `@jcoder-stack` 包重放的场景成立，仓库内自测请留在 `examples/*` 下。

## 先决条件

- bun ≥ 1.3。
- 一个在线的 ABP 后端（`.env.example` 占位默认 `https://localhost:44300`，OpenIddict；改 `.env` 时以你实际后端为准——本仓库联调用的演示后端跑在 `https://localhost:44316`）。
- 后端 OpenIddict 客户端注册（登录联调必需）：
  - RedirectUri 含 `http://localhost:5173/api/auth/callback`、PostLogoutRedirectUri 含 `http://localhost:5173/`
  - 若后端只注册了 `localhost:3000` 的回调（本仓库演示后端的历史注册），可改用 `bun run dev -- --port 3000` 复用既有注册；**密码登录不走回调，不受端口影响**
  - 授权类型 Authorization Code + PKCE（S256）、刷新令牌（`offline_access`）
  - `.env` 的 `AUTH_CLIENT_ID`/`AUTH_SCOPE` 与该注册一致。

## 启动

```bash
# 仓库根
bun install
cp examples/starter/.env.example examples/starter/.env
# 按后端实际改 AUTH_ISSUER / AUTH_CLIENT_ID / AUTH_SCOPE / AUTH_ABP_BASE_URL / AUTH_SESSION_SECRET

cd examples/starter
bun run dev            # http://localhost:5173（vite 默认端口）
```

`AUTH_DEBUG=true` 可打开 auth 全链路调试日志（不输出 token 原文）。

本地 ABP 用自签/dev 证书时首页会 500——Node 不读系统钥匙串，服务端到后端那一跳被拒。导出证书后带着它启动（这个变量 Node 只在启动时读，写进 `.env` 不生效）：

```bash
dotnet dev-certs https --export-path ~/.aspnet-dev.crt --format PEM
NODE_EXTRA_CA_CERTS=~/.aspnet-dev.crt bun run dev
```

## 页面清单

`/` 与 `/login` 脱离侧边栏壳独立成页；其余页面由 `_layout.tsx`（侧边栏壳）+ `_layout/_authed.tsx`（登录守卫壳）包裹，均需登录：

| 路由 | 来源 | 说明 |
|---|---|---|
| `/` | app-shell 块 | 全幅营销落地页：顶导航 + 英雄 + 特性 + `-showcase/*` 的组件实时演示 + 页脚；匿名给登录入口，已认证给「进入控制台」 |
| `/login` | app-shell 块 | 登录页 |
| `/identity/users`、`/identity/roles` | admin-pages 块 | 需 `AbpIdentity.Users`/`AbpIdentity.Roles` 权限 |
| `/tenants` | admin-pages 块 | 需 `AbpTenantManagement.Tenants` 权限 |
| `/settings` | admin-pages 块 | 邮件设置，需 `SettingManagement.Emailing` 权限 |
| `/profile` | admin-pages 块 | 个人资料/改密，登录即可访问，走 `NavUser` 下拉入口 |
| `/books` | 手写增量 | `useAbpTable` + `useAbpSheet` 的三层写法（L0 标准 / L1 `source` 回调 / L2 纯 `DataTable`，同页页签对照），[`docs/guides/abp-table.md`](../../docs/guides/abp-table.md) 的活样板 |
| `/books/new` | 手写增量 | 独立长表单页，绕开 `SheetForm` 手写字段错误映射——给不适合弹层表单的场景留的逃生舱 |

admin 五页与两个 books 页在 `src/routes/_layout/_authed/` 下按模块目录组织（`identity/{users,roles}.tsx`、`tenants/index.tsx`、`settings/index.tsx`、`profile/index.tsx`、`books/{index,new}.tsx`），具体落位与生成方式见根 README「初始化后的项目结构」节。

## 测试

测试文件在 `test/`，但由仓库根的 vitest 配置统一驱动，从仓库根跑：

```bash
bun run test        # vitest run，含 packages/**、registry/**、examples/starter/test/**
bun run typecheck    # 含本应用的 tsconfig
bun run lint         # biome
```
