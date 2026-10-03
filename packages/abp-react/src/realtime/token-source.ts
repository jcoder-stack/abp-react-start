import type { GetConnectionInfo, HubConnectionInfo } from "./types";

/** Refetch this long before the token's stated expiry so a negotiate never races it. */
const DEFAULT_SKEW_MS = 60_000;

export interface TokenSource {
  info(): Promise<HubConnectionInfo | null>;
  /** The access token for the transport; rejects for an anonymous visitor. */
  token(): Promise<string>;
  invalidate(): void;
}

/**
 * Per-hub token cache, in memory only: the token is the one deliberate exception to "tokens never
 * reach the browser" (see docs/architecture.md), so it must not outlive the page.
 */
export function createTokenSource(
  hub: string,
  getConnectionInfo: GetConnectionInfo,
  opts: { now?: () => number; skewMs?: number } = {},
): TokenSource {
  const now = opts.now ?? Date.now;
  const skewMs = opts.skewMs ?? DEFAULT_SKEW_MS;
  let cached: HubConnectionInfo | null = null;
  let inflight: Promise<HubConnectionInfo | null> | null = null;
  let generation = 0;

  const isFresh = (value: HubConnectionInfo) =>
    value.expiresAt !== null && now() < value.expiresAt - skewMs;

  function info(): Promise<HubConnectionInfo | null> {
    if (cached !== null && isFresh(cached)) return Promise.resolve(cached);
    inflight ??= (() => {
      const currentGeneration = generation;
      return getConnectionInfo(hub)
        .then((result) => {
          if (generation === currentGeneration) {
            cached = result;
          }
          return result;
        })
        .finally(() => {
          if (inflight === currentPromise) {
            inflight = null;
          }
        });
    })();
    const currentPromise = inflight;
    return inflight;
  }

  return {
    info,
    token: async () => {
      const result = await info();
      if (result === null) throw new Error(`not signed in: no token for realtime hub "${hub}"`);
      return result.accessToken;
    },
    invalidate: () => {
      cached = null;
      inflight = null;
      generation += 1;
    },
  };
}
