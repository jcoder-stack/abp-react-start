// @vitest-environment jsdom
import {
  type ConnectionFactory,
  type HubConnectionLike,
  RealtimeProvider,
} from "@jcoder-stack/abp-react/realtime";
import { useRouterState } from "@tanstack/react-router";
import { act, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import signalr from "@/features/signalr/feature";
import { NotificationToaster } from "@/features/signalr/notifications";
import notificationsMessages from "@/features/signalr/notifications-messages.json";
import { getHubConnectionInfoFn } from "@/features/signalr/server-fns";
import { admin, anonymous, makeConfig, renderWithProviders } from "./test-utils";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("@/features/signalr/server-fns", () => ({
  getHubConnectionInfoFn: vi.fn(async () => null),
}));

type Handler = (...args: unknown[]) => void;

class FakeConnection implements HubConnectionLike {
  readonly handlers = new Map<string, Set<Handler>>();
  async start() {}
  async stop() {}
  on(method: string, handler: Handler) {
    const set = this.handlers.get(method) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(method, set);
  }
  off(method: string, handler: Handler) {
    this.handlers.get(method)?.delete(handler);
  }
  invoke<T = unknown>(): Promise<T> {
    return Promise.resolve(undefined as T);
  }
  async send() {}
  onreconnecting() {}
  onreconnected() {}
  onclose() {}
  emit(method: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(method) ?? []) handler(...args);
  }
}

function Location() {
  return <output>{useRouterState({ select: (s) => s.location.href })}</output>;
}

async function mount() {
  const connections: FakeConnection[] = [];
  const factory: ConnectionFactory = async () => {
    const connection = new FakeConnection();
    connections.push(connection);
    return connection;
  };
  renderWithProviders(
    <RealtimeProvider
      getConnectionInfo={async (hub) => ({
        url: `https://abp.example/signalr-hubs/${hub}`,
        accessToken: "t",
        expiresAt: null,
      })}
      connectionFactory={factory}
    >
      <NotificationToaster />
      <Location />
    </RealtimeProvider>,
    {
      messages: notificationsMessages,
      config: makeConfig({
        localization: {
          currentCulture: { name: "en" },
          languages: [{ cultureName: "en", displayName: "English" }],
          values: { MyProject: { "Approvals:NewRequest": "New request from {name}" } },
        },
      }),
    },
  );
  await waitFor(() => expect(connections[0]?.handlers.get("ReceiveNotification")?.size).toBe(1));
  const connection = connections[0];
  if (connection === undefined) throw new Error("no connection");
  return connection;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("NotificationToaster", () => {
  it("shows a localized toast at the notification's severity with a working View action", async () => {
    const connection = await mount();
    act(() =>
      connection.emit("ReceiveNotification", {
        id: "n1",
        severity: "warning",
        title: { key: "Approvals:NewRequest", resource: "MyProject", args: { name: "Alice" } },
        message: "Please review",
        url: "/approvals/7",
      }),
    );

    expect(toast.warning).toHaveBeenCalledWith(
      "New request from Alice",
      expect.objectContaining({
        id: "n1",
        description: "Please review",
        action: expect.objectContaining({ label: "View" }),
      }),
    );
    const action = vi.mocked(toast.warning).mock.calls[0]?.[1]?.action as
      | { onClick: () => void }
      | undefined;
    act(() => action?.onClick());
    expect(await screen.findByText("/approvals/7")).toBeTruthy();
  });

  it("shows no View action when the url was unsafe", async () => {
    const connection = await mount();
    act(() =>
      connection.emit("ReceiveNotification", { id: "n2", title: "Hi", url: "//evil.example" }),
    );
    expect(toast.info).toHaveBeenCalledWith("Hi", expect.objectContaining({ action: undefined }));
  });

  it("ignores a malformed payload", async () => {
    const connection = await mount();
    act(() => connection.emit("ReceiveNotification", { title: "no id" }));
    for (const show of [toast.info, toast.success, toast.warning, toast.error]) {
      expect(show).not.toHaveBeenCalled();
    }
  });
});

describe("the signalr feature", () => {
  const { Provider } = signalr;
  if (Provider === undefined) throw new Error("the signalr feature has no Provider");

  it("asks for no notification connection on an anonymous visit", async () => {
    renderWithProviders(<Provider>page</Provider>, {
      identity: anonymous,
      messages: notificationsMessages,
    });
    await act(async () => {});
    expect(getHubConnectionInfoFn).not.toHaveBeenCalled();
  });

  it("connects the notifications hub for a signed-in user", async () => {
    renderWithProviders(<Provider>page</Provider>, {
      identity: admin,
      messages: notificationsMessages,
    });
    await waitFor(() =>
      expect(getHubConnectionInfoFn).toHaveBeenCalledWith({ data: { hub: "notifications" } }),
    );
  });
});
