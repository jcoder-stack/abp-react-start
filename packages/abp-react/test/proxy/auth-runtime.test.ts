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

describe("resolveAbpAuthEnv aggregated errors", () => {
  it("names the .env variables, not the internal fields", () => {
    const bare = { AUTH_ISSUER: "", AUTH_CLIENT_ID: "" };
    const error = (() => {
      try {
        resolveAbpAuthEnv(bare);
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error).toBeInstanceOf(Error);
    if (error === null) throw new Error("unreachable");
    expect(error.message).toContain("AUTH_ISSUER (not set)");
    expect(error.message).toContain("AUTH_CLIENT_ID (not set)");
    expect(error.message).toContain("AUTH_SESSION_SECRET (not set)");
    expect(error.message).toContain(".env");
    // 内部字段名不该泄漏到用户面前
    expect(error.message).not.toContain("abpBaseUrl");
    expect(error.message).not.toContain("sessionSecret");
  });

  it("keeps the ZodError as cause and distinguishes invalid from unset", () => {
    const error = (() => {
      try {
        resolveAbpAuthEnv({ ...ENV, AUTH_ISSUER: "not-a-url" });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    if (error === null) throw new Error("unreachable");
    expect(error.message).toContain("AUTH_ISSUER");
    expect(error.message).not.toContain("AUTH_ISSUER (not set)");
    expect(error.cause).toBeDefined();
  });

  it("treats an empty AUTH_EXTRA_CA_FILE line as absent", () => {
    expect(resolveAbpAuthEnv({ ...ENV, AUTH_EXTRA_CA_FILE: "" }).extraCaFile).toBeUndefined();
    expect(resolveAbpAuthEnv({ ...ENV, AUTH_EXTRA_CA_FILE: "/tmp/x.crt" }).extraCaFile).toBe(
      "/tmp/x.crt",
    );
  });
});

describe("createAbpAuthRuntime extra CA wiring", () => {
  it("installs the CA from AUTH_EXTRA_CA_FILE before any upstream call and logs it", async () => {
    const { createLogger, createMemorySink, resolveConfig } = await import("../../src/logger");
    const { readFileSync } = await import("node:fs");
    const tls = (await import("node:tls")).default;
    const { sink, records } = createMemorySink();
    const logger = createLogger({ scope: "auth", config: resolveConfig({}), sink });
    const caFile = `${import.meta.dirname}/__fixtures__/self-signed.pem`;
    createAbpAuthRuntime({ ...ENV, AUTH_EXTRA_CA_FILE: caFile }, { logger });
    // 断言效果而不只是日志：fixture 证书必须真的进了进程默认 CA 列表
    expect(tls.getCACertificates("default")).toContain(readFileSync(caFile, "utf8"));
    const record = records.find((r) => r.message.includes("extra CA certificate trusted"));
    expect(record).toBeDefined();
  });

  it("logs the aggregated env error before rethrowing", async () => {
    const { createLogger, createMemorySink, resolveConfig } = await import("../../src/logger");
    const { sink, records } = createMemorySink();
    const logger = createLogger({ scope: "auth", config: resolveConfig({}), sink });
    expect(() => createAbpAuthRuntime({}, { logger })).toThrow(/AUTH_ISSUER/);
    const record = records.find((r) => r.message.includes("auth env resolution failed"));
    expect(record).toBeDefined();
  });
});
