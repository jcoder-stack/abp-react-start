# Initialize a project from zero

Follow this once and you end up with a TanStack Start app that signs in, has the sidebar shell, permission guards, i18n, and is already talking to your own ABP backend.

The README's [Quick start](../../README.en.md#quick-start) is the condensed version of this document — same commands; what this adds is **what actually happens at each step, what failure looks like, and how to confirm it worked**.

> English edition. 中文版见 [`initialize-a-project.md`](initialize-a-project.md)。

---

## 0. Prerequisites

| Need | Why | How to confirm |
| --- | --- | --- |
| Node (a modern version) | The CLI uses `node:util`'s `parseArgs` and recursive `readdirSync` | `node -v` |
| bun or npm | Installing dependencies; `init` autodetects which | `bun -v` / `npm -v` |
| `npx` available | `init` calls shadcn and router-cli through it | `npx -v` |
| An ABP backend | Generating the API client reads its swagger | Opening `<your backend>/swagger/v1/swagger.json` in a browser yields JSON |

The backend can be offline through the first four steps — only step 6, `gen`, needs it. An offline swagger file works too.

> **npm with `allow-scripts=` in your npmrc**: `init` refuses to start and explains why. `npx` injects the resolved npm config into child processes as `npm_config_*`, and npm rejects `allow-scripts` from that source (`EALLOWSCRIPTS`), so shadcn's dependency install is guaranteed to fail. Remove it from the npmrc, temporarily `npm config delete allow-scripts`, or use bun (with a `bun.lock` in the directory shadcn runs `bun add` and skips this chain entirely).

---

## 1. Create the app

```bash
npx @tanstack/cli create my-app
cd my-app
```

**Do not pass `--router-only`** — that is the file-routing-only compatibility mode without Start's server capabilities, and the auth shell depends on server functions. Without it you get full-stack TanStack Start by default.

---

## 2. Install packages

```bash
# runtime
bun add @jcoder-stack/abp-react

# dev-time: the CLI and the registry (shell and block sources; init distributes them)
bun add -D @jcoder-stack/cli @jcoder-stack/registry
```

`@jcoder-stack/registry` **must be a devDependency** — the CLI looks for the copy-in sources under `node_modules/@jcoder-stack/registry`. It would find them as a runtime dependency too, but those files don't belong in a production bundle.

Package responsibilities: `react` provides the providers and hooks, `auth` is the sign-in strategies and the encrypted cookie session, `proxy` is the ABP proxy gateway plus the login/callback/logout/culture/tenant handlers, `core` normalizes ABP's config and paging types, `i18n` does the two-layer message merge, `permissions` provides `isGranted`, `router` provides the route guards, and `logger` is isomorphic logging.

---

## 3. `jc-abp init`

```bash
npx jc-abp init          # you want the tenants/users/roles admin pages
npx jc-abp init --no-admin   # auth shell and empty layout only
npx jc-abp init --backend https://localhost:44316   # scripts/CI: pass the backend URL, no interaction
```

In an interactive terminal, init asks once for your **ABP backend URL** (Enter skips). Answering fills three places in one go: `AUTH_ISSUER` and `AUTH_ABP_BASE_URL` in `.env`, and the swagger `input` in `abp.api.config.ts` (following the ABP monolith convention of `<url>/swagger/v1/swagger.json` — adjust later for split deployments). Non-TTY runs (CI, pipes) skip automatically.

init itself **never connects to the backend** — the URL is only written into configuration, so a stopped or unreachable backend cannot affect initialization. When a URL was given, a 3-second reachability probe runs at the end, informational only: unreachable means a reminder to start the backend before gen; a completed handshake with an untrusted certificate points you straight at `AUTH_EXTRA_CA_FILE` (which is actually good news — the address is right).

`.env` is derived from `.env.example` (left alone if it already exists): `AUTH_SESSION_SECRET` is generated randomly; `AUTH_CLIENT_ID` stays empty — it has to be the client registered in your backend's OpenIddict, which cannot be guessed, and the startup check calls it out by name. When the backend URL was skipped, `AUTH_ISSUER`/`AUTH_ABP_BASE_URL` stay empty too, backed by the same startup check — no plausible-looking placeholder failing quietly later.

