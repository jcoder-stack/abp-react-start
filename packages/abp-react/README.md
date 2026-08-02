# @jcoder/abp-react

`abp-react-start` 的运行时内核——从零自研的纯 React ABP 前端框架，总览见仓库根 README。

各域按**子路径**导出，没有把所有东西糊在一起的根导出：一个根导出会让纯前端的 bundle 拖进 `proxy`/`auth` 这类服务端代码。

| 子路径 | 职责 |
| --- | --- |
| `@jcoder/abp-react/logger` | 同构日志：作用域、字段绑定、默认脱敏、env 开关 |
| `@jcoder/abp-react/core` | ABP 线上格式归一：application-configuration 的类型 + zod（容错解析）、`PagedResult<T>`、错误信封（`HttpError`/`toHttpError`） |
| `@jcoder/abp-react/auth` | 授权认证核心：登录策略层（OIDC/password）+ 会话层（加密分块 cookie、刷新、登出）；宿主无关、后端无关 |
| `@jcoder/abp-react/proxy` | ABP 代理网关与调用层：贴 Bearer 转发、401→刷新→重放、幂等重试、超时；策略头组装、会话代调、身份派生；ABP auth 运行时工厂 `createAbpAuthRuntime` 与登录/回调/登出/文化/租户 handler |
| `@jcoder/abp-react/permissions` | 权限判定原语 `isGranted` + 变参 checker |
| `@jcoder/abp-react/i18n` | 两层合并 translator（后端 ABP 资源覆盖前端词库），可注入 interpolate/plural |
| `@jcoder/abp-react/react` | `AppConfigProvider` / `SessionProvider` + hooks（用户/权限/设置/特性/本地化/菜单）+ `<PermissionGuard>`/`<FeatureGuard>` |
| `@jcoder/abp-react/router` | TanStack Router beforeLoad 路由守卫 `requireAuth` / `requirePermission` |

## 安装

```bash
bun add @jcoder/abp-react
```

多数项目是配合 `@jcoder/cli` 使用的——`jc-abp init` 会把接线代码落进你的项目，之后这些文件归你维护。手工接线见下。

## peerDependencies

`react`、`@tanstack/react-router`、`zod` 三者全部声明为 **optional** peer：纯 BFF 消费者只用 `/proxy`、`/auth`，不该被逼装 React 与 router；纯前端消费者只用 `/react`、`/i18n`，也不该被逼装 zod。装哪几个由你实际用到的子路径决定，缺的那些包管理器不会报警。

## 用法

### 服务端：auth 运行时

`createAbpAuthRuntime` 从环境变量读配置（`AUTH_ISSUER`、`AUTH_CLIENT_ID`、`AUTH_SESSION_SECRET`、`AUTH_REDIRECT_URI`、`AUTH_ABP_BASE_URL`），返回登录/回调/登出所需的一切。每个覆盖项都有默认值：

```ts
import { createAbpAuthRuntime } from "@jcoder/abp-react/proxy";

export const createRuntime = () =>
  createAbpAuthRuntime(process.env, {
    // cookies: { session: { name: "myapp_session", maxAge: 60 * 60 * 24 * 14 } },
    // strategies: { password: false },
    // proxy: { timeoutMs: 10_000, retries: 1 },
    // session: { skewSeconds: 30, coalesceTtlMs: 5_000 },
  });
```

`AUTH_SESSION_SECRET` 至少 32 字符——会话 cookie 用它经 HKDF 派生 AES-GCM 密钥，短于此长度会直接抛错而非静默产出弱密钥。

### 客户端：Provider 与 hooks

两个 Provider 分开挂：配置（本地化/设置/特性）与身份的失效时机不同，合成一个会让身份刷新连带重建 translator。

```tsx
import { AppConfigProvider, SessionProvider } from "@jcoder/abp-react/react";

<AppConfigProvider config={appState.config} messages={messages} fallbackCulture="en">
  <SessionProvider identity={appState.identity} fetchIdentity={fetchIdentity}>
    {children}
  </SessionProvider>
</AppConfigProvider>;
```

`messages` 需引用稳定（模块常量或 `useMemo`）——它参与 translator 的重建判定。回调 props（`onMissingKey`、`createTranslator`）经 ref 读取，写成内联箭头函数不会导致 context 重建。

### 路由守卫

```ts
import { requireAuth, requirePermission } from "@jcoder/abp-react/router";

export const Route = createFileRoute("/_layout/_authed")({
  beforeLoad: requireAuth(),
});
```

守卫是**纯 UX**——真正的安全判定在 ABP 服务端。`requirePermission` 缺权限时跳 `/forbidden`；匿名用户没有任何 grantedPolicies，默认也会落到 403，传 `loginPath` 可让未认证访客先去登录：

```ts
beforeLoad: requirePermission(IdentityPermissions.Users.Default, {
  loginPath: "/api/auth/login",
});
```

推荐的做法仍是把受保护页面挂在一个跑 `requireAuth()` 的父路由下，`loginPath` 用于单独使用 `requirePermission` 的场景。

两者都要求祖先路由的 `beforeLoad` 已把 `identity` 放进 route context；没放会抛出带指引的错误而不是静默放行。
