# @jcoder-stack/registry

The copy-in source for the auth shell, factored down to a minimum: **`auth.config.ts` is the only file you need to look at** — a single `createAbpAuthRuntime(process.env, {…overrides})` call, where the defaults are the current behavior and every override (cookie names/lifetimes, strategy toggles, post-logout redirect, identity resolver…) ships with a default; uncomment to activate. The rest is thin wiring: `runtime.ts` (a process singleton), `server-fns.ts` / `middleware.ts` (TanStack wiring that must stay copy-in for compile-time reasons), and `index.ts` (the barrel).

All assembly and mechanics live down in the packages: the ABP auth runtime factory `createAbpAuthRuntime` and the login/callback/logout/culture/tenant handlers → `@jcoder-stack/abp-react/proxy`; the route guards `requireAuth`/`requirePermission` → `@jcoder-stack/abp-react/router` (TanStack Router beforeLoad, re-exported through the `@/auth` barrel); ABP proxy calls, identity reads, and the returnUrl/culture pure functions → `@jcoder-stack/abp-react/proxy` / `@jcoder-stack/abp-react/auth`.

`jc-abp add auth` distributes it into the app's `src/` per the manifest. Part of the ABP React Start framework — see the repository root README for the big picture.

## UI blocks

`ui/blocks/` holds blocks installable with the official shadcn CLI; the built artifacts live in `public/r/`:

| Block | Contents |
| --- | --- |
| `abp-layout` | The sidebar layout (AppSidebar / SiteHeader / breadcrumbs / locale & theme switchers / brand mark) |
| `abp-login` | The password sign-in card, with an OIDC entry point |
| `app-shell` | App-shell glue: the `_layout`/`_authed`/home/login routes + `abp-fetch.ts` + the starting `menu.tsx` |
| `data-table` | A general server-side paging/sorting/search table |
| `combobox` | Single/multi-select combobox (local filtering or debounced remote loadOptions) |
| `date-picker` | Single date / date range / date-time pickers |
| `form` | The form shell + field components + server-side field error mapping |
| `abp-crud` | The ABP CRUD protocol (`createCrudService` / `AbpTableSource`) and shared pieces |
| `abp-table` | `useAbpTable` — table + filter panel + bulk actions |
| `abp-sheet` | `useAbpSheet` — the create/edit/delete drawer |
| `tree` | A general tree block (expand/collapse, checking; cascade policy left to the consumer) |
| `abp-permission-sheet` | The permission tree sheet (groups as Accordion, a Tree per group) |
| `admin-pages` | The five admin pages: users / roles / tenants / settings / profile |

Install steps, dependency order, and each block's prerequisites are in [`docs/guides/install-blocks.md`](../docs/guides/install-blocks.md). After changing block sources, rebuild the artifacts with `bun run build:registry`.
