<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lockup-dark.svg">
    <img src="docs/assets/lockup.svg" alt="ABP React Start" width="352" height="64">
  </picture>
</h1>

<p align="center">A modern React frontend for your ABP backend — sign-in, permissions, multi-tenancy, localization, and CRUD pages, all runnable out of the box.</p>

<p align="center">English · <a href="README.md">简体中文</a></p>

---

## What this is

Building a frontend from scratch against an ABP backend means redoing the same fixed set of work every time: the OIDC handshake and token refresh, storing the session without leaking it, delivering permissions and feature flags down to components, switching tenants and languages, turning backend DTOs into type-safe requests — plus an admin UI that doesn't look like a template.

ABP React Start does all of that once: a single `jc-abp init` lands a running app — the auth shell, the sidebar layout, a sign-in page, five admin pages (users/roles/tenants/settings/profile), and a set of table and form primitives for your own business pages. Then it steps aside: **you get source code, not a runtime dependency**. The UI lives in your repository, and changing it never requires working around an abstraction.

Tokens never enter the browser — every request goes through a server-side proxy, and the session is one httpOnly encrypted cookie. That is not optional hardening; it is the default and only shape.

## Stack

| Layer | What | Why |
| --- | --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) 1.x + React 19 | Server functions are the compile-time boundary that keeps tokens on the server |
| Routing | TanStack Router | Type-safe file routing; `beforeLoad` is exactly where auth guards belong |
| Data | TanStack Query 5 + [orval](https://orval.dev) | react-query hooks generated from your ABP swagger — DTOs and endpoints stay type-safe end to end |
| Tables / forms | TanStack Table 9 + TanStack Form 1 | Headless: styling and interaction stay ours, with no fights against a component library's look |
| UI | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS 4 | Source distribution. Components are destined to be edited, so they go into your repository |
| Validation | zod 4 | One schema shared across server function inputs, env, and forms |
| Backend | ABP Framework | Auth via OpenIddict (Authorization Code + PKCE) or password sign-in |

The theme is a complete design system, not the shadcn default palette — see [`DESIGN.md`](DESIGN.md) for the palette, type scale, elevation, and component specs.

## What's inside

### npm packages (runtime)

The entire runtime lives in **one** npm package, `@jcoder-stack/abp-react`, exported per domain via subpaths — deliberately without a root export, so the browser bundle never drags in server-side modules like `proxy` and `auth`.

| Subpath | Purpose |
|---|---|
| `@jcoder-stack/abp-react/logger` | Isomorphic logging: scopes, field binding, redaction by default, env switches |
| `@jcoder-stack/abp-react/core` | Normalizing ABP wire formats: application-configuration types + zod (tolerant parsing), `PagedResult<T>`, the error envelope (`HttpError`/`toHttpError`) |
| `@jcoder-stack/abp-react/proxy` | The ABP proxy gateway and call layer: Bearer-attached forwarding, 401→refresh→replay, idempotent retries, timeouts; policy-header assembly, session brokering, identity derivation; the ABP auth runtime factory `createAbpAuthRuntime` plus the login/callback/logout/culture/tenant handlers — the host only passes overrides from the copy-in |
| `@jcoder-stack/abp-react/auth` | Authentication core: the sign-in strategy layer (OIDC/password) + the session layer (encrypted chunked cookies, refresh, logout); host-agnostic, backend-agnostic |
| `@jcoder-stack/abp-react/permissions` | The permission primitive `isGranted` + a variadic checker |
| `@jcoder-stack/abp-react/router` | TanStack Router beforeLoad guards `requireAuth` / `requirePermission` (`@tanstack/react-router` is a peerDep — consumers not on TanStack are unaffected) |
| `@jcoder-stack/abp-react/i18n` | A two-layer merging translator (backend ABP resources override the frontend catalog), with injectable interpolate/plural |
| `@jcoder-stack/abp-react/react` | `AppConfigProvider` / `SessionProvider` + hooks (user/permissions/settings/features/localization/menu) + `<PermissionGuard>`/`<FeatureGuard>` |

`react` / `@tanstack/react-router` / `zod` are all **optional peerDependencies**: BFF-only consumers don't have to install React and the router, and frontend-only consumers don't have to install zod.

| Package | Purpose |
|---|---|
| `@jcoder-stack/cli` | The `jc-abp` CLI: `gen` (react-query client generation via an orval preset) + `add` (copy registry shells in) + `init` (one-stop setup) |

### Source distribution (installed into your repository)

`@jcoder-stack/registry` ships **source code, not build artifacts**, distributed by `jc-abp init` / `jc-abp add auth` / `npx shadcn add` per manifest. Once landed, the files are yours:

- **The auth shell** → `src/auth/`: server functions, request middleware, five API routes, `auth.config.ts`. These files must be copy-in rather than npm-packaged — [see the architecture doc for why](docs/architecture.md#为什么-server-fn-和中间件必须-copy-in).
- **UI blocks** → `src/components/`, `src/routes/`: the sidebar layout, the sign-in page, tables, forms, trees, date pickers, and the five admin pages.

It installs as a devDependency together with `@jcoder-stack/cli` — once everything has landed, its job is done.

## Quick start

```bash
# 1. Create the app (use the current official @tanstack/cli; do NOT pass --router-only —
#    that's a compatibility mode without Start's server capabilities)
npx @tanstack/cli create my-app && cd my-app

# 2. Install the runtime package + the dev-time CLI and registry
bun add @jcoder-stack/abp-react
bun add -D @jcoder-stack/cli @jcoder-stack/registry

# 3. One-stop setup: seeds the baseline config and theme, lands the auth shell, installs all
#    blocks, wires __root.tsx / router.tsx, asks once for your backend URL (Enter skips,
#    or pass --backend), and generates .env with a random session secret
npx jc-abp init          # --no-admin skips the five admin pages

# 4. Fill AUTH_CLIENT_ID in .env (the client registered in your backend's OpenIddict;
#    the notes in .env show how to probe for it)

# 5. Generate the API client and start
npx jc-abp gen && bun run dev
```

**For the detailed walkthrough see [`docs/guides/initialize-a-project.en.md`](docs/guides/initialize-a-project.en.md)** — which files each step actually writes, how existing files are treated, what failure looks like, and how to verify.

Two things you must know:

- `init` is a **one-shot scaffold step — not an incremental updater, and it does not roll back**. It aborts before touching the first file if the auth shell already exists; after a mid-run failure, start over in a clean directory instead of rerunning. To update a single block, use `npx shadcn add <the block's json> --overwrite`.
- With npm and an `allow-scripts=` entry in your npmrc, `init` refuses to start — `npx` injects that config into child processes and npm rejects it from that source (`EALLOWSCRIPTS`), so shadcn's dependency install is guaranteed to fail. Remove the entry, or use bun.

The reference app is [`examples/starter`](examples/starter), itself a product of this exact flow — [`scripts/regenerate-example.sh`](scripts/regenerate-example.sh) replays "scaffold → install → init → gen" and applies a manifested set of handwritten increments on top, so it is both living documentation and the end-to-end regression for the CLI and registry. **To change block components, edit [`registry/ui/blocks/**`](registry/ui) and replay the script** — don't edit the block artifacts inside the starter.

## Documentation

| Doc | Contents |
| --- | --- |
| [Architecture](docs/architecture.en.md) | The layers, the request path, the three distribution shapes, and why it's cut this way |
| [Initialize a project](docs/guides/initialize-a-project.en.md) | The full path from zero to running, the resulting project structure, troubleshooting |
| [Install blocks selectively](docs/guides/install-blocks.en.md) | Order and prerequisites when installing only some blocks |
| [List pages & CRUD](docs/guides/abp-table.en.md) | `useAbpTable` / `useAbpSheet`, from the service descriptor to a fully wired page |
| [The form system](docs/guides/forms.en.md) | The four-layer architecture, field components, and the four validation channels |
| [Design spec](DESIGN.md) | Palette, typography, elevation, component specs (Chinese) |

## Development

```bash
bun install
bun run typecheck   # type checking (includes cli templates)
bun run test        # vitest
bun run lint        # biome
bun run build       # tsup bundles each package into dist (the publish artifacts)
```

Inside the repository, package `exports` point at `src` rather than `dist` — that is not a misconfiguration: the workspace consumes TS sources directly, and `prepack` rewrites the exports temporarily at publish time. The mechanism is described in [the architecture doc](docs/architecture.en.md).

## License

[MIT](LICENSE)

This project bundles no third-party code: dependencies are installed by your package manager from their own sources under their own licenses (all permissive — MIT / Apache-2.0 / ISC / BSD). The shadcn/ui primitives likewise come from the shadcn CLI and its official registry. The projects listed in the stack table are what makes this one possible.

ABP and ABP Framework are trademarks of Volosoft. This is an independent community project, unaffiliated with and not endorsed by Volosoft.
