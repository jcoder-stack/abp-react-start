/** ABP maps a hub to /signalr-hubs/<kebab-case-name>; the same rule guards the server-side URL. */
export const HUB_NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * Throws on a hub name the server would reject. Checked up front: a rejected name would otherwise
 * surface as a failed token fetch, which the client treats as transient and retries forever.
 */
export function assertHubName(hub: string): void {
  if (!HUB_NAME_PATTERN.test(hub)) {
    throw new Error(
      `invalid realtime hub name ${JSON.stringify(hub)}: use lowercase letters, digits and dashes ` +
        "(it maps to /signalr-hubs/<name> on the ABP backend)",
    );
  }
}

export const RECONNECT_DELAYS_MS = [0, 2_000, 5_000, 10_000, 30_000] as const;
export const RECONNECT_STEADY_DELAY_MS = 60_000;

/** SignalR's built-in policy gives up after four tries; an admin tab stays open for hours, so this one never does. */
export function nextReconnectDelay(previousRetryCount: number): number {
  return RECONNECT_DELAYS_MS[previousRetryCount] ?? RECONNECT_STEADY_DELAY_MS;
}

export type StartFailure = "not-found" | "unauthorized" | "transient";

/**
 * Classifies a failed `start()`. @microsoft/signalr only keeps the HTTP status inside the message
 * (`…: Status code '404'`), wrapped in FailedToNegotiateWithServerError, so the message is what we read.
 */
export function classifyStartError(error: unknown): StartFailure {
  const message = error instanceof Error ? error.message : String(error);
  const status = /Status code '(\d{3})'/.exec(message)?.[1];
  if (status === "404") return "not-found";
  if (status === "401") return "unauthorized";
  return "transient";
}
