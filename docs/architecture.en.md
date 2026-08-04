# Architecture

This document explains **why the framework has this shape** — the layers, the boundary each one guards, and the parts deliberately not shipped as npm packages. To build a project hands-on, see [`guides/initialize-a-project.en.md`](guides/initialize-a-project.en.md); for styling, see [`../DESIGN.md`](../DESIGN.md) (Chinese).

> English edition. 中文版见 [`architecture.md`](architecture.md)。

## In one sentence

An ABP backend plus a pure-React frontend (TanStack Start); tokens never enter the browser; the UI layer is distributed shadcn-style as source code, not as a component library.

## The three distribution shapes

The same body of work is cut into three pieces, and the cut follows one question: **does the consumer need to edit it?**

| Shape | What | Why this shape |
| --- | --- | --- |
| **npm packages** (`@jcoder-stack/*`) | The undisputed mechanics: protocol, crypto, retries, permission checks | Nobody wants to fork an OIDC handshake. Upgrades ride `bun update`; behavior is locked by tests |
| **The copy-in shell** (`registry/auth/**`, `jc-abp add auth`) | Server functions, request middleware, API routes, `auth.config.ts` | These are **compile-time constructs** — see below |
| **shadcn blocks** (`registry/ui/blocks/**`, `npx shadcn add`) | All of the UI | Components are destined to be edited. They belong in your repository, where editing them is the natural thing |

### Why server fns and middleware must be copy-in

TanStack Start's `createServerFn` / `createMiddleware` are not ordinary functions — they are markers for the bundler. At build time, one declaration is split into a server implementation and a client RPC stub, and that split is performed by Start's Vite plugin **inside the app's own compilation unit**. A server fn precompiled into an npm package cannot be split; installed, it is just an empty shell running on the client.

So the four files under `src/auth/` are forced by a compile-time constraint, not by design preference:

```
auth.config.ts   ★ the only one you're expected to edit: createAbpAuthRuntime(process.env, {…overrides})
runtime.ts         process-level singleton, getAuthRuntime() on the server side
server-fns.ts      getAppStateFn / getIdentityFn / abpRequestFn  ← compile-time constraint
middleware.ts      authMiddleware (reads the session; refreshes and re-writes the cookie when expired)  ← compile-time constraint
```

Assembly, handlers, and guards all sank into the packages; the copy-in is these four files plus five API routes. With no overrides passed, `auth.config.ts` behaves exactly like the package defaults — it exists to give you a place to change things, not a form you must fill in.

## Package layering

Dependencies flow in one direction only; lower layers don't know the upper ones exist. The runtime is a single package, `@jcoder-stack/abp-react`, and every `/xxx` below is one of its subpath exports:

```
        ┌─────────────────────────────────────────────┐
 UI     │  registry blocks (all shadcn-distributed)   │
        ├─────────────────────────────────────────────┤
 React  │  /react       providers + hooks             │
        │  /router      beforeLoad route guards       │
        ├─────────────────────────────────────────────┤
 Domain │  /auth        strategy layer + session layer│
        │  /proxy       ABP proxy gateway + runtime   │
        │  /permissions   /i18n                       │
        ├─────────────────────────────────────────────┤
 Base   │  /core        /logger                       │
        └─────────────────────────────────────────────┘
```

| Subpath | Responsibility | Boundary |
| --- | --- | --- |
| `logger` | Scoped logging, field binding, redaction by default, env switches | Isomorphic, dependency-free |
| `core` | Normalizing ABP wire formats: `application-configuration` types and zod parsing, `PagedResult<T>`/`toAbpListParams`, the error envelope (`HttpError`/`toHttpError`) | Types and parsing only; makes no requests. **Tolerant parsing**: extra backend fields don't error, missing ones are optional, and a broken leaf degrades alone instead of taking down the tree — ABP versions differ in their fields |
| `auth` | The sign-in strategy layer (OIDC / password) + the session layer (encrypted chunked cookies, refresh, logout) | **Host-agnostic, backend-agnostic.** Imports nothing from TanStack, knows nothing about ABP |
| `proxy` | Bearer-attached forwarding, 401→refresh→replay, policy-header assembly, identity derivation, `createAbpAuthRuntime` | ABP protocol knowledge concentrates here |
| `permissions` | The `isGranted` primitive + a variadic checker | Pure functions, no network |
| `i18n` | The two-layer merging translator (backend ABP resources override the frontend catalog) | Injectable interpolate / plural |
| `router` | The `requireAuth` / `requirePermission` guards | `@tanstack/react-router` is a peerDep — consumers not on TanStack are unaffected |
| `react` | `AppConfigProvider` / `SessionProvider` + hooks + `PermissionGuard` / `FeatureGuard` | Consumes only the data contracts of the layers above |

