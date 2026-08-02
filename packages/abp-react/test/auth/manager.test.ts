import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../../src/auth/create-auth";
import { createSessionManager } from "../../src/auth/manager";
import type { AuthSession, SessionStore } from "../../src/auth/types";
import { createLogger, createMemorySink, resolveConfig } from "../../src/logger";

function memoryStore(): SessionStore & { saved: AuthSession[] } {
  let current: AuthSession | null = null;
  const saved: AuthSession[] = [];
  return {
    saved,
    load: async () => current,
    save: async (session) => {
      current = session;
      saved.push(session);
      return ["Set-Cookie-1"];
    },
    clear: async () => ["Cleared-1"],
  };
}

const baseSession: AuthSession = {
  tokens: { accessToken: "old-at", refreshToken: "rt-1" },
  expiresAt: 100_000,
  tenant: "t1",
  culture: "zh-Hans",
};

describe("createSessionManager", () => {
  it("establish stores tenant/culture context alongside the token result", async () => {
    const store = memoryStore();
    const manager = createSessionManager({ store, refreshGrant: vi.fn() });
    await manager.establish(
      { tokens: { accessToken: "at" }, expiresAt: 1 },
      { tenant: "t1", culture: "en" },
    );
    expect(store.saved[0]).toEqual({
      tokens: { accessToken: "at" },
      expiresAt: 1,
      tenant: "t1",
      culture: "en",
    });
  });

  it("isExpired honours the 60s skew and treats missing expiry as never expired", () => {
    // 契约：now >= expiresAt - 60_000 视为过期；now = 41_000。
    const manager = createSessionManager({
      store: memoryStore(),
      refreshGrant: vi.fn(),
      now: () => 41_000,
    });
    const at = (expiresAt?: number) =>
      manager.isExpired({ tokens: { accessToken: "a" }, expiresAt });
    expect(at(200_000)).toBe(false);
    expect(at(101_001)).toBe(false);
    expect(at(101_000)).toBe(true);
    expect(at(90_000)).toBe(true);
    expect(at(undefined)).toBe(false);
  });

  it("refresh swaps tokens, preserves the old refresh token and tenant/culture, and re-seals", async () => {
    const store = memoryStore();
    const manager = createSessionManager({
      store,
      refreshGrant: async () => ({ accessToken: "new-at", expiresIn: 60 }),
      now: () => 1_000,
    });
    const result = await manager.refresh(baseSession);
    expect(result?.session).toEqual({
      tokens: { accessToken: "new-at", refreshToken: "rt-1", idToken: undefined },
      expiresAt: 61_000,
      tenant: "t1",
      culture: "zh-Hans",
    });
    expect(result?.setCookies).toEqual(["Set-Cookie-1"]);
  });

  // IdP 回同一个 refresh token 时不算轮换；把它记成轮换会让排查「到底转没转」时被日志带偏。
  it("logs rotation only when the refresh token actually changed", async () => {
    const rotatedFor = async (refreshToken?: string) => {
      const { sink, records } = createMemorySink();
      const manager = createSessionManager({
        store: memoryStore(),
        refreshGrant: async () => ({ accessToken: "new-at", refreshToken }),
        logger: createLogger({
          scope: "auth",
          sink,
          config: resolveConfig({ LOG_LEVEL: "debug" }),
        }),
      });
      await manager.refresh(baseSession);
      return records.find((r) => r.message === "session refreshed")?.fields?.rotated;
    };
    expect(await rotatedFor("rt-1")).toBe(false);
    expect(await rotatedFor(undefined)).toBe(false);
    expect(await rotatedFor("rt-2")).toBe(true);
  });

  it("refresh returns null without a refresh token and null (not throw) on failure", async () => {
    const failing = createSessionManager({
      store: memoryStore(),
      refreshGrant: async () => {
        throw new Error("idp down");
      },
    });
    expect(await failing.refresh({ tokens: { accessToken: "a" } })).toBeNull();
    expect(await failing.refresh(baseSession)).toBeNull();
  });

  it("coalesces concurrent refreshes of the same refresh token into one grant call", async () => {
    const refreshGrant = vi.fn(async () => ({ accessToken: "new-at" }));
    const manager = createSessionManager({ store: memoryStore(), refreshGrant, now: () => 0 });
    await Promise.all([manager.refresh(baseSession), manager.refresh(baseSession)]);
    expect(refreshGrant).toHaveBeenCalledTimes(1);
  });

  it("does not poison the coalescer with a failed refresh", async () => {
    const refreshGrant = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ accessToken: "new-at" });
    const manager = createSessionManager({ store: memoryStore(), refreshGrant, now: () => 0 });
    expect(await manager.refresh(baseSession)).toBeNull();
    expect((await manager.refresh(baseSession))?.session.tokens.accessToken).toBe("new-at");
  });

  // serverless 上响应一返回实例即被冻结，fire-and-forget 的撤销可能根本没发出去，
  // 于是 refresh token 在 IdP 侧活到自然过期，所以这里必须 await。
  it("destroy awaits the revocation before returning", async () => {
    let revoked = false;
    const revoke = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      revoked = true;
    });
    const store = memoryStore();
    await store.save(baseSession);
    const manager = createSessionManager({ store, refreshGrant: vi.fn(), revoke });
    const destroying = manager.destroy("any");
    expect(revoked).toBe(false);
    expect(await destroying).toEqual(["Cleared-1"]);
    expect(revoke).toHaveBeenCalledWith("rt-1");
    expect(revoked).toBe(true);
  });

  it("destroy survives a throwing revoke and warns", async () => {
    const store = memoryStore();
    await store.save(baseSession);
    const { sink, records } = createMemorySink();
    const manager = createSessionManager({
      store,
      refreshGrant: vi.fn(),
      revoke: async () => {
        throw new Error("idp down");
      },
      logger: createLogger({ scope: "auth", sink }),
    });
    expect(await manager.destroy("any")).toEqual(["Cleared-1"]);
    expect(
      records.some((r) => r.level === "warn" && /idp down/.test(String(r.fields?.error))),
    ).toBe(true);
  });

  it("destroy gives up on a hanging revoke after revokeTimeoutMs and warns", async () => {
    const store = memoryStore();
    await store.save(baseSession);
    const { sink, records } = createMemorySink();
    const manager = createSessionManager({
      store,
      refreshGrant: vi.fn(),
      revoke: () => new Promise<void>(() => {}),
      revokeTimeoutMs: 10,
      logger: createLogger({ scope: "auth", sink }),
    });
    expect(await manager.destroy("any")).toEqual(["Cleared-1"]);
    expect(
      records.some((r) => r.level === "warn" && /timed out/.test(String(r.fields?.error))),
    ).toBe(true);
  });
});

