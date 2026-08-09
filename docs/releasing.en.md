# Releasing

This document covers **how changes ship** — when CI gates, which version fields to edit, and how a prerelease gets acceptance-tested against a real backend. Written for maintainers, not consumers.

> English edition. 中文版见 [`releasing.md`](releasing.md)。

## When CI runs

Both workflows under `.github/workflows/` are `on: push: tags: ["v*"]` plus `workflow_dispatch` — **pull requests trigger no CI at all**. That is deliberate: lint/typecheck/test/build run locally on every change, so running them again on every PR is duplicated spend, and a release is the one moment where being wrong costs the most.

| Workflow | What it runs | Why only here |
| --- | --- | --- |
| `ci.yml` | lint, typecheck, test, build, plus the **registry artifact drift check** | The drift check exists nowhere else: edit a block's source, forget `build:registry`, and the repo's own code stays complete — lint/typecheck/test see nothing. Only an installed project gets the stale files |
| `publish-smoke.yml` | `scripts/publish-smoke.sh`: a real `npm pack` and `prepublishOnly` | The publish path (`prepublishOnly`'s binary resolution, `prepack`'s `publishConfig` rewrite, tarball contents) only surfaces its problems when a package is actually packed |

For a clean-machine check at any other time (different Node/bun version, a suspect lockfile), trigger either one manually from the Actions page.

`npm publish` **is manual** — there is no publish workflow in this repo.

## Which version fields to edit

Historically (0.1.0 → 0.1.3) three, one `version` per package:

- `packages/abp-react/package.json`
- `packages/cli/package.json`
- `registry/package.json`

**Crossing a minor adds a fourth**: `registry/package.json`'s `dependencies["@jcoder-stack/abp-react"]`. It currently reads `^0.1.0`, and caret ranges **exclude prerelease versions wholesale**. Measured:

```
0.2.0-rc.1  satisfies ^0.1.0      -> false
0.1.4-rc.1  satisfies ^0.1.0      -> false
0.2.0-rc.1  satisfies ^0.2.0-rc.1 -> true
0.2.0       satisfies ^0.2.0-rc.1 -> true
```

Leave it alone and `registry@0.2.0-rc.1` resolves `abp-react` to the **previous stable**, making the acceptance run worthless — and it fails as "installs fine, wrong version", which is harder to notice than a failed install.

`publish-smoke.sh` will not catch this. It only greps for leftover `workspace:` ranges; it does not verify that cross-package ranges resolve to each other.

## What else moves with a version

`scripts/regenerate-example.sh` carries a **pin table** (inside `patch_package_json`) locking the scaffolded app to the versions `examples/starter` has committed, so the replay stays reproducible. **Upgrading starter's TanStack dependencies requires updating that table too** — otherwise the next replay quietly walks them back down.

The cost of missing it is invisible: `bun install` succeeds, tests pass, and only the replayed `package.json` disagrees with the committed one.

## Cutting a stable release

```bash
# on main, with the version fields above already edited
git commit -am "chore: release X.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

Pushing the tag triggers both workflows. **Wait for them to go green before publishing** — that is their entire purpose.

Then publish in dependency order (`registry` depends on `abp-react`; reversed, there is a window where the dependency dangles):

```bash
(cd packages/abp-react && npm publish)
(cd packages/cli       && npm publish)
(cd registry           && npm publish)
```

All four historical tags were cut from `main`; there has never been a release branch. For a single-maintainer repo, parallel development during an rc doesn't justify the cherry-pick overhead.

## Prereleases and acceptance testing

When a change is large enough — a major dependency upgrade, a block changing shape — cut an rc first, replay it outside the repo using the **published** packages, then cut the stable release.

The reason is that `examples/starter` wires the three packages as `workspace:*`, so every in-repo check tests **source**, never the published artifact. Some failures only appear on a real publish; `publish-smoke.sh`'s comments record one: npm snapshots the manifest into registry metadata *before* `prepack` runs, so a leftover `workspace:` range yields a package that publishes fine and cannot be installed (reproduced with verdaccio on 2026-08-02).

### Publishing an rc

Version as `X.Y.0-rc.N`, everything else as above, but publish under `--tag next`:

```bash
(cd packages/abp-react && npm publish --tag next)
(cd packages/cli       && npm publish --tag next)
(cd registry           && npm publish --tag next)
```

`--tag next` is the point: it doesn't claim `latest`, so existing users running `npx jc-abp` or `npm i @jcoder-stack/abp-react` still get the previous stable.

### The acceptance run

**Do not use `scripts/regenerate-example.sh` for this** — it always writes the three packages as `workspace:*` and only suits in-repo replays. Walk the "real developer" path its comments describe:

```bash
npx --yes @tanstack/cli@latest create acc-test --framework React \
  --package-manager bun --no-git --no-examples --no-toolchain --no-intent --non-interactive
cd acc-test
bun add @jcoder-stack/abp-react@next
bun add -D @jcoder-stack/cli@next @jcoder-stack/registry@next
bunx jc-abp init
bunx jc-abp gen                 # pointed at a real ABP backend
bunx jc-abp add <the blocks the change touches>
bun run dev && bun run build
```

Three things to confirm, at minimum:

1. **It installs, and installs the rc** — the positive check on the cross-package range above. `bun pm ls | grep jcoder` to see the resolved versions.
2. **The installed blocks compile in a real project** — in-repo typecheck consumes `src`; an installed project consumes `dist` plus the copy-in sources. Those are not equivalent.
3. **CRUD works against a real ABP backend** — the mock backend can't reproduce real ABP error shapes or permission behavior.

### After it passes

Set the version to `X.Y.0`, tighten `registry`'s dependency range to `^X.Y.0`, tag again, and `npm publish` without `--tag` so it lands on `latest`.

If it fails, fix on `main` and cut `-rc.N+1`. **A burnt rc number stays burnt** — npm won't allow reuse, and don't `unpublish`: that breaks the lockfile of anyone who already installed it.
