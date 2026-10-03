import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, createMemorySink } from "../../src/logger";
import { createRealtimeClient } from "../../src/realtime/client";
import type {
  ConnectionFactory,
  ConnectionFactoryOptions,
  GetConnectionInfo,
  HubConnectionLike,
} from "../../src/realtime/types";
import type { UnavailableStore } from "../../src/realtime/unavailable";

type Handler = (...args: unknown[]) => void;

class FakeConnection implements HubConnectionLike {
  readonly handlers = new Map<string, Set<Handler>>();
  readonly calls: unknown[][] = [];
  startImpl: () => Promise<void> = async () => {};
  stopped = false;
  private reconnecting: () => void = () => {};
  private reconnected: () => void = () => {};

  start() {
    return this.startImpl();
  }
  async stop() {
    this.stopped = true;
  }
  on(method: string, handler: Handler) {
    let set = this.handlers.get(method);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(method, set);
    }
    set.add(handler);
  }
  off(method: string, handler: Handler) {
    this.handlers.get(method)?.delete(handler);
  }
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    this.calls.push([method, ...args]);
    return Promise.resolve("ok" as T);
  }
  async send(method: string, ...args: unknown[]) {
    this.calls.push([method, ...args]);
  }
  onreconnecting(callback: () => void) {
    this.reconnecting = callback;
  }
  onreconnected(callback: () => void) {
    this.reconnected = callback;
  }
  onclose() {}
  emit(method: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(method) ?? []) handler(...args);
  }
  dropAndRecover() {
    this.reconnecting();
    return () => this.reconnected();
  }
}

/** Every connection the factory built, in order; `starts[i]` scripts the i-th connection's start(). */
function fakeFactory(starts: (() => Promise<void>)[] = []) {
  const connections: FakeConnection[] = [];
  const options: ConnectionFactoryOptions[] = [];
  const factory: ConnectionFactory = async (opts) => {
    const connection = new FakeConnection();
    const scripted = starts[connections.length];
    if (scripted !== undefined) connection.startImpl = scripted;
    options.push(opts);
    connections.push(connection);
    return connection;
  };
  return { factory, connections, options };
}

function memoryStore(): UnavailableStore & { marked: Set<string> } {
  const marked = new Set<string>();
  return { marked, has: (hub) => marked.has(hub), mark: (hub) => void marked.add(hub) };
}

const signedIn: GetConnectionInfo = async (hub) => ({
  url: `https://abp.example/signalr-hubs/${hub}`,
  accessToken: "token",
  expiresAt: null,
});

