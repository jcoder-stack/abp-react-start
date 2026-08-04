# @jcoder-stack/abp-react

The runtime core of `abp-react-start` — a pure-React frontend framework for ABP backends. See the repository root README for the big picture.

Every domain is exported through a **subpath**; there is no root export: an aggregate entry point would drag server-side modules like `proxy` and `auth` into the browser bundle.

| Subpath | Responsibility |
| --- | --- |
| `@jcoder-stack/abp-react/logger` | Isomorphic logging: scopes, field binding, redaction by default, env switches |
| `@jcoder-stack/abp-react/core` | Normalizing ABP wire formats: application-configuration types + zod (tolerant parsing), `PagedResult<T>`, the error envelope (`HttpError`/`toHttpError`) |
| `@jcoder-stack/abp-react/auth` | Authentication core: the sign-in strategy layer (OIDC/password) + the session layer (encrypted chunked cookies, refresh, logout); host-agnostic and backend-agnostic |
| `@jcoder-stack/abp-react/proxy` | The ABP proxy gateway and call layer: Bearer-attached forwarding, 401→refresh→replay, idempotent retries, timeouts; policy-header assembly, session brokering, identity derivation; the ABP auth runtime factory `createAbpAuthRuntime` plus the login/callback/logout/culture/tenant handlers |
| `@jcoder-stack/abp-react/permissions` | The permission primitive `isGranted` + a variadic checker |
| `@jcoder-stack/abp-react/i18n` | A two-layer merging translator (backend ABP resources override the frontend catalog), with injectable interpolate/plural |
| `@jcoder-stack/abp-react/react` | `AppConfigProvider` / `SessionProvider` + hooks (user/permissions/settings/features/localization/menu) + `<PermissionGuard>`/`<FeatureGuard>` |
| `@jcoder-stack/abp-react/router` | TanStack Router beforeLoad guards `requireAuth` / `requirePermission` |

## Install

```bash
bun add @jcoder-stack/abp-react
```

Most projects use it together with `@jcoder-stack/cli` — `jc-abp init` writes the wiring code into your project, and those files are yours to maintain afterwards. Manual wiring is described below.

## peerDependencies

`react`, `@tanstack/react-router`, and `zod` are all declared as **optional** peers: a pure BFF consumer only uses `/proxy` and `/auth` and should not be forced to install React and the router; a pure frontend consumer only uses `/react` and `/i18n` and should not be forced to install zod. Install whichever ones the subpaths you actually use require — package managers stay silent about the missing rest.

## Usage

### Server side: the auth runtime

`createAbpAuthRuntime` reads its configuration from environment variables (`AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_SESSION_SECRET`, `AUTH_REDIRECT_URI`, `AUTH_ABP_BASE_URL`) and returns everything the login/callback/logout handlers need. Every override has a default:

```ts
import { createAbpAuthRuntime } from "@jcoder-stack/abp-react/proxy";

export const createRuntime = () =>
  createAbpAuthRuntime(process.env, {
    // cookies: { session: { name: "myapp_session", maxAge: 60 * 60 * 24 * 14 } },
    // strategies: { password: false },
    // proxy: { timeoutMs: 10_000, retries: 1 },
    // session: { skewSeconds: 30, coalesceTtlMs: 5_000 },
  });
```

`AUTH_SESSION_SECRET` must be at least 32 characters — the session cookie derives its AES-GCM key from it via HKDF, and anything shorter throws outright instead of silently producing a weak key.

### Client side: providers and hooks

The two providers are mounted separately: configuration (localization/settings/features) and identity invalidate at different times, and folding them into one would make an identity refresh rebuild the translator along with it.

```tsx
import { AppConfigProvider, SessionProvider } from "@jcoder-stack/abp-react/react";

<AppConfigProvider config={appState.config} messages={messages} fallbackCulture="en">
  <SessionProvider identity={appState.identity} fetchIdentity={fetchIdentity}>
    {children}
  </SessionProvider>
</AppConfigProvider>;
```

`messages` needs a stable reference (a module constant or `useMemo`) — it participates in the translator rebuild check. Callback props (`onMissingKey`, `createTranslator`) are read through refs, so writing them as inline arrows does not rebuild the context.

### Route guards

```ts
import { requireAuth, requirePermission } from "@jcoder-stack/abp-react/router";

export const Route = createFileRoute("/_layout/_authed")({
  beforeLoad: requireAuth(),
});
```

The guards are **pure UX** — the real authorization decision lives in the ABP backend. `requirePermission` redirects to `/forbidden` when the permission is missing; an anonymous user has no grantedPolicies at all, so they land on the 403 too by default. Pass `loginPath` to send unauthenticated visitors to sign in first:

```ts
beforeLoad: requirePermission(IdentityPermissions.Users.Default, {
  loginPath: "/api/auth/login",
});
```

The recommended layout is still to nest protected pages under a parent route running `requireAuth()`; `loginPath` is for the cases where `requirePermission` is used on its own.

Both guards require an ancestor route's `beforeLoad` to have put `identity` into the route context; when it is missing they throw an error with guidance instead of silently letting the request through.
