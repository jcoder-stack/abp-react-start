/** What the server hands the browser to open one hub connection. */
export interface HubConnectionInfo {
  url: string;
  accessToken: string;
  /** Epoch ms after which the token is no longer valid; null when the IdP did not say. */
  expiresAt: number | null;
}

/** Fetches connection info for a hub; resolves null for an anonymous visitor (no connection is made). */
export type GetConnectionInfo = (hub: string) => Promise<HubConnectionInfo | null>;

export type HubState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "disconnected";

/** The slice of @microsoft/signalr's HubConnection the client drives, so tests can supply a fake. */
export interface HubConnectionLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(method: string, handler: (...args: unknown[]) => void): void;
  off(method: string, handler: (...args: unknown[]) => void): void;
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  send(method: string, ...args: unknown[]): Promise<void>;
  onreconnecting(callback: (error?: Error) => void): void;
  onreconnected(callback: (connectionId?: string) => void): void;
  onclose(callback: (error?: Error) => void): void;
}

export interface ConnectionFactoryOptions {
  url: string;
  /** Called by the transport on every negotiate and reconnect. */
  accessTokenFactory: () => Promise<string>;
  /** Delay before reconnect attempt `previousRetryCount + 1`. */
  nextRetryDelayMs: (previousRetryCount: number) => number;
}

export type ConnectionFactory = (opts: ConnectionFactoryOptions) => Promise<HubConnectionLike>;
