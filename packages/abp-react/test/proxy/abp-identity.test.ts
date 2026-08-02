import { describe, expect, it } from "vitest";
import type { Auth } from "../../src/auth";
import type { ApplicationConfiguration } from "../../src/core";
import { createLogger, createMemorySink, resolveConfig } from "../../src/logger";
import { type AbpCallRuntime, createAbpProxy } from "../../src/proxy";
import {
  createAbpIdentityResolver,
  deriveIdentity,
  loadAppState,
} from "../../src/proxy/abp-identity";

const config: ApplicationConfiguration = {
  currentUser: {
    isAuthenticated: true,
    id: "u1",
    userName: "admin",
    tenantId: null,
    email: "a@b.c",
    roles: ["admin"],
  },
  auth: { grantedPolicies: { P: true } },
  setting: { values: {} },
  localization: { currentCulture: { name: "en" }, languages: [], values: {} },
  currentTenant: { id: "t1", name: "T1", isAvailable: true },
  features: { values: {} },
};

function runtime(fetchFn: typeof fetch): AbpCallRuntime {
  return {
    proxy: createAbpProxy({ baseUrl: "https://abp.example", fetchFn }),
    auth: { session: { refresh: async () => null } } as unknown as Auth,
    logger: createLogger({ scope: "test", config: resolveConfig({ LOG_LEVEL: "info" }) }),
  };
}

describe("deriveIdentity", () => {
  it("maps an authenticated config to a full identity", () => {
    expect(deriveIdentity(config)).toEqual({
      isAuthenticated: true,
      user: { id: "u1", userName: "admin", email: "a@b.c", roles: ["admin"] },
      grantedPolicies: { P: true },
      tenant: { id: "t1", name: "T1" },
    });
  });

  it("maps an anonymous config to a null user (identity still carries policies)", () => {
    const anon = {
      ...config,
      currentUser: { ...config.currentUser, isAuthenticated: false, id: null, userName: null },
      currentTenant: { id: null, name: null, isAvailable: true },
    };
    expect(deriveIdentity(anon)).toEqual({
      isAuthenticated: false,
      user: null,
      grantedPolicies: { P: true },
      tenant: null,
    });
  });
});

describe("deriveIdentity shape drift", () => {
  const drifted: ApplicationConfiguration = {
    ...config,
    currentUser: { ...config.currentUser, isAuthenticated: true, id: null },
  };

  it("treats an authenticated user without an id as anonymous instead of inventing an empty one", () => {
    const identity = deriveIdentity(drifted);
    expect(identity.isAuthenticated).toBe(false);
    expect(identity.user).toBeNull();
    expect(identity.grantedPolicies).toEqual({ P: true });
  });

  it("warns about the drift when a logger is given", () => {
    const { sink, records } = createMemorySink();
    const logger = createLogger({
      scope: "test",
      config: resolveConfig({ LOG_LEVEL: "info" }),
      sink,
    });
    deriveIdentity(drifted, { logger });
    expect(records.some((r) => r.level === "warn")).toBe(true);
  });
});

describe("createAbpIdentityResolver", () => {
  it("forwards the request cookie context so an anonymous visitor's tenant is honored", async () => {
    const sent: Headers[] = [];
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers));
      return Response.json(config);
    }) as typeof fetch;
    const resolve = createAbpIdentityResolver(() => runtime(fetchFn));
    await resolve(null, { cookieHeader: "__tenant=t2" });
    expect(sent[0]?.get("__tenant")).toBe("t2");
  });
});

describe("loadAppState", () => {
  it("feeds config and identity from one application-configuration fetch", async () => {
    const fetchFn = (async () => Response.json(config)) as typeof fetch;
    const state = await loadAppState(runtime(fetchFn), null, null);
    expect(state.config.currentUser.userName).toBe("admin");
    expect(state.identity.user?.userName).toBe("admin");
    expect(state.setCookies).toEqual([]);
  });

  it("throws a status-bearing error (not a SyntaxError) on 200 with a non-JSON body, and warns", async () => {
    const fetchFn = (async () =>
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const { sink, records } = createMemorySink();
    const rt: AbpCallRuntime = {
      ...runtime(fetchFn),
      logger: createLogger({ scope: "test", config: resolveConfig({ LOG_LEVEL: "info" }), sink }),
    };
    await expect(loadAppState(rt, null, null)).rejects.toMatchObject({ status: 200 });
    expect(records.some((r) => r.level === "warn")).toBe(true);
  });

  it("throws a status-bearing error on 4xx/5xx", async () => {
    const fetchFn = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    // GET 幂等重试后仍 503 → 抛带 status 的错误
    await expect(loadAppState(runtime(fetchFn), null, null)).rejects.toMatchObject({ status: 503 });
  });
});
