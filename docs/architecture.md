# 架构

这份文档讲**这套框架为什么长这样**——分几层、每层守什么边界、哪些东西刻意不做成 npm 包。要动手搭项目看 [`guides/initialize-a-project.md`](guides/initialize-a-project.md)，要改样式看 [`../DESIGN.md`](../DESIGN.md)。

## 一句话

ABP 后端 + 纯 React 前端（TanStack Start），token 全程不进浏览器，UI 层以 shadcn 式源码分发而不是组件库。

## 三种分发形态

同一套东西被切成三份，切法取决于**消费者需不需要改它**：

| 形态 | 是什么 | 为什么是这个形态 |
| --- | --- | --- |
| **npm 包**（`@jcoder-stack/*`） | 协议、加解密、重试、判定这些无分歧的机制 | 谁都不想 fork 一份 OIDC 握手。升级靠 `bun update`，行为由测试锁住 |
| **copy-in 外壳**（`registry/auth/**`，`jc-abp add auth`） | server functions、请求中间件、API 路由、`auth.config.ts` | 这些是**编译期构造**，见下 |
| **shadcn block**（`registry/ui/blocks/**`，`npx shadcn add`） | 全部 UI | 组件的宿命就是被改。装进你的仓库，改它天经地义 |

### 为什么 server fn 和中间件必须 copy-in

TanStack Start 的 `createServerFn` / `createMiddleware` 不是普通函数，是给打包器看的标记：构建时它要把同一个声明拆成服务端实现与客户端 RPC 存根两半。这个拆分由 Start 的 Vite 插件在**应用自己的编译单元里**完成——预编译进 npm 包的 server fn 拆不了，装进来就是一个跑在客户端的空壳。

所以 `src/auth/` 下这四个文件是编译约束逼出来的，不是设计偏好：

```
auth.config.ts   ★ 唯一预期你会改的：createAbpAuthRuntime(process.env, {…覆盖项})
runtime.ts         进程级单例，server 侧 getAuthRuntime()
server-fns.ts      getAppStateFn / getIdentityFn / abpRequestFn  ← 编译约束
middleware.ts      authMiddleware（取会话、过期就刷新并回写 cookie）← 编译约束
```

装配、handler、守卫全都下沉到了包里，copy-in 只剩这四个文件外加五条 API 路由。`auth.config.ts` 不传任何覆盖项时，行为与包内默认完全一致——它存在是为了给你一个改的地方，不是为了让你必须填。

## 包的分层

依赖只朝一个方向流，下层不知道上层存在。运行时是单个包 `@jcoder-stack/abp-react`，下面的 `/xxx` 都是它的子路径导出：

```
        ┌─────────────────────────────────────────────┐
 UI     │  registry blocks（shadcn 分发的全部组件）      │
        ├─────────────────────────────────────────────┤
 React  │  /react       Provider + hooks              │
        │  /router      beforeLoad 路由守卫            │
        ├─────────────────────────────────────────────┤
 领域   │  /auth        策略层 + 会话层                 │
        │  /proxy       ABP 代理网关 + 运行时工厂        │
        │  /permissions   /i18n                       │
        ├─────────────────────────────────────────────┤
 基础   │  /core        /logger                       │
        └─────────────────────────────────────────────┘
```

| 子路径 | 职责 | 边界 |
| --- | --- | --- |
| `logger` | 作用域日志、字段绑定、默认脱敏、env 开关 | 同构，无依赖 |
| `core` | ABP 线上格式归一：`application-configuration` 的类型与 zod 解析、`PagedResult<T>`/`toAbpListParams`、错误信封（`HttpError`/`toHttpError`） | 只有类型与解析，不发请求。**容错解析**：后端多给的字段不报错，少给的按可选处理，坏掉的叶子逐个降级而不牵连整棵树——ABP 各版本字段有出入 |
| `auth` | 登录策略层（OIDC / password）+ 会话层（加密分块 cookie、刷新、登出） | **宿主无关、后端无关**。不 import 任何 TanStack、不认识 ABP |
| `proxy` | 贴 Bearer 转发、401→刷新→重放、策略头组装、身份派生、`createAbpAuthRuntime` | ABP 协议知识集中在这里 |
| `permissions` | `isGranted` 判定原语 + 变参 checker | 纯函数，不碰网络 |
| `i18n` | 两层合并 translator（后端 ABP 资源覆盖前端词库） | 可注入 interpolate / plural |
| `router` | `requireAuth` / `requirePermission` 守卫 | `@tanstack/react-router` 是 peerDep——不用 TanStack 的消费者不受牵连 |
| `react` | `AppConfigProvider` / `SessionProvider` + hooks + `PermissionGuard` / `FeatureGuard` | 只消费上面几层的数据契约 |

