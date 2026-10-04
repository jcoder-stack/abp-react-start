import type { AuthSession } from "@jcoder-stack/abp-react/auth";
import { HUB_NAME_PATTERN, type HubConnectionInfo } from "@jcoder-stack/abp-react/realtime";
import { z } from "zod";

export const hubInputSchema = z.object({ hub: z.string().regex(HUB_NAME_PATTERN) });

/** ABP maps hubs under this path unless the backend sets AbpSignalROptions otherwise. */
export const DEFAULT_HUB_PREFIX = "/signalr-hubs";

/**
 * Derives what the browser needs to open `hub`. The URL is built here, on the server, from the
 * backend origin the BFF already trusts, so the client never names an arbitrary host.
 */
export function hubConnectionInfo(opts: {
  session: AuthSession | null;
  abpBaseUrl: string;
  hubPrefix: string | undefined;
  hub: string;
}): HubConnectionInfo | null {
  if (opts.session === null) return null;
  const trimmed = opts.hubPrefix?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  const prefix = trimmed === "" ? DEFAULT_HUB_PREFIX : `/${trimmed}`;
  return {
    url: `${opts.abpBaseUrl.replace(/\/+$/, "")}${prefix}/${opts.hub}`,
    accessToken: opts.session.tokens.accessToken,
    expiresAt: opts.session.expiresAt ?? null,
  };
}
