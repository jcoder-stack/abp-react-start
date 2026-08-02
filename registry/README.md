# @jcoder-stack/registry

认证外壳的 copy-in 源，工厂化到极简：**`auth.config.ts` 是你唯一要看的文件**——一句 `createAbpAuthRuntime(process.env, {…覆盖项})`，默认即现行为，每个覆盖项（cookie 名/寿命、策略启停、登出回跳、身份解析器…）都带默认值，取消注释即生效。其余是薄接线：`runtime.ts`（进程单例）、`server-fns.ts` / `middleware.ts`（TanStack 接线，编译约束必留 copy-in）、`index.ts`（barrel）。

装配与机制全部下沉包：ABP auth 运行时工厂 `createAbpAuthRuntime` 与登录/回调/登出/文化/租户 handler → `@jcoder-stack/abp-react/proxy`；路由守卫 `requireAuth`/`requirePermission` → `@jcoder-stack/abp-react/router`（TanStack Router beforeLoad，经 `@/auth` barrel 重导出）；ABP 代理调用、身份读取、returnUrl/culture 纯函数 → `@jcoder-stack/abp-react/proxy` / `@jcoder-stack/abp-react/auth`。

由 `jc-abp add auth` 按 manifest 落位到应用 `src/`；属 ABP React Start 框架，总览见仓库根 README。

## UI blocks

`ui/blocks/` 下是可用官方 shadcn CLI 安装的块，产物在 `public/r/`：

| 块 | 内容 |
| --- | --- |
| `abp-layout` | 侧栏布局（AppSidebar / SiteHeader / 面包屑 / 语言与主题切换 / 品牌标识） |
| `abp-login` | 密码登录卡片，含 OIDC 入口 |
| `app-shell` | 应用壳胶水：`_layout`/`_authed`/首页/login 路由 + `abp-fetch.ts` + 起点 `menu.tsx` |
| `data-table` | 通用服务端分页/排序/搜索表格 |
| `combobox` | 单选/多选 combobox（本地过滤或防抖远程 loadOptions） |
| `date-picker` | 单日期 / 日期区间 / 日期时间选择器 |
| `form` | 表单壳 + 字段组件 + 服务端字段错误映射 |
| `abp-crud` | ABP CRUD 协议（`createCrudService` / `AbpTableSource`）与共享件 |
| `abp-table` | `useAbpTable`——表格 + 筛选面板 + 批量操作 |
| `abp-sheet` | `useAbpSheet`——增删改抽屉 |
| `tree` | 通用树形块（展开收起 / 勾选，级联策略留给消费方） |
| `abp-permission-sheet` | 权限树 Sheet（组=Accordion，组内 Tree） |
| `admin-pages` | users / roles / tenants / settings / profile 五个管理页 |

装法、依赖顺序与各块的前置条件见 [`docs/guides/install-blocks.md`](../docs/guides/install-blocks.md)。源码改动后用 `bun run build:registry` 重新生成产物。
