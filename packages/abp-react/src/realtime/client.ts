import { createLogger, type Logger } from "../logger";
import {
  assertHubName,
  classifyStartError,
  nextReconnectDelay,
  RECONNECT_DELAYS_MS,
} from "./policy";
import { signalRConnectionFactory } from "./signalr-factory";
import { createTokenSource, type TokenSource } from "./token-source";
import type { ConnectionFactory, GetConnectionInfo, HubConnectionLike, HubState } from "./types";
import { sessionUnavailableStore, type UnavailableStore } from "./unavailable";

type Handler = (...args: unknown[]) => void;

export interface RealtimeClient {
  /** Subscribes to a hub method, connecting the hub if needed; the returned function unsubscribes. */
  on(hub: string, method: string, handler: Handler): () => void;
  /** Keeps a hub connected without listening to anything (for invoke/send); returns the release. */
  retain(hub: string): () => void;
  getState(hub: string): HubState;
  subscribeState(hub: string, listener: () => void): () => void;
  /** Rejects unless the hub is connected. */
  invoke<T = unknown>(hub: string, method: string, ...args: unknown[]): Promise<T>;
  send(hub: string, method: string, ...args: unknown[]): Promise<void>;
}

export interface RealtimeClientOptions {
  getConnectionInfo: GetConnectionInfo;
  connectionFactory?: ConnectionFactory;
  logger?: Logger;
  unavailable?: UnavailableStore;
  now?: () => number;
  /** How long a hub stays connected after its last subscriber leaves (default 5000 ms). */
  releaseDelayMs?: number;
}

interface HubEntry {
  readonly name: string;
  readonly tokens: TokenSource;
  readonly listeners: Set<() => void>;
  readonly handlers: Map<string, Set<Handler>>;
  readonly dispatchers: Map<string, Handler>;
  refs: number;
  state: HubState;
  /** True while a connect loop is running or a connection is up. */
  running: boolean;
  /**
   * Set once a fresh token was rejected or the hub refused the user (403); the hub stays down for
   * the page instead of retrying on every navigation.
   */
  rejected: boolean;
  /** Bumped by every stop; a connect loop holding an older value has been superseded. */
  generation: number;
  /** The connection our dispatchers are registered on, started or not. */
  attached: HubConnectionLike | null;
  connected: HubConnectionLike | null;
  releaseTimer: ReturnType<typeof setTimeout> | undefined;
  cancelWait: (() => void) | undefined;
}

/** Route changes unmount and remount subscribers within milliseconds; closing at once would reconnect on every navigation. */
const DEFAULT_RELEASE_DELAY_MS = 5_000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One SignalR connection per hub per tab, shared by reference count. Connecting is lazy (first
 * subscriber) and nothing happens at construction, so it is safe to create during SSR. The initial
 * connect gives up once the backoff schedule is exhausted; reconnects after a successful start never do.
 */