const statusError = (status: number) =>
  new Error(`Failed to complete negotiation with the server: Error: X: Status code '${status}'`);

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createRealtimeClient", () => {
  it("shares one connection per hub and delivers events to every subscriber", async () => {
    const { factory, connections } = fakeFactory();
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    const a = vi.fn();
    const b = vi.fn();
    client.on("dashboard", "Changed", a);
    client.on("dashboard", "Changed", b);
    await flush();

    expect(connections).toHaveLength(1);
    expect(client.getState("dashboard")).toBe("connected");
    connections[0]?.emit("Changed", 42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it("keeps the connection through a quick unsubscribe/resubscribe and closes it 5s after the last one leaves", async () => {
    const { factory, connections } = fakeFactory();
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    const off = client.on("dashboard", "Changed", vi.fn());
    await flush();
    off();
    await vi.advanceTimersByTimeAsync(4_999);
    const offAgain = client.on("dashboard", "Changed", vi.fn());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.stopped).toBe(false);

    offAgain();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(connections[0]?.stopped).toBe(true);
    expect(client.getState("dashboard")).toBe("idle");
  });

  it("never connects for an anonymous visitor", async () => {
    const { factory, connections } = fakeFactory();
    const client = createRealtimeClient({
      getConnectionInfo: async () => null,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    client.on("notifications", "ReceiveNotification", vi.fn());
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connections).toHaveLength(0);
    expect(client.getState("notifications")).toBe("idle");
  });

  it("gives up quietly on a 404 hub and remembers it for later clients in the tab", async () => {
    const store = memoryStore();
    const { factory, connections } = fakeFactory([() => Promise.reject(statusError(404))]);
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: store,
    });
    client.on("notifications", "ReceiveNotification", vi.fn());
    await vi.advanceTimersByTimeAsync(600_000);

    expect(connections).toHaveLength(1);
    expect(client.getState("notifications")).toBe("unavailable");
    expect(store.marked.has("notifications")).toBe(true);

    const later = fakeFactory();
    const next = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: later.factory,
      unavailable: store,
    });
    next.on("notifications", "ReceiveNotification", vi.fn());
    await flush();
    expect(later.connections).toHaveLength(0);
    expect(next.getState("notifications")).toBe("unavailable");
  });

  it("refetches the token once after a 401 and stops after a second one", async () => {
    const getConnectionInfo = vi.fn(signedIn);
    const { factory, connections } = fakeFactory([
      () => Promise.reject(statusError(401)),
      () => Promise.reject(statusError(401)),
    ]);
    const client = createRealtimeClient({
      getConnectionInfo,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    client.on("notifications", "ReceiveNotification", vi.fn());
    await vi.advanceTimersByTimeAsync(600_000);

    expect(connections).toHaveLength(2);
    expect(getConnectionInfo).toHaveBeenCalledTimes(2);
    expect(client.getState("notifications")).toBe("disconnected");
  });

  it("retries a failing first connect on the backoff schedule until it succeeds", async () => {
    const down = () => Promise.reject(new Error("Failed to fetch"));
    const { factory, connections } = fakeFactory([down, down, down]);
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    client.on("dashboard", "Changed", vi.fn());

    await flush(); // attempt 1 fails, waits 0ms
    await flush(); // attempt 2 fails, waits 2s
    expect(connections).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(connections).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); // attempt 3 fails, waits 5s
    await vi.advanceTimersByTimeAsync(5_000); // attempt 4 succeeds
    expect(connections).toHaveLength(4);
    expect(client.getState("dashboard")).toBe("connected");
  });

  it("hands the transport the same backoff for reconnects", async () => {
    const { factory, options } = fakeFactory();
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    client.on("dashboard", "Changed", vi.fn());
    await flush();
    expect(options[0]?.nextRetryDelayMs(1)).toBe(2_000);
    expect(options[0]?.nextRetryDelayMs(9)).toBe(60_000);
    expect(options[0]?.url).toBe("https://abp.example/signalr-hubs/dashboard");
    await expect(options[0]?.accessTokenFactory()).resolves.toBe("token");
  });

  it("reports reconnecting and connected to state subscribers", async () => {
    const { factory, connections } = fakeFactory();
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    const seen: string[] = [];
    client.subscribeState("chat", () => seen.push(client.getState("chat")));
    client.retain("chat");
    await flush();
    const recover = connections[0]?.dropAndRecover();
    recover?.();
    expect(seen).toEqual(["connecting", "connected", "reconnecting", "connected"]);
  });

  it("keeps delivering to other handlers when one throws, and logs the failure", async () => {
    const { factory, connections } = fakeFactory();
    const { sink, records } = createMemorySink();
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
      logger: createLogger({ scope: "realtime", sink }),
    });
    const after = vi.fn();
    client.on("dashboard", "Changed", () => {
      throw new Error("boom");
    });
    client.on("dashboard", "Changed", after);
    await flush();
    connections[0]?.emit("Changed");
    expect(after).toHaveBeenCalledOnce();
    expect(records.map((r) => r.message)).toContain("hub event handler threw");
  });

  it("forwards invoke and send only while connected", async () => {
    const { factory, connections } = fakeFactory();
    const client = createRealtimeClient({
      getConnectionInfo: signedIn,
      connectionFactory: factory,
      unavailable: memoryStore(),
    });
    await expect(client.invoke("chat", "SendMessage", "hi")).rejects.toThrow(/not connected/);
    client.retain("chat");
    await flush();
    await expect(client.invoke("chat", "SendMessage", "hi")).resolves.toBe("ok");
    await client.send("chat", "Typing");
    expect(connections[0]?.calls).toEqual([["SendMessage", "hi"], ["Typing"]]);
  });

  it("rejects an invalid hub name immediately instead of retrying", () => {
    const getConnectionInfo = vi.fn(signedIn);
    const client = createRealtimeClient({ getConnectionInfo, unavailable: memoryStore() });
    expect(() => client.on("Chat", "MessageReceived", vi.fn())).toThrow(/lowercase letters/);
    expect(() => client.retain("my_hub")).toThrow(/lowercase letters/);
    expect(getConnectionInfo).not.toHaveBeenCalled();
  });
});
