# Installing blocks selectively

`jc-abp init` installs every block in dependency order at once. This document is for the other case: **you want only some of them**, or you want to understand how the blocks depend on each other. For first-time setup, go through [`initialize-a-project.en.md`](initialize-a-project.en.md) — that path is shorter and also seeds `components.json`, the theme css, and the auth shell.

> English edition. 中文版见 [`install-blocks.md`](install-blocks.md)。

## Install the block you want; prerequisites come along

Every block declares its prerequisites in `registryDependencies`, and shadcn installs the whole chain. For `admin-pages` (the five admin pages, the deepest chain) a single command is enough:

> The version is pinned to `shadcn@4.13` — the same one `jc-abp init` uses internally. 4.13's preset behavior when `components.json` is missing is a standing assumption of these registry blocks; `@latest` may install something different.

```bash
jc-abp add auth   # the auth shell; abp-login/app-shell depend on it, and it is not distributed via the registry
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/admin-pages.json
```

That command installs all 85 files of all 13 blocks, plus the shadcn primitives they use. For a smaller subset, swap in the corresponding block — tables only, for example:

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/abp-table.json
```

It automatically brings `data-table`, `form`, `combobox`, `date-picker`, and `abp-crud`.

### Why sibling blocks are written as paths, not names

shadcn treats a **bare name** as an official-registry item: `abp-crud` would resolve to `ui.shadcn.com/r/.../abp-crud.json`, 404, and the whole install exits in failure. Sibling blocks are therefore always written as `./node_modules/@jcoder-stack/registry/public/r/<name>.json` — a path resolved against the **consuming project's root**, pointing into your installed `@jcoder-stack/registry`. `registry/scripts/check-registry-deps.mjs` polices both ends: bare names are rejected outright, and path forms are verified to point at an existing sibling.

> **Not applicable inside npm / yarn classic workspaces.** Those two package managers hoist `@jcoder-stack/registry` to the workspace root `node_modules`; the member directory doesn't have it, and the relative path above does not resolve. In such projects, install blocks one by one following the prerequisites table below. `jc-abp init` is unaffected — it resolves the real path itself and works under any layout. bun and pnpm create symlinks in the member directory and are not subject to this.

## Per-block prerequisites

| Block | Prerequisite blocks | Non-registry prerequisites |
| --- | --- | --- |
| `abp-layout` | — | The app root has `SessionProvider` / `AppConfigProvider` wired |
| `abp-login` | — | `jc-abp add auth` (`login-form.tsx` imports `@/auth/server-fns`) |
| `app-shell` | `abp-layout`, `abp-login` | `jc-abp add auth` |
| `data-table` | — | — |
| `combobox` | — | — |
| `date-picker` | — | — |
| `form` | `combobox`, `date-picker` | — |
| `abp-crud` | — | `jc-abp gen` (descriptors bind the generated endpoints and types) |
| `abp-table` | `data-table`, `form`, `abp-crud`, `date-picker` | Same as above |
| `abp-sheet` | `form`, `abp-crud` | Same as above |
| `tree` | — | — |
| `abp-permission-sheet` | `tree`, `form` | `jc-abp gen` run against the ABP Permission Management module |
| `admin-pages` | `app-shell` plus everything above except `abp-layout`/`abp-login` | `jc-abp gen` run against the four built-in modules: Identity / TenantManagement / SettingManagement / Account |

The "non-registry prerequisites" column is the easiest to trip on: those import targets are **not distributed with the registry**, and missing them is a compile failure, not a runtime error.

## Installing blocks only? The root wiring is on you

Skip this section if you went through `jc-abp init` — it already wrote both files (see [section 4 of the initialization guide](initialize-a-project.en.md)). Only people installing blocks by hand without init need to do this themselves:

- `src/routes/__root.tsx` — wire `AppConfigProvider` / `SessionProvider` (reading `getAppStateFn` / `getIdentityFn`), the side-effect `import "@/api/abp-fetch"`, deep-merge each installed block's `*-messages.json` into `messages`, and provide the `identity` returned from `beforeLoad` (the route guards read it).
- `src/router.tsx` — add the `QueryClient` context and `setupRouterSsrQueryIntegration`. The scaffolded router has neither, and most blocks make their requests through react-query.
- `src/i18n/app-messages.json` — `menu.tsx` uses `App::`-prefixed entries; that bucket belongs to the app and no block provides it.

The complete reference is [`examples/starter/src/routes/__root.tsx`](../../examples/starter/src/routes/__root.tsx) and [`examples/starter/src/router.tsx`](../../examples/starter/src/router.tsx).

## Block by block

**`app-shell`** distributes 18 files: `_layout.tsx` (the pathless layout shell), `_layout/_authed.tsx` (the guard shell, running `requireAuth()`), `index.tsx` (the full-width marketing landing page, outside the sidebar shell), `login.tsx`, `_layout/forbidden.tsx` (the 403 page permission guards redirect to), `shell-boundary.tsx` (`RouteError` / `RouteNotFound`, with a built-in static last resort against the error page itself failing), `components/section-boundary.tsx` (a section-level error boundary to wrap parts of a page), `api/abp-fetch.ts`, `menu.tsx`, `permissions.ts`, plus the seven `routes/-showcase/*` demo components the landing page uses. All are verbatim copies of the starter's counterparts except `menu.tsx`, which is deliberately a clean starting point — it omits the `books` menu item from the starter's handwritten increment; add and remove entries to match the pages you actually expose.

The `-showcase/*` demo components import from `data-table` / `form` / `combobox` / `date-picker` / `tree` / `abp-table` — so when installing in the order above, the landing page's imports dangle for a while until the later blocks fill them in; typecheck passes only then. The installation itself is unaffected (shadcn does not typecheck). If you truly want the shell without the landing demos, delete `src/routes/-showcase/` after installing and remove the corresponding sections in `index.tsx`.

**`data-table`**'s horizontal scrolling comes from the `table-container` (`overflow-x-auto`) built into the shadcn `table` primitive; the `overflow-hidden` on `DataTable`'s outer wrapper exists to clip the `rounded-md` corners — do **not** change it to `overflow-x-auto`, which would break the corner clipping and create a second scroll container at once. If your project's `table` is an older version without `table-container`, upgrade it first.

**`combobox`**'s single-select `Combobox` and multi-select `MultiCombobox` share one `useComboboxOptions` (local filtering, or remote `loadOptions` debounced at 400ms), built on the official `combobox` primitive. The `combobox` in its `registryDependencies` refers to the **official item of that name**, not itself — the one name collision in the whole repository.

**`abp-crud`** is the protocol layer with zero sibling dependencies (`crud-service.ts` / `abp-table-source.ts` / `create-bound-components.ts` / `abp-form-errors.ts` / `abp-form-options.ts`). You don't handwrite the `CrudService<T>` descriptor: after `jc-abp gen` produces the endpoints and types, you write one descriptor instance binding them, and `useAbpTable` / `useAbpSheet` drive off that instance. A service with `supportsFilter: false` makes the table hide the search box entirely instead of rendering a dead input. For a read-only list page (a service without create/update), install just `abp-crud` + `abp-table` and skip `abp-sheet`. Usage is in [`abp-table.en.md`](abp-table.en.md).

**`tree`** carries zero business knowledge: `label` / `icon` come from the consumer, and cascade policies (checking forces the parent chain, unchecking clears the subtree, indeterminate derivation) are not implemented inside the component — the pure functions in `tree-helpers.ts` (`collectSubtreeIds` / `findParentChain` / `deriveIndeterminate`) are there for the consumer to compose.

**`abp-permission-sheet`**, besides the `tree` / `form` components, directly imports `@/api/endpoints/permissions/permissions` and the permission DTOs under `@/api/models` — it targets ABP's built-in module, the generated paths are deterministic, and having run `jc-abp gen` is all it needs; no extra wiring. Its distributed `admin-messages.json` carries the `Admin:` bucket entries that the five `admin-pages` also rely on — deep-merge it into `messages` in `__root.tsx` too, or the pages render raw keys.

**`admin-pages`**' five pages (`identity/users`, `identity/roles`, `tenants`, `settings`, `profile`) are verbatim copies of the starter's route files, typed `registry:file` rather than `registry:page` — their `target`s land directly in `src/routes/_layout/_authed/`, because shadcn's `registry:page` demonstrably does not write to disk outside Next.js projects. The five pages are reachable only under `_layout/_authed`, which is why `app-shell` is a hard prerequisite. Except `profile` (reached through the `NavUser` dropdown), the other four appear in the sidebar only after you add menu items to `menu.tsx` yourself.

## Updating a single block

To pick up the latest version of one block, no need to rerun init:

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/<block>.json --overwrite
```

`--overwrite` replaces your local edits inside that block's files. A block's customization points are the theme layer (the `data-slot` rules in `styles.css`) and `cn()`-merged classes — not the block source; see [`../../DESIGN.md`](../../DESIGN.md) (Chinese).
