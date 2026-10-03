import { describe, expect, it, vi } from "vitest";
import { createTokenSource } from "../../src/realtime/token-source";
import type { HubConnectionInfo } from "../../src/realtime/types";

const info = (token: string, expiresAt: number | null): HubConnectionInfo => ({
  url: "https://abp.example/signalr-hubs/notifications",
  accessToken: token,
  expiresAt,
});

describe("createTokenSource", () => {
  it("reuses a token until 60s before it expires, then fetches a fresh one", async () => {
    let clock = 0;
    const get = vi
      .fn()
      .mockResolvedValueOnce(info("t1", 120_000))
      .mockResolvedValueOnce(info("t2", 300_000));
    const source = createTokenSource("notifications", get, { now: () => clock });

    expect(await source.token()).toBe("t1");
    clock = 59_999;
    expect(await source.token()).toBe("t1");
    clock = 60_000;
    expect(await source.token()).toBe("t2");
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith("notifications");
  });

  it("does not cache a token whose lifetime is unknown", async () => {
    const get = vi.fn().mockResolvedValue(info("t", null));
    const source = createTokenSource("notifications", get);
    await source.token();
    await source.token();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent fetches into one server call", async () => {
    const get = vi.fn().mockResolvedValue(info("t", Date.now() + 3_600_000));
    const source = createTokenSource("notifications", get);
    await Promise.all([source.token(), source.token(), source.info()]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("fetches again after invalidate", async () => {
    const get = vi.fn().mockResolvedValue(info("t", Date.now() + 3_600_000));
    const source = createTokenSource("notifications", get);
    await source.token();
    source.invalidate();
    await source.token();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("reports an anonymous visitor as null info and a rejected token", async () => {
    const source = createTokenSource("notifications", vi.fn().mockResolvedValue(null));
    expect(await source.info()).toBeNull();
    await expect(source.token()).rejects.toThrow(/not signed in/);
  });

  it("invalidate wins over a token fetch already in flight", async () => {
    let resolveFirstFetch: ((value: HubConnectionInfo) => void) | undefined;
    const firstFetch = new Promise<HubConnectionInfo>((resolve) => {
      resolveFirstFetch = resolve;
    });
    const get = vi.fn();
    get.mockReturnValueOnce(firstFetch);
    get.mockResolvedValueOnce(info("fresh", Date.now() + 3_600_000));

    const source = createTokenSource("notifications", get);

    const firstToken = source.token();
    source.invalidate();
    const secondToken = source.token();

    expect(await secondToken).toBe("fresh");
    resolveFirstFetch?.(info("stale", Date.now() + 3_600_000));
    await firstToken;

    expect(await source.token()).toBe("fresh");
    expect(get).toHaveBeenCalledTimes(2);
  });
});
