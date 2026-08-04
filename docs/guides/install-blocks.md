# 按需安装块

> 简体中文版。English edition: [`install-blocks.en.md`](install-blocks.en.md)

`jc-abp init` 会按依赖序一次装齐全部块。这份文档针对另一种情况：**你只想要其中几块**，或者想弄清块与块之间的依赖。初次初始化走 [`initialize-a-project.md`](initialize-a-project.md)——那条路更短，还会连 `components.json`、主题 css、认证外壳一起播种。

## 装你要的那一块就行，前置会跟着来

每个块把自己的前置块写在 `registryDependencies` 里，shadcn 会把整条依赖链一并装上。要 `admin-pages`（五个管理页，依赖链最深）就只用一条命令：

> 版本钉在 `shadcn@4.13`：`jc-abp init` 内部用的也是这一版。4.13 在缺 `components.json` 时的 preset 行为是 registry block 的既定前提，换 `@latest` 可能装出不同结果。

```bash
jc-abp add auth   # 认证外壳，abp-login/app-shell 依赖它，不随 registry 分发
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/admin-pages.json
```

这条命令会装齐 13 个块的全部 85 个文件，外加它们用到的 shadcn 原语。想要更小的子集就换成对应的块，例如只要表格：

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/abp-table.json
```

它会自动带上 `data-table`、`form`、`combobox`、`date-picker`、`abp-crud`。

### 兄弟块为什么写成路径而不是名字

shadcn 把**裸名字**当作官方 registry 的条目，`abp-crud` 会被解析成 `ui.shadcn.com/r/.../abp-crud.json`，404，然后整块安装失败退出。所以兄弟块一律写成 `./node_modules/@jcoder-stack/registry/public/r/<名字>.json`——这个路径按**消费项目的根目录**解析，指向你装好的 `@jcoder-stack/registry`。`registry/scripts/check-registry-deps.mjs` 两头都管：裸名字直接拒绝，路径形式则校验它确实指向存在的兄弟块。

> **npm / yarn classic 的 workspace 里不适用。** 那两个包管理器会把 `@jcoder-stack/registry` 提升到 workspace 根的 `node_modules`，成员目录下没有它，上面那个相对路径解析不到。这种项目请按下面「各块前置」的表自己排顺序逐块装；`jc-abp init` 不受影响，它自己解析真实路径，任何布局下都能用。bun 与 pnpm 会在成员目录建符号链接，不受此限。

## 各块前置

| 块 | 前置块 | 前置的非 registry 产物 |
| --- | --- | --- |
| `abp-layout` | — | 应用根已接线 `SessionProvider` / `AppConfigProvider` |
| `abp-login` | — | `jc-abp add auth`（`login-form.tsx` import `@/auth/server-fns`） |
| `app-shell` | `abp-layout`、`abp-login` | `jc-abp add auth` |
| `data-table` | — | — |
| `combobox` | — | — |
| `date-picker` | — | — |
| `form` | `combobox`、`date-picker` | — |
| `abp-crud` | — | `jc-abp gen`（描述符要绑定生成出的端点与类型） |
| `abp-table` | `data-table`、`form`、`abp-crud`、`date-picker` | 同上 |
| `abp-sheet` | `form`、`abp-crud` | 同上 |
| `tree` | — | — |
| `abp-permission-sheet` | `tree`、`form` | 对 ABP Permission Management 模块跑过 `jc-abp gen` |
| `admin-pages` | `app-shell` 及上表除 `abp-layout`/`abp-login` 外的全部 | 对 Identity / TenantManagement / SettingManagement / Account 四个内置模块跑过 `jc-abp gen` |

「前置的非 registry 产物」这一列是最容易踩的：这些 import 的目标**不随 registry 分发**，缺了就是编译失败而不是运行时报错。

## 只装块的话，根接线要自己补

走 `jc-abp init` 的话这一节可以跳过——它已经写好了这两个文件（见 [初始化指南第 4 节](initialize-a-project.md)）。只手动装块、不走 init 的人才需要自己补：

- `src/routes/__root.tsx`——接线 `AppConfigProvider` / `SessionProvider`（读 `getAppStateFn` / `getIdentityFn`）、副作用 `import "@/api/abp-fetch"`、把各已装块的 `*-messages.json` 深合并进 `messages`，并提供 `beforeLoad` 返回的 `identity`（路由守卫读它）。
- `src/router.tsx`——补 `QueryClient` context 与 `setupRouterSsrQueryIntegration`。脚手架建的 router 没有这两样，而多数块靠 react-query 发请求。
- `src/i18n/app-messages.json`——`menu.tsx` 用 `App::` 开头的词条，那个桶归应用所有，没有块会提供它。

完整参照 [`examples/starter/src/routes/__root.tsx`](../../examples/starter/src/routes/__root.tsx) 与 [`examples/starter/src/router.tsx`](../../examples/starter/src/router.tsx)。

## 逐块说明

**`app-shell`** 分发 16 个文件：`_layout.tsx`（pathless 布局壳）、`_layout/_authed.tsx`（守卫壳，挂 `requireAuth()`）、`index.tsx`（全幅营销落地页，脱离侧栏壳）、`login.tsx`、`shell-boundary.tsx`（`RouteError` / `RouteNotFound`）、`api/abp-fetch.ts`、`menu.tsx`、`permissions.ts`，外加落地页用的 `routes/-showcase/*` 七个演示组件。除 `menu.tsx` 外都与 starter 对应文件逐字相同；`menu.tsx` 刻意是干净起点，不含 starter 手写增量里的 `books` 菜单项，装完按你实际暴露的页面增删。

`-showcase/*` 那几个演示组件 import 了 `data-table` / `form` / `combobox` / `date-picker` / `tree` / `abp-table` 的组件——所以按上面的顺序装到 `app-shell` 这一步时，落地页的 import 会悬空一阵，直到后续块补齐才 typecheck 通过。安装本身不受影响（shadcn 不做类型检查）。真的只要壳不要落地页演示，装完删掉 `src/routes/-showcase/` 并把 `index.tsx` 里对应的 section 一起删。

**`data-table`** 的横向滚动由 shadcn `table` 原语自带的 `table-container`（`overflow-x-auto`）提供；`DataTable` 外层那个 `overflow-hidden` 是为了裁 `rounded-md` 圆角，**不要**改成 `overflow-x-auto`——会同时破坏圆角裁剪并造出第二个滚动容器。若项目里的 `table` 是不含 `table-container` 的旧版，先升级它。

**`combobox`** 的单选 `Combobox` 与多选 `MultiCombobox` 共享同一个 `useComboboxOptions`（本地过滤，或防抖 400ms 的远程 `loadOptions`），建于官方 `combobox` 原语之上。它的 `registryDependencies` 写的 `combobox` 指的是**官方同名 item**，不是自指——这是全仓库唯一一处名字撞车。

**`abp-crud`** 是零兄弟依赖的协议层（`crud-service.ts` / `abp-table-source.ts` / `create-bound-components.ts` / `abp-form-errors.ts` / `abp-form-options.ts`）。`CrudService<T>` 描述符不手写：`jc-abp gen` 生成端点与类型后，你写一个绑定它们的描述符实例，`useAbpTable` / `useAbpSheet` 拿这个实例驱动。`supportsFilter: false` 的服务会让表格直接隐藏搜索框，而不是渲染一个点了不生效的死输入框。只读列表页（service 不带 create/update）只装 `abp-crud` + `abp-table` 即可，跳过 `abp-sheet`。用法见 [`abp-table.md`](abp-table.md)。

**`tree`** 零业务知识：`label` / `icon` 由消费方传入，级联策略（勾子强制父链、去父清子树、半选推导）不在组件内实现，由 `tree-helpers.ts` 的纯函数（`collectSubtreeIds` / `findParentChain` / `deriveIndeterminate`）供消费方自行组合。

**`abp-permission-sheet`** 除了 `tree` / `form` 的组件，还直接 import `@/api/endpoints/permissions/permissions` 与 `@/api/models` 下的权限 DTO——面向的是 ABP 内置模块，生成路径确定，跑过 `jc-abp gen` 即可，不需要额外接线。它分发的 `admin-messages.json` 承载 `Admin:` 桶词条，`admin-pages` 五页也依赖这些词条，同样要在 `__root.tsx` 深合并进 `messages`，否则渲染的是裸键名。

**`admin-pages`** 的五个页面（`identity/users`、`identity/roles`、`tenants`、`settings`、`profile`）是 starter 对应路由文件的逐字拷贝，类型是 `registry:file` 而非 `registry:page`——`target` 直接落到 `src/routes/_layout/_authed/`，因为 shadcn 的 `registry:page` 在非 Next.js 项目上实测不落盘。五页要挂在 `_layout/_authed` 下才可访问，所以 `app-shell` 是硬前置。除 `profile`（走 `NavUser` 下拉入口）外，其余四页要出现在侧栏需要你自己往 `menu.tsx` 加菜单项。

## 更新单块

改某一块的最新版，不必重跑 init：

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/<块>.json --overwrite
```

`--overwrite` 会覆盖你在该块文件里的本地改动。块的定制点是主题层（`styles.css` 的 `data-slot` 规则）与 `cn()` 合并类，不是改块源码——见 [`../../DESIGN.md`](../../DESIGN.md)。