`auth` 与 `proxy` 的分家是这套分层里最值钱的一刀：**换后端**只需要换 `proxy`，`auth` 的 OIDC 握手、PKCE、cookie 密封、刷新时序一行不用动。

这八个域同住一个 npm 包，但**没有根导出**：一个把全部子路径糊在一起的 `.` 入口会让浏览器 bundle 顺着 `proxy` 拖进服务端代码，分层就白分了。

## 请求怎么走

浏览器永远拿不到 access token。所有打后端的请求都经服务端代理：

```
浏览器
  │  ① orval 生成的 react-query hook 调 fetchFn
  ▼
src/api/abp-fetch.ts        （app-shell 块分发的桥接）
  │  ② 转成 abpRequestFn 调用
  ▼
src/auth/server-fns.ts      ← 编译边界，往下都在服务端
  │  ③ authMiddleware 取会话，过期就刷新并回写 Set-Cookie
  ▼
@jcoder-stack/abp-react/proxy
  │  ④ 贴 Bearer、装 __tenant / .AspNetCore.Culture 策略头
  │  ⑤ 401 → 刷新 → 重放一次；幂等方法按需重试；超时
  ▼
ABP 后端
```

几个刻意为之的点：

- **代理永不因状态码 throw**，状态码原样透传。要不要把 403 当异常，是调用方的事。
- **401 只重放一次**。刷新失败就是失败，不做二次尝试——那只会把一次登录过期放大成三次往返。
- **策略头有优先级**：租户走会话优先、cookie 兜底；文化走 cookie 优先——用户显式切语言应该胜过登录时的快照。
- **SSR 一次取数喂两张嘴**：`getAppStateFn` 一趟返回 config 与 identity，分别喂 `AppConfigProvider` 与 `SessionProvider`，避免首屏两次往返。

## 会话

会话是一张 httpOnly 加密 cookie，超长时自动分块：

| cookie | 寿命 | 装什么 |
| --- | --- | --- |
| 会话 | 7 天（与 IdP 的 refresh token 寿命对齐） | 密封的 `AuthSession` |
| 握手 | 10 分钟 | authorize↔callback 之间的密封 `Handshake`，只需活过 IdP 往返 |
| 租户 / 文化 | 1 年 | ASP.NET/ABP 的协议约定，不是应用策略，所以没做成选项 |

**鉴权态一变（登录、登出、切租户、切语言）一律整页跳转**（`window.location.assign`），不走 SPA navigate。这是作废 appState 与全部 query 缓存的唯一可靠时机；SPA 导航会留下一堆属于上一个身份的缓存。

## 表现层

UI 全部经 shadcn registry 分发源码，没有组件库依赖。由此带来两条约束：

- **不 fork shadcn 原语**。要改原语的观感（圆角、焦点环、暗色质感）写进主题层的 `[data-slot="…"]` 规则——这样以后 `shadcn add` 装进来的新组件自动继承。改了原语文件，下次装新组件就会出现两套观感。
- **块之间的依赖写成安装路径，不写名字**。shadcn 把裸名字当官方 registry 的条目，`abp-crud` 会被解析成 `ui.shadcn.com` 上的同名 item 并 404、整块失败；写成 `./node_modules/@jcoder-stack/registry/public/r/<名字>.json` 则按消费项目的根解析，装一个块就能把整条依赖链带上。npm / yarn classic 的 workspace 会把包提升到根 `node_modules`，那里这个相对路径解析不到，需要自己排顺序逐块装。详见 [`guides/install-blocks.md`](guides/install-blocks.md)。

块自己也分层，`abp-` 前缀是分界线：`data-table` / `form` / `combobox` / `date-picker` / `tree` **零 ABP 依赖**，换后端能直接复用；`abp-crud` / `abp-table` / `abp-sheet` / `abp-permission-sheet` 才认识 ABP 协议。表单体系把这条线画得最细（四层，[`guides/forms.md`](guides/forms.md)），换后端只需替换最上面那层的 `mapError`。

## CLI

`jc-abp` 三个命令，各管一段：

