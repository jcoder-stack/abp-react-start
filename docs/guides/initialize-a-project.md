# 从零初始化一个项目

跟着走一遍，你会得到一个能登录、带侧栏壳、带权限守卫、带 i18n、并且已经对接你自己 ABP 后端的 TanStack Start 应用。

README 的[快速开始](../../README.md#快速开始)是这份文档的浓缩版——命令一样，这里补的是**每步实际发生了什么、失败长什么样、怎么确认装对了**。

---

## 0. 前置

| 需要 | 为什么 | 怎么确认 |
| --- | --- | --- |
| Node（现代版本） | CLI 用到 `node:util` 的 `parseArgs` 与递归 `readdirSync` | `node -v` |
| bun 或 npm | 装依赖；`init` 会自动探测用哪个 | `bun -v` / `npm -v` |
| `npx` 可用 | `init` 经它调用 shadcn 与 router-cli | `npx -v` |
| 一个 ABP 后端 | 生成 API 客户端要读它的 swagger | 浏览器打开 `<你的后端>/swagger/v1/swagger.json` 能出 JSON |

后端不在线也能走完前四步，只有第 6 步 `gen` 需要它——或者你手上有一份离线的 swagger 文件也行。

> **用 npm 且 npmrc 里配了 `allow-scripts=`**：`init` 会拒绝开工并说明原因。`npx` 会把解析后的 npm 配置以 `npm_config_*` 注入子进程，而 npm 不接受这个来源的 `allow-scripts`（报 `EALLOWSCRIPTS`），shadcn 装块依赖时必然失败。把它从 npmrc 移走、临时 `npm config delete allow-scripts`、或改用 bun（目录里有 `bun.lock` 时 shadcn 走 `bun add`，不经过这条链路）。

---

## 1. 建应用

```bash
npx @tanstack/cli create my-app
cd my-app
```

**不要加 `--router-only`**——那是纯文件路由的兼容模式，没有 Start 的服务端能力，而本框架的认证外壳依赖 server function。不加它默认就是全栈 TanStack Start。

---

## 2. 装包

```bash
# 运行时
bun add @jcoder-stack/abp-react

# 开发期：CLI 与 registry（外壳与块的源，装完就靠 init 落位）
bun add -D @jcoder-stack/cli @jcoder-stack/registry
```

`@jcoder-stack/registry` **必须装成 devDependency**——CLI 会从 `node_modules/@jcoder-stack/registry` 找 copy-in 源，装成运行时依赖它也找得到，但那些文件不该进生产包。

各包职责：`react` 提供 Provider 与 hooks，`auth` 是登录策略与加密 cookie 会话，`abp-proxy` 是 ABP 代理网关与登录/回调/登出/文化/租户 handler，`http` 是带超时与重试的 fetch client，`abp-core` 归一 ABP 的配置与分页类型，`i18n` 做两层词条合并，`permissions` 提供 `isGranted`，`router` 提供路由守卫，`logger` 是同构日志。

---

## 3. `jc-abp init`

```bash
npx jc-abp init          # 需要 tenants/users/roles 等管理后台页面
npx jc-abp init --no-admin   # 只要认证外壳与空壳布局
```

### 它做了什么

按顺序：

1. **两道前置闸**——检测到认证外壳已存在就在写第一个文件之前中止；用 npm 且 `allow-scripts` 会失败时同样中止。
2. **播种基线**：缺 `components.json` 就写一份（`new-york` / `neutral`，并把 css 入口填进去）；缺 `src/lib/utils.ts` 就补 `cn()`；css 入口里没有 `--background` 变量时**整体替换成主题文件**，原文件备份为 `.bak`。
3. **按需装依赖**：只装这次真正播种了的那部分（`clsx` / `tailwind-merge` / `tw-animate-css`），外加根接线要用的 `@tanstack/react-router-ssr-query`（没有任何块声明它）。
4. **落认证外壳**：`src/auth/*` 五个文件、五个 API 路由、`src/env.ts`、`.env.example`。
5. **让位首页**：脚手架自带的 `src/routes/index.tsx` 改名为 `.bak`，因为 app-shell 块要放自己的落地页。
6. **按依赖序装 shadcn 块**：`abp-layout` → `abp-login` → `app-shell` → `data-table` → `combobox` → `date-picker` → `form` → `abp-table` → `tree` → `abp-permission-sheet`，默认再加 `admin-pages`。每块装完会校验声明的产物真的落盘——shadcn 有可能静默中止批量写入却仍然 exit 0。
7. **接线根文件**：`src/routes/__root.tsx` 整份写入（两个 Provider、块词条深合并、`abp-fetch` 引入、错误边界），`src/router.tsx` 就地补 QueryClient 与 SSR 集成；两者的脚手架原版都备份为 `.bak`。同时播种 `src/i18n/app-messages.json`——分发的菜单引用 `App::` 词条，而那个桶归应用所有，没有块会提供。
8. **收尾**：`--no-admin` 时覆写 `src/menu.tsx`；播种 `tsr.config.json` 并生成路由树；播种 `abp.api.config.ts`。

css 入口的探测顺序是 `src/styles/app.css` → `src/styles.css` → `src/index.css` → `src/app.css`。都探不到且没有 `components.json` 时它会直接报错停下——先把 css 入口建好再跑。

### 它怎么对待已有文件

| 对象 | 行为 |
| --- | --- |
| 认证外壳的任一目标已存在 | **中止**，一个文件都不写（`.env.example` 例外，跳过） |
| `components.json`、`src/lib/utils.ts`、`tsr.config.json`、`abp.api.config.ts`、`src/i18n/app-messages.json` | 已存在则跳过 |
| css 入口、`src/routes/index.tsx` | 备份为 `.bak` 后替换/让位 |
| `src/routes/__root.tsx` | 备份为 `.bak` 后整份替换（结构改造，见第 4 节） |
| `src/router.tsx` | 备份为 `.bak` 后就地补四处；认不出脚手架形状时才整份替换 |
| shadcn 块的产物 | 强制覆盖 |
| `src/menu.tsx` | 仅 `--no-admin` 时覆盖 |

### 中途失败了怎么办

`init` 是**一次性脚手架步骤，不是增量更新器，也不回滚**。报错信息里会列出已经完成的步骤。重来的正确做法是换个干净目录，或删掉上次的产物；直接重跑会撞上第一道闸然后停下。

只想更新某一个块，不必走 init：

```bash
npx shadcn add node_modules/@jcoder-stack/registry/public/r/<块名>.json --overwrite
```

### 确认装对了

```bash
ls src/auth src/routes/_layout src/components/abp
```

应当看到 `src/auth/` 下五个文件、`src/routes/_layout.tsx` 与 `_layout/_authed.tsx`、`src/components/abp/{layout,login,table,crud,sheet}`。

---

## 4. init 写了什么胶水

页面与路由由块提供，但把它们接起来的两个文件归应用所有，`init` 已经替你写好了。这一节说明它写了什么、想改的时候动哪里——**不需要你动手接线**。

### `src/routes/__root.tsx`（整份写入）

脚手架原版备份在 `__root.tsx.bak`。这里是整份替换而不是就地补，因为改动是结构性的：`createRootRoute` 要变成 `createRootRouteWithContext`，`shellComponent` 要拆成 `component` 加一层文档壳，而两个 Provider 要包住的 `<Outlet/>` 在脚手架版本里根本不存在——它走的是 `shellComponent` 的 `children`，没有可插入的接缝。

写入的内容：

- `import "@/api/abp-fetch"`——副作用式注册生成 API 客户端的 fetchFn，全应用只接这一次
- `beforeLoad` 经 `queryClient.ensureQueryData` 取 appState，带 `staleTime`；路由守卫读的 `context.identity` 由它提供
- `AppConfigProvider` + `SessionProvider` 包住 `<Outlet/>`
- 按磁盘上实际存在的 `*-messages.json` 生成词条 import 并深合并，`src/i18n/` 下的排最后（同名 key 后到先赢，所以改一处 json 就能覆盖块的默认文案）
- `errorComponent` / `notFoundComponent` 接 app-shell 的 `shell-boundary.tsx`
- 首绘前的主题脚本（与 `ThemeToggle` 共用 `localStorage.theme`，没有它暗色会闪白）与 Inter 变量字体（主题的 510/590 两档字重只有变量字体取得到）

脚手架原本挂了 TanStack devtools 的话会一并带回来；没挂就不写，免得引到没装的包。

完整参照 [`examples/starter/src/routes/__root.tsx`](../../examples/starter/src/routes/__root.tsx)——它在这份模板之上还多了应用自己的词条与 favicon/manifest。

### `src/router.tsx`（就地补四处）

只插入 QueryClient 相关的四处：两个 import、`new QueryClient()`、`context: { queryClient }`、`setupRouterSsrQueryIntegration`。你原有的引号风格、`createRouter` 别名、其它 `createRouter` 选项都保留，改动对着脚手架只有五行。

万一将来脚手架换了形状、锚点对不上，`init` 会退回整份模板并在完成步骤里说明——宁可覆盖风格，也不能留下一个没有 `context` 的 router。

### `src/i18n/app-messages.json`（播种，不覆盖）

app-shell 分发的 `menu.tsx` 用 `App::Home` / `App::System` / `App::Settings` 作标签，而「App」桶归应用所有，没有块会提供它——不播种的话侧栏直接显示原始 key。这份文件归你，重跑 `init` 不会覆盖你的编辑。往里加自己的词条即可，它在合并链的最后。

---

## 5. 配置后端地址

```bash
cp .env.example .env    # 改成你自己的 ABP 地址、client id、cookie 密钥
```

再改 `abp.api.config.ts` 的 `input` 指向你的 swagger：

```ts
export default defineApiConfig({
  input: "https://your-abp-host/swagger/v1/swagger.json",
  output: "src/api",
});
```

`output` 默认 `src/api`，`zod` 默认开（生成 zod schema 供表单校验复用）。要对接多个后端就写成 `{ targets: { identity: {...}, business: {...} } }`——注意这种形态下命令行的 `--input`/`--output` 不再生效。

配置里没有 `baseUrl`：`input` 只是生成时读取 swagger 的地方，运行期请求发往哪里由 `src/api/mutator.ts` 决定——在应用启动时调一次 `configureAbpMutator({ baseUrl })`（starter 走 BFF 代理，baseUrl 留空即可）。

---

## 6. `jc-abp gen`

```bash
npx jc-abp gen
# 自签证书的本地后端：
NODE_TLS_REJECT_UNAUTHORIZED=0 npx jc-abp gen
```

产出三个目录加一个文件：

- `src/api/endpoints/` —— 按 tag 拆分的 react-query hooks 与 fetch 函数
- `src/api/models/` —— DTO 类型
- `src/api/schemas/` —— zod schema（`zod: true` 时）
- `src/api/mutator.ts` —— 请求管道，**只在不存在时创建**，你的改动不会被覆盖

生成完会校验 `endpoints/` 非空——orval 遇到无效或空的 swagger 会 exit 0 却不产出任何东西，这个校验就是为了让那种情况响亮地失败。

`input` 也接受本地文件路径，所以后端不在线时可以先拿一份 swagger.json 离线生成。

---

## 7. 跑起来

```bash
bun run dev
```

逐项确认：

1. 打开首页 → 看到落地页（未登录）
2. 点登录 → 跳到 ABP 的登录页 → 登录后回到应用
3. 进控制台 → 侧栏在、当前项有指示条
4. 打开 `/tenants` 或 `/identity/users` → 表格有数据（装了 `admin-pages` 时）
5. 切语言 → 整页刷新后词条与 `<html lang>` 都变了

---

## 排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `init` 立刻中止，说外壳已存在 | 这个目录装过了 | 换干净目录，或删掉上次产物 |
| `init` 报 `EALLOWSCRIPTS` | npmrc 里的 `allow-scripts` 经 `npx` 注入子进程 | 见前置那节 |
| `init` 说找不到 css 入口 | 你的 css 不在四个探测位置 | 先建好 css 入口，或手动放一份 `components.json` |
| `gen` 报 endpoints 为空 | swagger 无效、地址错、或后端没起 | 浏览器直接打开 swagger 地址验证 |
| `gen` 报 TLS 错误 | 本地后端自签证书 | 加 `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| 页面白屏、控制台说 Provider 缺失 | `__root.tsx` 被改坏或被 `.bak` 覆盖回去了 | 对照第 4 节列的几项，或从 starter 那份取回 |
| 登录后一直跳回登录页 | `.env` 的 client id / 密钥 / 回调地址对不上 | 核对 ABP 端的客户端配置 |
| `jc-abp` 命令找不到 | monorepo 内直接跑需要先 build | `bun run build` 后再用 `node packages/cli/bin/jc-abp.js` |

---

## 装出来的项目长什么样

全部跑完后应用大致长这样（以 [`examples/starter`](../../examples/starter) 实测为准；`# 生成` 标注的文件重跑对应命令会整体重写，不要手改）：

```
your-app/
├── .env.example                # jc-abp add auth 落位；AUTH_* 环境变量样板
├── components.json             # shadcn CLI 配置；缺失时由 init 播种（new-york/neutral）
├── abp.api.config.ts           # jc-abp gen 的可选配置（多 target 时用 defineApiConfig）
└── src/
    ├── env.ts                  # 应用自有 server/client env（zod 校验）；AUTH_* 由 auth 内部校验，勿重复
    ├── app-env.d.ts            # ImportMetaEnv / process.env 类型声明
    ├── menu.tsx                # app-shell 块：导航起点，MenuItem<FileRouteTypes["to"]>[]（路由改名编译期报错）
    ├── permissions.ts          # app-shell 块：ABP 风格权限常量，守卫/菜单/can() 统一引它，杜绝裸字符串
    ├── router.tsx              # 脚手架产物，init 就地补了 QueryClient 与 setupRouterSsrQueryIntegration
    ├── routeTree.gen.ts        # 生成，勿手改
    ├── styles.css              # Tailwind + ABP React Start 主题 token；缺 --background 等变量时由 init 整体替换（原文件备份 .bak）
    │
    ├── auth/                   # jc-abp add auth 落位——装配/handler/守卫下沉 npm 包，只剩 4 个文件
    │   ├── auth.config.ts        # ★ 唯一要看的文件：createAbpAuthRuntime(process.env, {…覆盖项})
    │   ├── runtime.ts            # 进程级运行时单例
    │   ├── server-fns.ts         # getIdentityFn / getAppStateFn / abpRequestFn（编译约束必留 copy-in）
    │   ├── middleware.ts         # TanStack 请求中间件（同上）
    │   └── index.ts              # barrel：server fns + requireAuth/requirePermission
    │
    ├── api/                    # jc-abp gen 生成（orval）
    │   ├── endpoints/            # 按 ABP 应用服务分组的 react-query hooks
    │   ├── models/ schemas/      # DTO 类型与 zod schema
    │   ├── mutator.ts            # 只在首次播种，此后归你自定义
    │   └── abp-fetch.ts          # app-shell 块：orval mutator → auth 服务端代理的桥接
    │
    ├── components/
    │   ├── ui/                 # shadcn 官方原语，原样安装不改（定制走主题层的 data-slot 规则）
    │   ├── data-table/         # 通用服务端分页/排序/搜索表格，零 ABP 依赖
    │   ├── form/               # 表单壳 + 字段组件 + 服务端字段错误映射，零 ABP 依赖
    │   ├── combobox/ tree/ date-picker/   # 通用原语块，零 ABP 依赖
    │   └── abp/                # ABP 适配块，按块分子目录
    │       ├── layout/           # 侧栏 / 头部 / 面包屑 / 语言主题切换 / BrandMark（换品牌只改这一个文件）
    │       ├── login/            # 密码登录卡片 + OIDC 入口
    │       ├── crud/             # createCrudService / AbpTableSource / 表单错误映射
    │       ├── table/            # useAbpTable：表格 + 筛选面板 + 批量操作 + 行菜单
    │       ├── sheet/            # useAbpSheet：增删改抽屉
    │       └── permission/       # 权限树 Sheet
    │
    ├── hooks/use-mobile.ts     # shadcn 官方 hook，随 ui 安装
    ├── lib/utils.ts            # cn()；缺失时由 init 播种
    ├── i18n/{en,zh-Hans}.json  # 应用自有词库（"App" 桶），与后端 ABP 资源两层合并
    │
    └── routes/                 # TanStack 文件路由
        ├── __root.tsx            # init 写入的胶水：Provider 接线 + 词条深合并 + abp-fetch 引入 + 错误边界
        ├── index.tsx             # app-shell 块：全幅营销落地页，脱离 _layout 侧栏壳
        ├── login.tsx             # app-shell 块：/login，同样脱离壳
        ├── shell-boundary.tsx    # RouteError / RouteNotFound——刻意不经 Provider（出错时子树已被替换）
        ├── _layout.tsx           # pathless 布局壳（侧栏 + 头部），内容区 padding 由它统一给
        ├── _layout/
        │   ├── forbidden.tsx      # 403 页，手写维护
        │   ├── _authed.tsx        # pathless 守卫壳，beforeLoad 挂 requireAuth()
        │   └── _authed/           # admin-pages 块：identity/{users,roles}、tenants、settings、profile
        ├── -showcase/            # `-` 前缀 = 非路由，落地页的实时组件演示（starter 增量，不随 registry 分发）
        └── api.auth.{login,callback,logout}.ts, api.culture.ts, api.tenant.ts
```

## 下一步

- 加一个自己的列表 / CRUD 维护页 → [`abp-table.md`](abp-table.md)
- 表单的写法与校验 → [`forms.md`](forms.md)
- 只想装某几个块、不走 init → [`install-blocks.md`](install-blocks.md)
- 主题与排版规范 → [`DESIGN.md`](../../DESIGN.md)

想看完整的参照实现，[`examples/starter`](../../examples/starter) 就是这套流程的产物——它由 [`scripts/regenerate-example.sh`](../../scripts/regenerate-example.sh) 重放「脚手架 → 装包 → init → gen」再叠一份清单化的手写增量得到，所以它既是活文档也是 CLI 与 registry 的端到端回归。
