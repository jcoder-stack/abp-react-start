// @vitest-environment jsdom
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeProvider, useHub, useHubEvent } from "../../src/realtime/react";
import type {
  ConnectionFactory,
  GetConnectionInfo,
  HubConnectionLike,
} from "../../src/realtime/types";

type Handler = (...args: unknown[]) => void;

class FakeConnection implements HubConnectionLike {
  readonly handlers = new Map<string, Set<Handler>>();
  readonly calls: unknown[][] = [];
  stopped = false;
  async start() {}
  async stop() {
    this.stopped = true;
  }
  on(method: string, handler: Handler) {
    const set = this.handlers.get(method) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(method, set);
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
  onreconnecting() {}
  onreconnected() {}
  onclose() {}
  emit(method: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(method) ?? []) handler(...args);
  }
}

function fakeFactory() {
  const connections: FakeConnection[] = [];
  const factory: ConnectionFactory = async () => {
    const connection = new FakeConnection();
    connections.push(connection);
    return connection;
  };
  return { factory, connections };
}

const signedIn: GetConnectionInfo = async (hub) => ({
  url: `https://abp.example/signalr-hubs/${hub}`,
  accessToken: "token",
  expiresAt: null,
});

function providerFor(factory: ConnectionFactory, getConnectionInfo: GetConnectionInfo = signedIn) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RealtimeProvider getConnectionInfo={getConnectionInfo} connectionFactory={factory}>
        {children}
      </RealtimeProvider>
    );
  };
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useHubEvent", () => {
  it("calls the latest handler without resubscribing", async () => {
    const { factory, connections } = fakeFactory();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useHubEvent("dashboard", "Changed", handler), {
      initialProps: { handler: first },
      wrapper: providerFor(factory),
    });
    await flush();
    rerender({ handler: second });
    act(() => connections[0]?.emit("Changed", 7));

    expect(second).toHaveBeenCalledWith(7);
    expect(first).not.toHaveBeenCalled();
    expect(connections).toHaveLength(1);
  });

  it("stops listening on unmount and closes the hub after the release window", async () => {
    const { factory, connections } = fakeFactory();
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHubEvent("dashboard", "Changed", handler), {
      wrapper: providerFor(factory),
    });
    await flush();
    unmount();
    act(() => connections[0]?.emit("Changed"));
    expect(handler).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(connections[0]?.stopped).toBe(true);
  });
});

describe("useHub", () => {
  it("reports the hub state and forwards invoke once connected", async () => {
    const { factory, connections } = fakeFactory();
    const { result } = renderHook(() => useHub("chat"), { wrapper: providerFor(factory) });
    expect(result.current.state).toBe("connecting");
    await flush();
    expect(result.current.state).toBe("connected");

    await expect(result.current.invoke("SendMessage", "hi")).resolves.toBe("ok");
    expect(connections[0]?.calls).toEqual([["SendMessage", "hi"]]);
  });
});

describe("server rendering", () => {
  it("renders the idle state and never fetches a token or opens a connection", () => {
    const { factory, connections } = fakeFactory();
    const getConnectionInfo = vi.fn(signedIn);
    function Probe() {
      useHubEvent("notifications", "ReceiveNotification", () => {});
      return <span>{useHub("chat").state}</span>;
    }
    const html = renderToString(
      <RealtimeProvider getConnectionInfo={getConnectionInfo} connectionFactory={factory}>
        <Probe />
      </RealtimeProvider>,
    );
    expect(html).toContain("idle");
    expect(getConnectionInfo).not.toHaveBeenCalled();
    expect(connections).toHaveLength(0);
  });
});

it("tells the developer to add the provider when a hook runs outside it", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Orphan() {
    useHub("chat");
    return null;
  }
  expect(() => render(<Orphan />)).toThrow(/<RealtimeProvider>/);
});