| 命令 | 干什么 | 幂等性 |
| --- | --- | --- |
| `init` | 一站式初始化：播种 `components.json` / `cn()` / 主题 css → `add auth` → 按序装齐全部块 → 收尾接线提示 | **不幂等，也不回滚**。检测到认证外壳已存在就在动第一个文件之前中止 |
| `add auth` | 按 `registry/auth/manifest.json` 把认证外壳落位到 `src/auth/`、`src/routes/`、仓库根 | 已存在则跳过 |
| `gen` | orval 预设，从 ABP swagger 生成 react-query 客户端 | 幂等重跑；`mutator.ts` 只在首次播种，此后归你 |

`init` 每装完一块都会校验产物文件确实落盘——shadcn 有静默中止整批写入却仍 `exit 0` 的情况，不查就会得到一个缺文件却"安装成功"的项目。

## 参照实现即回归基准

[`examples/starter`](../examples/starter) 不是手工维护的样板，是 [`scripts/regenerate-example.sh`](../scripts/regenerate-example.sh) 重放「脚手架 → 装包 → `init` → `gen`」再叠一份清单化手写增量的产物。

这意味着脚手架、CLI、registry 三者任何一处坏了，重放时当场暴露，而不是等用户装出来才发现。代价是一条纪律：**改组件请改 `registry/ui/blocks/**` 再重放**，直接改 starter 里的块产物下次重放就没了。

分发完整性还有一层机器检查：`registry/scripts/check-registry-deps.mjs`（`bun run build:registry` 时跑）审计四件事——用到的 ui 原语都声明了、同块互相 import 的文件都登记了、`blocks/` 下没有游离文件、没有 item 引用兄弟块。这四类问题对 typecheck 与测试全都隐形：仓库自己的代码是完整的，只有装出来的项目才会缺。

同一层还有一条产物漂移守卫。`registry/public/r/*.json` 是提交进仓库的分发物，块源码改了却忘了重建，用户 `jc-abp add` 装到的就是旧版本——这同样对 lint/typecheck/test 隐形。`ci` workflow 因此在跑完常规检查后重建一次 registry，再比对 `registry/public` 有无改动，有就失败。**本地改完块源码请跑 `bun run build:registry` 并把产物一起提交。**

## 发布态与开发态

包的 `main`/`exports` 在仓库内指向 `src`：workspace 里直接吃 TS 源码，改包不用先 build。发布出去的 tarball 显然不能这样，于是 `prepack` 在打包前临时改写 `package.json`、`postpack` 还原。`npm pack` / `npm publish` 与 `bun pm pack` 都会触发（除非显式 `--ignore-scripts`）。

`scripts/apply-publish-config.mjs` 把 `publishConfig` 里的 `main`/`types`/`exports` 覆盖字段提到顶层，完成 `src` → `dist` 重定向（npm 原生只认 `publishConfig` 里少数几个键，其余得自己搬）。`@jcoder-stack/abp-react` 与 `@jcoder-stack/cli` 需要它，`@jcoder-stack/registry` 分发的是源码文件、没有 dist，所以对它是空操作。

**包间依赖不走这条路**：提交态的 `package.json` 里直接写真实版本区间（`@jcoder-stack/registry` 依赖 `@jcoder-stack/abp-react@^0.1.0`），不用 `workspace:*` 再由 prepack 改写。bun 靠版本匹配照样把仓库内的包链过去，开发体验不变。

原因是 prepack 改不动 registry 元数据：**npm 在跑 prepack 之前就把 manifest 快照下来当 packument 了**，tarball 是 prepack 之后打的所以干净，元数据里却留着 `workspace:*`。而依赖解析读的正是元数据——包发得出去、装不下来（实测于 verdaccio）。`exports`/`main` 不受影响，那些是从装好的 tarball 里读的，所以同一套改写对它们有效。`scripts/publish-smoke.sh` 因此除了检查 tarball，还断言提交态的 manifest 里没有 `workspace:` 区间。

发布链路只有真跑一遍打包才暴露得出问题，所以 `scripts/publish-smoke.sh` 会实际打出 tarball 并检查内容；CI 在推 `v*` 标签时自动跑它。

## 相关文档

- [初始化项目](guides/initialize-a-project.md)、[按需装块](guides/install-blocks.md)
- [列表页与 CRUD](guides/abp-table.md)、[表单体系](guides/forms.md)
- [设计规范](../DESIGN.md)
