import { describe, expect, it } from "vitest";
import { resolveAbpAuthEnv } from "../../src/proxy/auth-env";
import { createAbpAuthRuntime } from "../../src/proxy/auth-runtime";

const ENV = {
  AUTH_ISSUER: "https://idp.example",
  AUTH_CLIENT_ID: "web",
  AUTH_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_REDIRECT_URI: "https://app.example/api/auth/callback",
  AUTH_ABP_BASE_URL: "https://abp.example",
};

describe("resolveAbpAuthEnv", () => {
  it("resolves the AUTH_* record with defaults", () => {
    const env = resolveAbpAuthEnv(ENV);
    expect(env.scope).toBe("openid profile");
    expect(env.debug).toBe(false);
    expect(resolveAbpAuthEnv({ ...ENV, AUTH_DEBUG: "true" }).debug).toBe(true);
  });

  it("rejects a session secret shorter than 32 chars", () => {
    expect(() => resolveAbpAuthEnv({ ...ENV, AUTH_SESSION_SECRET: "short" })).toThrow();
  });
});

describe("createAbpAuthRuntime strategy toggles", () => {
  it("registers both oidc and password strategies by default", () => {
    const rt = createAbpAuthRuntime(ENV);
    expect(() => rt.auth.strategy("oidc")).not.toThrow();
    expect(() => rt.auth.strategy("password")).not.toThrow();
  });

  it("omits the password strategy when disabled", () => {
    const rt = createAbpAuthRuntime(ENV, { strategies: { password: false } });
    expect(() => rt.auth.strategy("oidc")).not.toThrow();
    expect(() => rt.auth.strategy("password")).toThrow();
  });
});

describe("createAbpAuthRuntime overrides", () => {
  const anonymous = { session: null, refresh: async () => null };

  function countingFetch(status: number) {
    const calls: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(null, { status });
    }) as typeof fetch;
    return { fetchFn, calls };
  }

  it("passes the proxy retry override down to the gateway", async () => {
    const withDefaults = countingFetch(503);
    const defaultRt = createAbpAuthRuntime(ENV, { fetchFn: withDefaults.fetchFn });
    expect((await defaultRt.proxy.send({ path: "/x" }, anonymous)).status).toBe(503);
    expect(withDefaults.calls).toHaveLength(3);

    const withOverride = countingFetch(503);
    const rt = createAbpAuthRuntime(ENV, {
      fetchFn: withOverride.fetchFn,
      proxy: { retries: 0 },
    });
    expect((await rt.proxy.send({ path: "/x" }, anonymous)).status).toBe(503);
    expect(withOverride.calls).toHaveLength(1);
  });

  it("resolves identity through its own proxy (the runtime is fully wired by the time it is used)", async () => {
    const paths: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL) => {
      paths.push(new URL(String(input)).pathname);
      return Response.json({
        currentUser: {
          isAuthenticated: false,
          id: null,
          userName: null,
          tenantId: null,
          roles: [],
        },
        auth: { grantedPolicies: { P: true } },
        setting: { values: {} },
        localization: { currentCulture: { name: "en" }, languages: [], values: {} },
        currentTenant: { id: null, name: null, isAvailable: false },
        features: { values: {} },
      });
    }) as typeof fetch;
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const identity = await rt.auth.identity(null, { cookieHeader: null });
    expect(identity.grantedPolicies).toEqual({ P: true });
    expect(paths).toEqual(["/api/abp/application-configuration"]);
  });

  it("applies the session cookie secure/sameSite overrides", async () => {
    const rt = createAbpAuthRuntime(ENV, {
      cookies: { session: { secure: false, sameSite: "Strict" } },
    });
    const [cookie] = await rt.auth.session.establish({ tokens: { accessToken: "at-1" } });
    expect(cookie).not.toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });

  it("keeps secure session cookies by default", async () => {
    const rt = createAbpAuthRuntime(ENV);
    const [cookie] = await rt.auth.session.establish({ tokens: { accessToken: "at-1" } });
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });
});

describe("session tuning overrides", () => {
  it("passes skewSeconds down to the session engine", () => {
    const rt = createAbpAuthRuntime(ENV, { session: { skewSeconds: 5 }, now: () => 41_000 });
    // 默认 60s skew 下这个会话已算过期；5s skew 下还没到。
    expect(rt.auth.session.isExpired({ tokens: { accessToken: "a" }, expiresAt: 50_000 })).toBe(
      false,
    );
    expect(rt.auth.session.isExpired({ tokens: { accessToken: "a" }, expiresAt: 46_000 })).toBe(
      true,
    );
  });
});
