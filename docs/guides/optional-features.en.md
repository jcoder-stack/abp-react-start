# Optional features

> English edition. 简体中文版：[`optional-features.md`](optional-features.md)

Some capabilities are not for every project: PWA, SignalR real-time notifications. They ship as **optional features**: zero cost when absent, one command to add them to a new or an existing project.

## Available features

| Name | What it does | Guide |
| --- | --- | --- |
| `signalr` | Connects to ABP SignalR hubs: real-time notification toasts, `useHubEvent` / `useHub` for custom hubs | [realtime.en.md](realtime.en.md) |

## Installing

New project, together with init:

```bash
npx jc-abp init --with pwa,signalr
```

Existing project (anything `jc-abp init` generated, 0.4 onwards), later:

```bash
npx jc-abp add pwa
```

Rerunning `add <feature>` skips the aggregator, the root wiring and the env keys that are already there, but it reinstalls the feature's own files and the shadcn components it declares, overwriting your edits under `src/features/<name>/`. Commit your changes first.

## What lands in the project

Each feature is a shadcn block under `src/features/<name>/`, entry `feature.tsx`, which default-exports a `FeatureModule`:

| Field | Purpose |
| --- | --- |
| `Provider` | Wraps the app inside `SessionProvider`, so it can read the session and app config |
| `head` | Appended to the root route's `meta` / `links` |
| `messages` | The feature's own catalog; merged first, so the app's catalogs can override any key |

`src/features/index.ts` collects them with `import.meta.glob("./*/feature.tsx")` and `__root.tsx` references only that. So:

- **adding a feature adds a folder**; `__root.tsx` is not touched again;
- **removing a feature deletes the folder** (PWA excepted: follow the uninstall steps in its guide first).

The entry is deliberately `feature.tsx`, not `index.tsx`: plenty of apps keep business code in `src/features/<module>/index.tsx`, and the glob must not sweep that into the root bundle.

## The `__root.tsx` of older projects

On a project generated before 0.5, the first feature install patches `src/routes/__root.tsx` in four places (the import, both head arrays, the catalog merge, `<FeatureProviders>` around `<Outlet />`) and keeps the original as `__root.tsx.pre-features.bak`.

If you changed `__root.tsx` and the CLI does not recognize its shape, it **leaves the file exactly as it was** and prints the four manual steps. Do them once; later features need no further root edits.

## Environment variables

A feature's variables are appended to `.env.example`, and to `.env` when it exists. Existing keys (including commented-out `# KEY=`) are never overwritten, and a missing `.env` is not created for you.
