# CLAUDE.md

TanStack Start + shadcn/ui + Tailwind CSS v4 仓库规则。**始终用简体中文回答**（commit message 保留英文，专业术语可中英混合）。

## 执行准则

- 沿用既有写法与约定，做最小必要改动。
- 涉及样式、新增组件、或要加语义色时，先读 `DESIGN.md`；需要新增/修改 token 时再读 `packages/cli/templates/app-theme.css` 的 `:root` / `.dark` / `@theme inline` 段。同一会话内已读过的不重复读。
- 设计/交互不确定先问，不擅自发挥；不引入未讨论的依赖。


## 样式

- 只用语义 token（`bg-background`、`text-foreground`、`text-muted-foreground`、`border-border`、`ring-ring`）。
- 禁止硬编码色值（`#2F6BFF`、`text-[#...]`、`bg-[oklch(...)]`——品牌色也走 `--brand-*` token）和 Tailwind 调色板（`bg-gray-800`、`text-zinc-500`）——会绕过主题、破坏暗色。
- 暗色只靠 token + `.dark`，不给组件手写整套 `dark:` 类。
- 新语义色顺序：DESIGN.md + `app-theme.css` 的 `:root`/`.dark` 定义 token → `@theme inline` 里 `--color-x: var(--x)` 映射 → 才在组件用。不在组件里就地造色。
- 具体数值（间距节奏、圆角、字体、排版层级、视觉克制原则）以 DESIGN.md 为准，本文件不复述。

## shadcn/ui

- 复用 `components/ui` 原语。定制走 `cn()` 合并类 + `cva` 定义 variant，不 fork 原语。
- 块文件首个语句之前不放注释——`shadcn add` 会剥掉首语句前的全部注释（含文件头 TSDoc）。模块级说明挂到后续声明上。
- 优先 compound 组合；变体 props 用 `cva` + `VariantProps` 类型化。React 19 下不用 `forwardRef`。

## TanStack Start

- 文件路由（`src/routes`）。数据获取走 route loader 或 `createServerFn`，不在组件 `useEffect` 里手撸 fetch。
- server fn 入参用 zod 校验；服务端密钥只在 server fn 内使用，勿泄漏到客户端 bundle。
- 用 TanStack Query 时，客户端缓存交给 Query，loader 内 `ensureQueryData` 预取，避免瀑布请求。
- 全局 CSS 在 `__root.tsx` 用 `?url` + `head().links` 注入，不在组件里 `import './x.css'`。
- `src/routes` 下的非路由文件（路由专用子组件、mock demo）放进 `-` 前缀目录 colocate，如 `routes/-showcase/`。放进无前缀子目录会被误当路由。
- 首页 `/` 是全幅营销落地页（脱离 `_layout` 侧边栏壳）：顶导航 + 英雄 + 特性 + 组件实时演示 + 页脚；匿名给登录，认证给「进入控制台」，用 `<a href>` 整页跳转而非 typed `Link`（`--no-admin` 项目无 admin 路由时不至于编译报错）。业务页仍在 `_layout/_authed` 下。品牌标识统一用 `BrandMark`（`components/abp/layout/brand-mark.tsx`，内联 SVG 走 `--brand-*` token 以适配明暗）——换品牌只改这一个文件。

## Admin 页面（ABP React Start 主题）