const anonymousResolver = async () => ({
  isAuthenticated: false,
  user: null,
  grantedPolicies: {},
  tenant: null,
});

describe("createAuth", () => {
  it("resolves strategies by name and throws on unknown", () => {
    const auth = createAuth({
      strategies: [{ name: "oidc", complete: async () => ({ tokens: { accessToken: "a" } }) }],
      store: memoryStore(),
      resolveIdentity: anonymousResolver,
      refreshGrant: vi.fn(),
    });
    expect(auth.strategy("oidc").name).toBe("oidc");
    expect(() => auth.strategy("github")).toThrow(/unknown auth strategy/);
  });

  it("identity delegates to the resolver with the given session", async () => {
    const resolveIdentity = vi.fn(async () => ({
      isAuthenticated: true,
      user: { id: "1", userName: "admin", roles: [] },
      grantedPolicies: { P: true },
      tenant: null,
    }));
    const auth = createAuth({
      strategies: [],
      store: memoryStore(),
      resolveIdentity,
      refreshGrant: vi.fn(),
    });
    const identity = await auth.identity(baseSession, { cookieHeader: "__tenant=t2" });
    expect(resolveIdentity).toHaveBeenCalledWith(baseSession, { cookieHeader: "__tenant=t2" });
    expect(identity.isAuthenticated).toBe(true);
  });

  it("identity falls back to an empty request context when none is given", async () => {
    const resolveIdentity = vi.fn(async () => ({
      isAuthenticated: false,
      user: null,
      grantedPolicies: {},
      tenant: null,
    }));
    const auth = createAuth({
      strategies: [],
      store: memoryStore(),
      resolveIdentity,
      refreshGrant: vi.fn(),
    });
    await auth.identity(null);
    expect(resolveIdentity).toHaveBeenCalledWith(null, { cookieHeader: null });
  });

  it("passes skewSeconds through to the session engine", () => {
    const auth = createAuth({
      strategies: [],
      store: memoryStore(),
      resolveIdentity: anonymousResolver,
      refreshGrant: vi.fn(),
      now: () => 41_000,
      skewSeconds: 5,
    });
    // 默认 60s skew 下这个会话已算过期；5s skew 下还没到。
    expect(auth.session.isExpired({ tokens: { accessToken: "a" }, expiresAt: 50_000 })).toBe(false);
    expect(auth.session.isExpired({ tokens: { accessToken: "a" }, expiresAt: 46_000 })).toBe(true);
  });

  it("passes coalesceTtlMs through to the session engine", async () => {
    const refreshGrant = vi.fn(async () => ({ accessToken: "new-at" }));
    const auth = createAuth({
      strategies: [],
      store: memoryStore(),
      resolveIdentity: anonymousResolver,
      refreshGrant,
      now: () => 0,
      coalesceTtlMs: 0,
    });
    await Promise.all([auth.session.refresh(baseSession), auth.session.refresh(baseSession)]);
    expect(refreshGrant).toHaveBeenCalledTimes(2);
  });
});
