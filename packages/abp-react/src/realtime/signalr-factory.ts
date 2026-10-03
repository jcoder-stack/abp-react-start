import type { ConnectionFactory } from "./types";

/**
 * Builds a real @microsoft/signalr connection. The package is imported on first connect so apps
 * that never open a hub never download it. SignalR's own logger is silenced: a hub missing on the
 * default ABP template is an expected state, and the client logs what matters through ours.
 */
export const signalRConnectionFactory: ConnectionFactory = async ({
  url,
  accessTokenFactory,
  nextRetryDelayMs,
}) => {
  const signalR = await import("@microsoft/signalr");
  return (
    new signalR.HubConnectionBuilder()
      // Bearer 走 accessTokenFactory，不需要跨域 cookie，后端 CORS 不必开 credentials。
      .withUrl(url, { accessTokenFactory, withCredentials: false })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) => nextRetryDelayMs(context.previousRetryCount),
      })
      .configureLogging(signalR.LogLevel.None)
      .build()
  );
};