export function createRealtimeClient(opts: RealtimeClientOptions): RealtimeClient {
  const factory = opts.connectionFactory ?? signalRConnectionFactory;
  const logger = opts.logger ?? createLogger({ scope: "realtime" });
  const unavailable = opts.unavailable ?? sessionUnavailableStore();
  const releaseDelayMs = opts.releaseDelayMs ?? DEFAULT_RELEASE_DELAY_MS;
  const entries = new Map<string, HubEntry>();

  function entryOf(hub: string): HubEntry {
    const existing = entries.get(hub);
    if (existing !== undefined) return existing;
    const entry: HubEntry = {
      name: hub,
      tokens: createTokenSource(hub, opts.getConnectionInfo, { now: opts.now }),
      listeners: new Set(),
      handlers: new Map(),
      dispatchers: new Map(),
      refs: 0,
      state: "idle",
      running: false,
      rejected: false,
      generation: 0,
      attached: null,
      connected: null,
      releaseTimer: undefined,
      cancelWait: undefined,
    };
    entries.set(hub, entry);
    return entry;
  }

  function setState(entry: HubEntry, state: HubState): void {
    if (entry.state === state) return;
    entry.state = state;
    for (const listener of entry.listeners) listener();
  }

  function settle(entry: HubEntry, state: HubState): void {
    entry.running = false;
    setState(entry, state);
  }

  function safeStop(connection: HubConnectionLike, hub: string): void {
    connection.stop().catch((error: unknown) => {
      logger.debug("hub stop failed", { hub, error: messageOf(error) });
    });
  }

  function wait(entry: HubEntry, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        entry.cancelWait = undefined;
        resolve();
      }, ms);
      entry.cancelWait = () => {
        clearTimeout(timer);
        entry.cancelWait = undefined;
        resolve();
      };
    });
  }

  function attach(entry: HubEntry, connection: HubConnectionLike): void {
    entry.attached = connection;
    for (const [method, dispatcher] of entry.dispatchers) connection.on(method, dispatcher);
    connection.onreconnecting(() => {
      if (entry.connected === connection) setState(entry, "reconnecting");
    });
    connection.onreconnected(() => {
      if (entry.connected === connection) setState(entry, "connected");
    });
    connection.onclose(() => {
      if (entry.connected !== connection) return;
      entry.connected = null;
      entry.attached = null;
      settle(entry, "disconnected");
    });
  }

  async function connect(entry: HubEntry): Promise<void> {
    const generation = entry.generation;
    const superseded = () => generation !== entry.generation;
    if (unavailable.has(entry.name)) return settle(entry, "unavailable");
    if (entry.rejected) return settle(entry, "disconnected");
    setState(entry, "connecting");
    let retriedUnauthorized = false;
    for (let attempt = 0; ; attempt++) {
      let connection: HubConnectionLike | null = null;
      try {
        const info = await entry.tokens.info();
        if (superseded()) return;
        if (info === null) return settle(entry, "idle");
        connection = await factory({
          url: info.url,
          accessTokenFactory: entry.tokens.token,
          nextRetryDelayMs: nextReconnectDelay,
        });
        if (superseded()) return safeStop(connection, entry.name);
        attach(entry, connection);
        await connection.start();
        if (superseded()) return safeStop(connection, entry.name);
        entry.connected = connection;
        setState(entry, "connected");
        return;
      } catch (error) {
        if (superseded()) return;
        if (connection !== null && entry.attached === connection) entry.attached = null;
        const failure = classifyStartError(error);
        if (failure === "not-found") {
          unavailable.mark(entry.name);
          logger.debug("hub not found on the backend; staying offline for this tab", {
            hub: entry.name,
          });
          return settle(entry, "unavailable");
        }
        if (failure === "unauthorized" && !retriedUnauthorized) {
          retriedUnauthorized = true;
          entry.tokens.invalidate();
          continue;
        }
        if (failure === "unauthorized" || failure === "forbidden") {
          entry.rejected = true;
          logger.debug("hub refused the user; giving up for this page", {
            hub: entry.name,
            failure,
          });
          return settle(entry, "disconnected");
        }
        if (attempt >= RECONNECT_DELAYS_MS.length) {
          // Not sticky: the next subscriber (usually the next page) starts a fresh run, so a fixed backend needs no reload.
          logger.warn("hub could not be reached; giving up until a new subscriber", {
            hub: entry.name,
            error: messageOf(error),
          });
          return settle(entry, "disconnected");
        }
        logger.debug("hub connection failed; retrying", {
          hub: entry.name,
          attempt,
          error: messageOf(error),
        });
        await wait(entry, nextReconnectDelay(attempt));
        if (superseded()) return;
      }
    }
  }

  function stop(entry: HubEntry): void {
    entry.generation++;
    entry.cancelWait?.();
    const connection = entry.attached;
    entry.attached = null;
    entry.connected = null;
    if (connection !== null) safeStop(connection, entry.name);
    settle(entry, entry.state === "unavailable" ? "unavailable" : "idle");
  }

  function retain(hub: string): () => void {
    assertHubName(hub);
    const entry = entryOf(hub);
    entry.refs++;
    if (entry.releaseTimer !== undefined) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = undefined;
    }
    if (!entry.running) {
      entry.running = true;
      void connect(entry);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.refs--;
      if (entry.refs > 0) return;
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = undefined;
        stop(entry);
      }, releaseDelayMs);
    };
  }

  function on(hub: string, method: string, handler: Handler): () => void {
    const release = retain(hub);
    const entry = entryOf(hub);
    let handlers = entry.handlers.get(method);
    if (handlers === undefined) {
      const set = new Set<Handler>();
      const dispatcher: Handler = (...args) => {
        for (const each of set) {
          try {
            each(...args);
          } catch (error) {
            logger.error("hub event handler threw", { hub, method, error: messageOf(error) });
          }
        }
      };
      entry.handlers.set(method, set);
      entry.dispatchers.set(method, dispatcher);
      entry.attached?.on(method, dispatcher);
      handlers = set;
    }
    // A wrapper per subscription: the same function subscribed twice must not be one Set member.
    const subscription: Handler = (...args) => handler(...args);
    handlers.add(subscription);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const current = entry.handlers.get(method);
      current?.delete(subscription);
      if (current?.size === 0) {
        const dispatcher = entry.dispatchers.get(method);
        entry.handlers.delete(method);
        entry.dispatchers.delete(method);
        if (dispatcher !== undefined) entry.attached?.off(method, dispatcher);
      }
      release();
    };
  }

  function connectedOrThrow(hub: string): HubConnectionLike {
    const entry = entries.get(hub);
    if (entry?.connected == null || entry.state !== "connected") {
      throw new Error(`realtime hub "${hub}" is not connected`);
    }
    return entry.connected;
  }

  return {
    on,
    retain,
    getState: (hub) => entries.get(hub)?.state ?? "idle",
    subscribeState: (hub, listener) => {
      const entry = entryOf(hub);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    invoke: async <T = unknown>(hub: string, method: string, ...args: unknown[]) =>
      connectedOrThrow(hub).invoke<T>(method, ...args),
    send: async (hub, method, ...args) => connectedOrThrow(hub).send(method, ...args),
  };
}