- 内容区外边距由壳布局 `_layout.tsx` 的 `<main>`（`px-6 py-5`）统一提供；页面组件不自带外层 padding，不覆盖壳布局。
- 骨架：`<section className="space-y-4">` + 页标题 `<h1 className="text-2xl font-normal">`（字号与字距由 `@theme` 的 text-2xl 带出，不写任意值）；卡片/表格横向充满内容区，不加 `max-w`（刻意居中的窄页如 profile 除外）。
- 整页表单：`divide-y rounded-lg border bg-card` 容器 + `FormSection` 分区（左标题描述 / 右字段）；操作按钮在容器底部行 `justify-end`，primary 最右。成对短字段用 `grid gap-4 sm:grid-cols-2`。
- 页签用 `<TabsList variant="line">`；行内状态用 `StatusBadge`，禁止拿 primary/destructive 实心 Badge 表状态。
- 主题 token 只改 `packages/cli/templates/app-theme.css`（starter 的 `src/styles.css` 是它的镜像，两份必须一致）并与 DESIGN.md 同步。
- 尺寸/字号/字重/圆角一律走 `@theme` 的刻度类（`text-sm`、`font-medium`、`rounded-md`），禁止 `text-[13px]`、`tracking-[-0.02em]` 这类任意值——字距已随字号在 `@theme` 里给好。换主题时改刻度即可全站生效，任意值会漏。
- 组件不 fork shadcn 原语：要改原语的观感（圆角、焦点环、暗色质感、导航项字重等）时写进主题层的 `[data-slot="…"]` 规则，这样 `shadcn add` 装进来的新组件自动继承。
- 每个 `useQuery` 驱动的区块都要有 `isError` 分支（`FormErrorSummary` 或 destructive 文案）；禁止「失败停在骨架」与「失败渲染成空列表」。
- 必填三件套：字段组件传 `required`（含 label 星号 + `aria-required`，不用原生 required）+ 表单级 zod schema（`validators.onDynamic`，消息走词条，零硬编码）+ `validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })`。服务端错误经 `abpSubmitValidator` 返回 `{ form, fields }` 自动落位，与客户端校验同链渲染，不用 tooltip 承载错误。
- 错误边界：router 级 `defaultErrorComponent: RouteError` + `defaultNotFoundComponent: RouteNotFound` 让每条路由的错误/404 渲染在自己的位置（壳内出错侧栏保持在位），页面不必各自挂 `errorComponent`（要定制某页错误 UI 时在该路由显式声明即可，优先于默认）；`__root.tsx` 仍显式挂同两件（来自 `src/routes/shell-boundary.tsx`，刻意不经 Provider——出错时 Provider 子树已被替换，且内置静态兜底防错误页自炸）。区块级隔离用 `SectionBoundary` 包住页面局部。边界接硬错误，`isError` 接 react-query 软失败态。
- 默认关闭的重组件（抽屉/面板/弹层及 combobox、tree、accordion 等重依赖）用 `React.lazy` + `Suspense`，不静态 import 进首屏；打开瞬间给 Skeleton/null fallback。
- 鉴权态变化（登录/登出/切租户/切语言）一律 `window.location.assign` 整页跳转，不走 SPA navigate——这是作废 appState 与查询缓存的唯一可靠时机。appState 在 `__root.beforeLoad` 用 `ensureQueryData` + `staleTime` 缓存，页内导航不得重拉。
- 平台快捷键提示（⌘/Ctrl）在 `useEffect` 挂载后按 navigator 检测，不在渲染期读——SSR 拿不到平台且会水合不一致。
- 权限零裸字符串：引 `src/permissions.ts` 的 ABP 风格常量，`requirePermission` / `policy` / `can()` / 菜单 `requiredPolicy` 四处全覆盖。新模块先在该文件追加常量再用。
- 菜单类型化：`src/menu.tsx` 的 `menuItems` 声明为 `MenuItem<FileRouteTypes["to"]>[]`，路由删除/改名在编译期暴露死链。

## TypeScript / React

- strict 全开。禁止 `any`（用 `unknown` + 类型收窄），避免滥用 `!`。
- 引类型用 `import type`；路径用 `@/` 别名，不写 `../../../`。
- 单个组件小而专；派生数据用计算/`useMemo`，不冗余 `useState`。
- Context Provider 的 props 必须引用稳定（模块常量/`useMemo`/`useCallback`）——一处不稳定会让该 context 全部消费者随父级渲染陪跑。
- 列表 key 用稳定 id，不用数组 index；副作用依赖数组写全。
- 命名：组件 PascalCase、hook `useXxx`、文件 kebab-case。

## 注释

只补「为什么」，不复述「做什么」；能用更好的命名或更小的函数消掉的注释就不要写。

- 该写：导出 API（hook、util、跨模块组件 props）的 TSDoc，一句话说清意图与契约（参数含义、null 语义、抛错、副作用）；反直觉取舍与框架怪癖（如「规避 hydration mismatch」「Safari flex 计算 bug」）；`// TODO(#123):`。
- 不该写：复述代码；bug 考古与 PR/issue 叙事（属 git 历史与 `docs/`）；注释掉的死代码；`// ── 第 1 步 ──` 这类装饰性分隔（该拆组件而非注释分段）。

## 测试

Vitest + Testing Library（单元/组件），Playwright（e2e）。测行为与用户可见结果，不测实现细节。

- 该测：用户交互与关键路径、边界与错误分支、无障碍可达（role/label）、server function 的入参校验与返回契约。
- 不该测：常量/配置/静态文案；类型（编译期已保证）；纯透传展示组件；第三方原语内部；内部 state/className/DOM 结构；全量快照；无断言的空冒烟；被更高层用例覆盖的冗余用例。
- 删测试前确认它不是某条路径的唯一覆盖。

## Commit

Conventional Commits：`feat:` `fix:` `refactor:` `docs:` `chore:`。不加 `Co-Authored-By`；提交信息与 PR 中不出现 AI 工具相关字样。