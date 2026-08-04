# @jcoder-stack/cli

The `jc-abp` CLI: `gen` (orval-preset react-query client generation) + `add` (copy a registry shell in) + `init` (one-stop setup).

One of the core packages of `abp-react-start` — a pure-React frontend framework for ABP backends. See the repository root README for the big picture.

## Install

```bash
bun add -D @jcoder-stack/cli @jcoder-stack/registry
```

`add` and `init` take their shell sources from `@jcoder-stack/registry`, so the two are installed together.

## Commands

### `jc-abp init [--no-admin] [--backend <url>]`

One-stop setup: install the auth shell, install the shadcn admin blocks in dependency order, seed `abp.api.config.ts` and `.env`, and generate the route tree. `--no-admin` skips admin-pages and swaps in a minimal menu.

In an interactive terminal, init asks one question — your ABP backend URL (Enter skips it). Answering fills `AUTH_ISSUER`, `AUTH_ABP_BASE_URL`, and the swagger `input` in one go, and a short reachability probe at the end tells you if the backend is down or its certificate is untrusted (informational only — init never fails because of it). `--backend` answers the question for scripts and CI.

Two preflight checks run before anything is written (has init run here before; can npm install the blocks) — if either fails, init aborts without touching a file. A mid-run failure lists the steps already completed; init does not roll back.

### `jc-abp gen [--input <url|file>] [--output <dir>] [--config <file>]`

Reads `abp.api.config.{ts,js,json}` (flags override) and generates endpoints/models/schemas plus the mutator via orval.

```ts
// abp.api.config.ts
import { defineApiConfig } from "@jcoder-stack/cli";

export default defineApiConfig({
  input: "https://localhost:44316/swagger/v1/swagger.json",
  output: "src/api",
  zod: true,
});
```

For multiple backends use the `{ targets: { identity: {...}, business: {...} } }` shape; flags cannot land on one target there, so passing `--input`/`--output` is an error — edit the config file, or point `--config` at a single-target one.

The CLI as a whole requires Node ≥ 18, but a `.ts` config needs a runtime that executes TypeScript directly (Bun, or Node ≥ 22.18 strip-types) — `init`/`add` work fine on Node 18; only `gen` reading a `.ts` config does not, and on older Node you can switch to `abp.api.config.json` (`gen` tells you the same when it happens).

### `jc-abp add <name> [--from <registryDir>] [--dest <dir>]`

Copies a registry shell (e.g. `auth`) into the project, landing in `src/<name>` by default, and **refuses to overwrite any existing file**. Entries with a manifest are distributed to their declared target directories with relative imports rewritten.

### `jc-abp help`

Prints usage.