The `auth`/`proxy` split is the single most valuable cut in this layering: **switching backends** means replacing `proxy` only — `auth`'s OIDC handshake, PKCE, cookie sealing, and refresh timing don't change by a line.

The eight domains share one npm package, but there is **no root export**: a `.` entry aggregating the subpaths would let the browser bundle follow `proxy` into server-side code, and the layering would be void.

## How a request travels

The browser never holds an access token. Every request to the backend goes through the server-side proxy:

```
Browser
  │  ① an orval-generated react-query hook calls the fetchFn
  ▼
src/api/abp-fetch.ts        (the bridge distributed by the app-shell block)
  │  ② translated into an abpRequestFn call
  ▼
src/auth/server-fns.ts      ← the compile boundary; everything below runs on the server
  │  ③ authMiddleware reads the session; refreshes and re-writes Set-Cookie when expired
  ▼
@jcoder-stack/abp-react/proxy
  │  ④ attaches the Bearer, assembles the __tenant / .AspNetCore.Culture policy headers
  │  ⑤ 401 → refresh → replay once; idempotent methods retry as needed; timeouts
  ▼
ABP backend
```

Several deliberate choices:

- **The proxy never throws on a status code**; statuses pass through as-is. Whether a 403 is an exception is the caller's business.
- **A 401 replays exactly once.** A failed refresh is a failure — no second attempt, which would only amplify one expired login into three round trips.
- **Policy headers have precedence**: tenant prefers the session with the cookie as fallback; culture prefers the cookie — an explicit language switch should beat the snapshot taken at sign-in.
- **One SSR fetch feeds two mouths**: `getAppStateFn` returns config and identity in one trip, feeding `AppConfigProvider` and `SessionProvider` respectively, avoiding two first-paint round trips.

## Sessions

The session is one httpOnly encrypted cookie, automatically chunked when oversized:

