/** ABP maps a hub to /signalr-hubs/<kebab-case-name>; the same rule guards the server-side URL. */
export const HUB_NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * Throws on a hub name the server would reject. Checked up front: a rejected name would otherwise
 * surface as a failed token fetch, which the client treats as transient and keeps retrying.
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

/**
 * SignalR's built-in policy gives up after four tries; an admin tab stays open for hours, so
 * reconnects after a successful start never do. The initial connect gives up once this schedule is
 * exhausted (see client.ts): a hub never reached is usually misconfigured, not briefly down.
 */
export function nextReconnectDelay(previousRetryCount: number): number {
  return RECONNECT_DELAYS_MS[previousRetryCount] ?? RECONNECT_STEADY_DELAY_MS;
}

export type StartFailure = "not-found" | "unauthorized" | "forbidden" | "transient";

const NEGOTIATE_PREFIX = "Failed to complete negotiation";

function isNegotiateFailure(error: unknown, message: string): boolean {
  const errorType =
    typeof error === "object" && error !== null && "errorType" in error
      ? error.errorType
      : undefined;
  return errorType === "FailedToNegotiateWithServerError" || message.startsWith(NEGOTIATE_PREFIX);
}

/**
 * Classifies a failed `start()`. @microsoft/signalr only keeps the HTTP status inside the message
 * (`…: Status code '404'`), wrapped in FailedToNegotiateWithServerError, so the message is what we read.
 * Only a negotiate status speaks for the hub itself; a transport's status (e.g. a 404 from long
 * polling against a scaled-out backend without sticky sessions) is transient.
 */
export function classifyStartError(error: unknown): StartFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (!isNegotiateFailure(error, message)) return "transient";
  const status = /Status code '(\d{3})'/.exec(message)?.[1];
  if (status === "404") return "not-found";
  if (status === "401") return "unauthorized";
  if (status === "403") return "forbidden";
  return "transient";
}