### What it does

In order:

1. **Two preflight gates** — if the auth shell already exists, abort before touching the first file; same if npm's `allow-scripts` would fail.
2. **Seed the baseline**: write `components.json` if missing (`new-york` / `neutral`, css entry filled in); add `cn()` if `src/lib/utils.ts` is missing; if the css entry lacks the `--background` variable, **replace it wholesale with the theme file**, backing the original up as `.bak`.
3. **Install dependencies as needed**: only what was actually seeded this run (`clsx` / `tailwind-merge` / `tw-animate-css`), plus `@tanstack/react-router-ssr-query` for the root wiring (no block declares it).
4. **Land the auth shell**: the five `src/auth/*` files, five API routes, `src/env.ts`, `.env.example`.
5. **Move the home page aside**: the scaffold's `src/routes/index.tsx` is renamed to `.bak`, because the app-shell block places its own landing page there.
6. **Install the shadcn blocks in dependency order**: `abp-layout` → `abp-login` → `app-shell` → `data-table` → `combobox` → `date-picker` → `form` → `abp-table` → `tree` → `abp-permission-sheet`, plus `admin-pages` by default. After each block, the declared artifacts are verified on disk — shadcn can silently abort a write batch and still exit 0.
7. **Wire the root files**: `src/routes/__root.tsx` is written whole (both providers, deep-merged block messages, the `abp-fetch` import, error boundaries); `src/router.tsx` gets QueryClient and the SSR integration patched in place; the scaffold originals of both are backed up as `.bak`. `src/i18n/app-messages.json` is seeded too — the distributed menu references `App::` entries, and that bucket belongs to the app; no block provides it.
8. **Wrap up**: overwrite `src/menu.tsx` under `--no-admin`; seed `tsr.config.json` and generate the route tree; seed `abp.api.config.ts` (with `input` already pointed if a backend was given); generate `.env` from `.env.example` (random session secret, see the top of this section).

The css entry probe order is `src/styles/app.css` → `src/styles.css` → `src/index.css` → `src/app.css`. If none exists and there is no `components.json`, it stops with an error — create the css entry first.

### How it treats existing files

| Target | Behavior |
| --- | --- |
| Any auth-shell target already exists | **Abort**, nothing written (`.env.example` is the exception — skipped) |
| `components.json`, `src/lib/utils.ts`, `tsr.config.json`, `abp.api.config.ts`, `src/i18n/app-messages.json`, `.env` | Skipped if present |
| The css entry, `src/routes/index.tsx` | Backed up as `.bak`, then replaced / moved aside |
| `src/routes/__root.tsx` | Backed up as `.bak`, then replaced whole (structural change, see section 4) |
| `src/router.tsx` | Backed up as `.bak`, then patched in four places; replaced whole only if the scaffold shape isn't recognized |
| shadcn block artifacts | Force-overwritten |
| `src/menu.tsx` | Overwritten only under `--no-admin` |

### If it fails midway

`init` is a **one-shot scaffold step — not an incremental updater, and it does not roll back**. The error lists the steps already completed. The right way to start over is a clean directory, or deleting the previous output; rerunning as-is hits the first gate and stops.

To update just one block, init is not needed:

```bash
npx shadcn add node_modules/@jcoder-stack/registry/public/r/<block>.json --overwrite
```

### Confirming it worked

```bash
ls src/auth src/routes/_layout src/components/abp
```

You should see five files under `src/auth/`, `src/routes/_layout.tsx` and `_layout/_authed.tsx`, and `src/components/abp/{layout,login,table,crud,sheet}`.

---

## 4. The glue init wrote

Pages and routes come from the blocks, but the two files that tie them together belong to the app — and `init` has already written them. This section explains what it wrote and where to make changes — **no wiring is required of you**.

### `src/routes/__root.tsx` (written whole)

The scaffold original is backed up at `__root.tsx.bak`. This one is a whole-file replacement rather than an in-place patch because the change is structural: `createRootRoute` becomes `createRootRouteWithContext`, `shellComponent` splits into `component` plus a document shell, and the `<Outlet/>` the two providers must wrap does not exist in the scaffold version at all — it renders through `shellComponent`'s `children`, leaving no seam to insert into.