| Cookie | Lifetime | Contents |
| --- | --- | --- |
| Session | 7 days (aligned with the IdP's refresh token lifetime) | The sealed `AuthSession` |
| Handshake | 10 minutes | The sealed `Handshake` between authorize↔callback; only needs to outlive the IdP round trip |
| Tenant / culture | 1 year | ASP.NET/ABP protocol conventions, not app policy — hence not options |

**Any auth-state change (sign-in, sign-out, tenant switch, language switch) is a full-page redirect** (`window.location.assign`), never an SPA navigation. It is the only reliable moment to void the appState and every query cache; an SPA navigation would leave caches belonging to the previous identity behind.

## The presentation layer

All UI is distributed as source through the shadcn registry; there is no component-library dependency. Two constraints follow:

- **Don't fork the shadcn primitives.** To change a primitive's look (radius, focus ring, dark-mode texture), write it into the theme layer's `[data-slot="…"]` rules — new components installed later by `shadcn add` then inherit automatically. Edit the primitive files instead, and the next installed component arrives with a second look.
- **Inter-block dependencies are written as install paths, not names.** shadcn treats a bare name as an official-registry item: `abp-crud` would resolve to the same-named item on `ui.shadcn.com`, 404, and fail the whole block. Written as `./node_modules/@jcoder-stack/registry/public/r/<name>.json`, the path resolves against the consuming project's root, and installing one block pulls its whole dependency chain. npm / yarn classic workspaces hoist the package to the root `node_modules`, where this relative path does not resolve — install blocks one by one in order there. See [`guides/install-blocks.en.md`](guides/install-blocks.en.md).

The blocks themselves are layered, with the `abp-` prefix as the dividing line: `data-table` / `form` / `combobox` / `date-picker` / `tree` have **zero ABP dependencies** and are directly reusable against another backend; only `abp-crud` / `abp-table` / `abp-sheet` / `abp-permission-sheet` know the ABP protocol. The form system draws that line at its finest (four layers, [`guides/forms.en.md`](guides/forms.en.md)) — switching backends replaces only the topmost layer's `mapError`.

## The CLI

`jc-abp` has three commands, each owning one stretch:

| Command | What it does | Idempotency |
| --- | --- | --- |
| `init` | One-stop setup: seed `components.json` / `cn()` / the theme css → `add auth` → install all blocks in order → closing wiring notes | **Not idempotent, no rollback.** Aborts before touching the first file if the auth shell already exists |
| `add auth` | Distributes the auth shell per `registry/auth/manifest.json` into `src/auth/`, `src/routes/`, and the repo root | Skips existing files |
| `gen` | The orval preset: generates the react-query client from ABP swagger | Idempotent reruns; `mutator.ts` is seeded once and is yours afterwards |

After each block, `init` verifies the declared artifacts actually landed on disk — shadcn can silently abort a whole write batch and still `exit 0`; without the check you would get a project that is "successfully installed" yet missing files.

## The reference implementation is the regression baseline

[`examples/starter`](../examples/starter) is not a hand-maintained sample: it is the product of [`scripts/regenerate-example.sh`](../scripts/regenerate-example.sh) replaying "scaffold → install → `init` → `gen`" and applying a manifested set of handwritten increments on top.

Any breakage in the scaffold, the CLI, or the registry therefore surfaces during the replay, not after a user installs it. The price is one discipline: **edit components under `registry/ui/blocks/**` and replay** — edits made directly to the starter's block artifacts vanish on the next replay.

Distribution integrity has a second, mechanical check: `registry/scripts/check-registry-deps.mjs` (run by `bun run build:registry`) audits four things — every ui primitive used is declared, every same-block cross-import is registered, no stray files under `blocks/`, and no item references a sibling block by bare name. All four are invisible to typecheck and tests: the repo's own code is complete; only the installed project would come up short.

There is also an artifact-drift guard at the same layer. `registry/public/r/*.json` are distribution artifacts committed into the repo; change a block's source without rebuilding, and `jc-abp add` installs the stale version — again invisible to lint/typecheck/test. The `ci` workflow therefore rebuilds the registry after the regular checks and fails if `registry/public` changed. **After editing block sources locally, run `bun run build:registry` and commit the artifacts together.**

## Published shape vs. development shape

Inside the repository, package `main`/`exports` point at `src`: the workspace consumes TS sources directly, and editing a package needs no build. The published tarball obviously cannot ship that way, so `prepack` temporarily rewrites `package.json` and `postpack` restores it. Both `npm pack` / `npm publish` and `bun pm pack` trigger the pair (unless `--ignore-scripts`).

`scripts/apply-publish-config.mjs` lifts the `main`/`types`/`exports` overrides from `publishConfig` to the top level, completing the `src` → `dist` redirect (npm natively honors only a few `publishConfig` keys; the rest must be moved by hand). `@jcoder-stack/abp-react` and `@jcoder-stack/cli` need it; `@jcoder-stack/registry` distributes source files with no dist, so for it the script is a no-op.

**Inter-package dependencies do not take this route**: the committed `package.json` declares real version ranges (`@jcoder-stack/registry` depends on `@jcoder-stack/abp-react@^0.1.0`) instead of `workspace:*` rewritten at prepack. bun still links the in-repo package by version match, so the development experience is unchanged.

The reason is that prepack cannot touch registry metadata: **npm snapshots the manifest into the packument before prepack runs**. The tarball is packed after prepack and is clean, but the metadata keeps `workspace:*` — and dependency resolution reads the metadata. The package publishes fine and fails to install (observed on verdaccio). `exports`/`main` are unaffected because those are read from the installed tarball, which is why the same rewrite works for them. `scripts/publish-smoke.sh` therefore asserts, besides checking the tarball, that the committed manifests contain no `workspace:` ranges.

The publish pipeline only reveals its problems when actually run, so `scripts/publish-smoke.sh` packs real tarballs and inspects them; CI runs it automatically on `v*` tags.

## Related docs

- [Initialize a project](guides/initialize-a-project.en.md), [Install blocks selectively](guides/install-blocks.en.md)
- [List pages & CRUD](guides/abp-table.en.md), [The form system](guides/forms.en.md)
- [Design spec](../DESIGN.md) (Chinese)
