import { describe, expect, it, vi } from "vitest";
import { hubConnectionInfo, hubInputSchema } from "@/features/signalr/hub-connection-info";
import { serveHubConnectionInfo } from "@/features/signalr/server-fns";

// The server-only modules need the Start plugin's virtual entries; the function under test takes
// everything they provide as arguments.
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/auth/middleware", () => ({ authMiddleware: {} }));
vi.mock("@/auth/runtime", () => ({ getAuthRuntime: vi.fn() }));

const session = { tokens: { accessToken: "at" }, expiresAt: 1_700_000_000_000 };

describe("hubConnectionInfo", () => {
  it("hands an anonymous visitor nothing", () => {
    expect(
      hubConnectionInfo({
        session: null,
        abpBaseUrl: "https://abp.example",
        hubPrefix: undefined,
        hub: "notifications",
      }),
    ).toBeNull();
  });

  it("builds the ABP hub URL with the default prefix and passes the session token through", () => {
    expect(
      hubConnectionInfo({
        session,
        abpBaseUrl: "https://abp.example/",
        hubPrefix: undefined,
        hub: "notifications",
      }),
    ).toEqual({
      url: "https://abp.example/signalr-hubs/notifications",
      accessToken: "at",
      expiresAt: 1_700_000_000_000,
    });
  });

  it.each([
    ["/rt", "https://abp.example/rt/chat"],
    ["rt/", "https://abp.example/rt/chat"],
    ["  ", "https://abp.example/signalr-hubs/chat"],
  ])("normalizes the prefix %j", (hubPrefix, url) => {
    expect(
      hubConnectionInfo({ session, abpBaseUrl: "https://abp.example", hubPrefix, hub: "chat" })
        ?.url,
    ).toBe(url);
  });

  it("reports an unknown token lifetime as null", () => {
    expect(
      hubConnectionInfo({
        session: { tokens: { accessToken: "at" } },
        abpBaseUrl: "https://abp.example",
        hubPrefix: undefined,
        hub: "chat",
      })?.expiresAt,
    ).toBeNull();
  });
});

describe("hubInputSchema", () => {
  it("accepts ABP-style hub names", () => {
    expect(hubInputSchema.safeParse({ hub: "dashboard-2" }).success).toBe(true);
  });

  it.each(["Chat", "../admin", "a/b", "", "notifications?x=1"])("rejects %j", (hub) => {
    expect(hubInputSchema.safeParse({ hub }).success).toBe(false);
  });
});

describe("serveHubConnectionInfo", () => {
  it.each([
    ["an anonymous visitor", null],
    ["a signed-in user", session],
  ])("forbids every cache from keeping the reply to %s", (_who, current) => {
    const setHeader = vi.fn();
    serveHubConnectionInfo(setHeader, {
      session: current,
      abpBaseUrl: "https://abp.example",
      hubPrefix: undefined,
      hub: "notifications",
    });
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
});