What it writes:

- `import "@/api/abp-fetch"` — side-effect registration of the generated API client's fetchFn, wired once for the whole app
- `beforeLoad` fetches the appState through `queryClient.ensureQueryData` with a `staleTime`; the `context.identity` the route guards read comes from it
- `AppConfigProvider` + `SessionProvider` wrapping `<Outlet/>`
- Message imports generated from the `*-messages.json` actually present on disk, deep-merged, with `src/i18n/` last (same keys: later wins, so editing one json overrides a block's default copy)
- `errorComponent` / `notFoundComponent` wired to app-shell's `shell-boundary.tsx`
- The pre-paint theme script (sharing `localStorage.theme` with `ThemeToggle`; without it dark mode flashes white) and the Inter variable font (the theme's 510/590 weights only exist in the variable font)

If the scaffold had TanStack devtools mounted, they are carried over; if not, nothing is written, to avoid importing packages that aren't installed.

The complete reference is [`examples/starter/src/routes/__root.tsx`](../../examples/starter/src/routes/__root.tsx) — which adds the app's own messages and favicon/manifest on top of this template.

### `src/router.tsx` (patched in four places)

Only the QueryClient-related four are inserted: two imports, `new QueryClient()`, `context: { queryClient }`, and `setupRouterSsrQueryIntegration`. Your quote style, `createRouter` alias, and other `createRouter` options are preserved — the diff against the scaffold is five lines.

If a future scaffold changes shape and the anchors stop matching, `init` falls back to the whole template and says so in the completed-steps list — better to override style than to leave a router without `context`.

### `src/i18n/app-messages.json` (seeded, never overwritten)

The `menu.tsx` distributed by app-shell labels entries with `App::Home` / `App::System` / `App::Settings`, and the "App" bucket belongs to the app — no block provides it; without seeding, the sidebar shows raw keys. The file is yours: rerunning `init` never overwrites your edits. Add your own entries to it — it sits last in the merge chain.

---

## 5. Configure the backend address

`.env` was generated by init. If you gave init the backend URL, one thing remains:

```bash
# .env — the client registered in your backend's OpenIddict (the notes at the top of .env show how to probe)
AUTH_CLIENT_ID=
```

If you skipped the URL during init, `AUTH_ISSUER` / `AUTH_ABP_BASE_URL` are waiting in `.env` too, and `abp.api.config.ts`'s `input` needs pointing at your swagger:

```ts
export default defineApiConfig({
  input: "https://your-abp-host/swagger/v1/swagger.json",
  output: "src/api",
});
```

`output` defaults to `src/api`; `zod` defaults to on (zod schemas generated for form validation reuse). For multiple backends use the `{ targets: { identity: {...}, business: {...} } }` shape — note that `--input`/`--output` flags stop applying there.

There is no `baseUrl` in the config: `input` is only where swagger is read at generation time. Where requests go at runtime is decided by `src/api/mutator.ts` — call `configureAbpMutator({ baseUrl })` once at app startup (the starter goes through the BFF proxy, so baseUrl stays empty).

---

## 6. `jc-abp gen`

```bash
npx jc-abp gen
# self-signed backend certificate? set AUTH_EXTRA_CA_FILE in .env — see "A local backend with a self-signed certificate" below
```

It produces three directories plus one file:

- `src/api/endpoints/` — react-query hooks and fetch functions, split by tag
- `src/api/models/` — DTO types
- `src/api/schemas/` — zod schemas (with `zod: true`)
- `src/api/mutator.ts` — the request pipeline, **created only when absent**; your edits are never overwritten

After generating, it verifies `endpoints/` is non-empty — orval can exit 0 on an invalid or empty swagger while producing nothing, and this check makes that fail loudly.

`input` also accepts a local file path, so an offline swagger.json works when the backend is down.

---

## 7. Run it

```bash
bun run dev
```

Check off each item:

1. Open the home page → the landing page renders (signed out)
2. Click sign in → the ABP login page → back to the app after signing in
3. Enter the console → the sidebar is there, the current item has its indicator
4. Open `/tenants` or `/identity/users` → the table has data (with `admin-pages` installed)
5. Switch language → after the full-page reload, both the messages and `<html lang>` changed

---

## A local backend with a self-signed certificate

A local ABP uses the self-signed certificate from `dotnet dev-certs`; `--trust` puts it in the system keychain, which is why the browser and curl accept it. **Node does not read the keychain** — it verifies against its own bundled CA list only. So the browser can open `https://localhost:44316` while server-side requests are still rejected (`DEPTH_ZERO_SELF_SIGNED_CERT`). Both `gen` and `dev` hit this: the former reports a fetch failure, the latter a 500 on the home page.

Export the certificate and put its path in `.env` — only this one certificate gets trusted extra:

```bash
dotnet dev-certs https --export-path ~/.aspnet-dev.crt --format PEM
```

```bash
# .env
AUTH_EXTRA_CA_FILE=~/.aspnet-dev.crt
```

After that, both `bun run dev` and `npx jc-abp gen` just work. The auth runtime appends the certificate to the process default CA before the first upstream request (`tls.setDefaultCACertificates`, requires **Node ≥ 22.15**); every other host is verified as usual.

Older runtimes (earlier Node, Bun running the server directly) lack the API; a log line points at the fallback — start the process with `NODE_EXTRA_CA_CERTS=~/.aspnet-dev.crt` (read at process startup, so `.env` cannot carry it).

`NODE_TLS_REJECT_UNAUTHORIZED=0` also gets you through, but it disables certificate verification for the entire process against every host. Fine for a quick test; never leave it in any file that gets copied to a server.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `init` aborts immediately, says the shell exists | This directory was initialized before | Use a clean directory, or delete the previous output |
| `init` reports `EALLOWSCRIPTS` | `allow-scripts` in the npmrc injected via `npx` | See the prerequisites section |
| `init` can't find a css entry | Your css isn't at any of the four probe locations | Create the css entry first, or place a `components.json` yourself |
| `gen` reports empty endpoints | Invalid swagger, wrong address, or the backend is down | Open the swagger URL directly in a browser |
| `gen` reports a fetch failure | Self-signed local backend certificate | See the previous section |
| Home page 500 saying upstream TLS certificate is not trusted | The server-to-backend hop rejected the certificate | See the previous section |
| Home page 500 saying cannot reach the ABP backend | The backend isn't running, or `AUTH_ABP_BASE_URL` points wrong | Start the backend / fix `.env` |
| Blank page, console says a provider is missing | `__root.tsx` broken or reverted from `.bak` | Check against section 4, or restore from the starter's copy |
| Sign-in keeps bouncing back to the login page | client id / secret / redirect URI in `.env` don't match | Verify the client configuration on the ABP side |
| `jc-abp` command not found | Running inside the monorepo requires a build first | `bun run build`, then `node packages/cli/bin/jc-abp.js` |

---

## What the finished project looks like

After everything runs, the app looks roughly like this (ground truth is [`examples/starter`](../../examples/starter); files marked `# generated` are rewritten whole by rerunning the corresponding command — don't hand-edit):

```
your-app/
├── .env.example                # landed by jc-abp add auth; the AUTH_* env template
├── components.json             # shadcn CLI config; seeded by init when missing (new-york/neutral)
├── abp.api.config.ts           # optional jc-abp gen config (defineApiConfig for multi-target)
└── src/
    ├── env.ts                  # app-owned server/client env (zod-validated); AUTH_* validated inside auth, don't duplicate
    ├── app-env.d.ts            # ImportMetaEnv / process.env type declarations
    ├── menu.tsx                # app-shell block: navigation start, MenuItem<FileRouteTypes["to"]>[] (renamed routes fail at compile time)
    ├── permissions.ts          # app-shell block: ABP-style permission constants; guards/menu/can() all import it — no bare strings
    ├── router.tsx              # scaffold output; init patched in QueryClient and setupRouterSsrQueryIntegration
    ├── routeTree.gen.ts        # generated, don't hand-edit
    ├── styles.css              # Tailwind + the ABP React Start theme tokens; replaced whole by init when --background etc. were missing (original backed up as .bak)
    │
    ├── auth/                   # landed by jc-abp add auth — assembly/handlers/guards sank into the npm package; 4 files remain
    │   ├── auth.config.ts        # ★ the only file to look at: createAbpAuthRuntime(process.env, {…overrides})
    │   ├── runtime.ts            # process-level runtime singleton
    │   ├── server-fns.ts         # getIdentityFn / getAppStateFn / abpRequestFn (compile-time constraint, must stay copy-in)
    │   ├── middleware.ts         # TanStack request middleware (same)
    │   └── index.ts              # barrel: server fns + requireAuth/requirePermission
    │
    ├── api/                    # generated by jc-abp gen (orval)
    │   ├── endpoints/            # react-query hooks grouped by ABP application service
    │   ├── models/ schemas/      # DTO types and zod schemas
    │   ├── mutator.ts            # seeded once, yours to customize afterwards
    │   └── abp-fetch.ts          # app-shell block: the bridge from the orval mutator to the auth server proxy
    │
    ├── components/
    │   ├── ui/                 # official shadcn primitives, installed as-is (customize via the theme layer's data-slot rules)
    │   ├── data-table/         # general server-side paging/sorting/search table, zero ABP dependencies
    │   ├── form/               # form shell + field components + server field-error mapping, zero ABP dependencies
    │   ├── combobox/ tree/ date-picker/   # general primitive blocks, zero ABP dependencies
    │   └── abp/                # ABP adapter blocks, one subdirectory per block
    │       ├── layout/           # sidebar / header / breadcrumbs / locale & theme switchers / BrandMark (rebrand = edit this one file)
    │       ├── login/            # password sign-in card + OIDC entry
    │       ├── crud/             # createCrudService / AbpTableSource / form error mapping
    │       ├── table/            # useAbpTable: table + filter panel + bulk actions + row menu
    │       ├── sheet/            # useAbpSheet: the create/edit/delete drawer
    │       └── permission/       # the permission tree sheet
    │
    ├── hooks/use-mobile.ts     # official shadcn hook, installed with ui
    ├── lib/utils.ts            # cn(); seeded by init when missing
    ├── i18n/{en,zh-Hans}.json  # the app-owned catalog (the "App" bucket), two-layer merged with backend ABP resources
    │
    └── routes/                 # TanStack file routes
        ├── __root.tsx            # the glue init wrote: provider wiring + deep message merge + abp-fetch import + error boundaries
        ├── index.tsx             # app-shell block: full-width marketing landing page, outside the _layout sidebar shell
        ├── login.tsx             # app-shell block: /login, also outside the shell
        ├── shell-boundary.tsx    # RouteError / RouteNotFound — deliberately not under the providers (on error that subtree is already gone)
        ├── _layout.tsx           # pathless layout shell (sidebar + header); content padding comes from here
        ├── _layout/
        │   ├── forbidden.tsx      # the 403 page, hand-maintained
        │   ├── _authed.tsx        # pathless guard shell, requireAuth() in beforeLoad
        │   └── _authed/           # admin-pages block: identity/{users,roles}, tenants, settings, profile
        ├── -showcase/            # `-` prefix = not a route; the landing page's live demos (starter increment, not registry-distributed)
        └── api.auth.{login,callback,logout}.ts, api.culture.ts, api.tenant.ts
```

## Next steps

- Add your own list / CRUD maintenance page → [`abp-table.en.md`](abp-table.en.md)
- Writing forms and validation → [`forms.en.md`](forms.en.md)
- Installing only some blocks, without init → [`install-blocks.en.md`](install-blocks.en.md)
- Theme and typography → [`DESIGN.md`](../../DESIGN.md) (Chinese)

For the complete reference implementation, [`examples/starter`](../../examples/starter) is a product of this exact flow — [`scripts/regenerate-example.sh`](../../scripts/regenerate-example.sh) replays "scaffold → install → init → gen" and applies a manifested handwritten increment on top, making it both living documentation and the end-to-end regression for the CLI and registry.
