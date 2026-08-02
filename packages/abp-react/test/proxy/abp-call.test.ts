import { describe, expect, it } from "vitest";
import type { Auth, AuthSession } from "../../src/auth";
import { createLogger, resolveConfig } from "../../src/logger";
import {
  type AbpCallRuntime,
  buildPolicyHeaders,
  callAbpWithSession,
} from "../../src/proxy/abp-call";
import { createAbpProxy } from "../../src/proxy/proxy";

const session: AuthSession = {
  tokens: { accessToken: "at" },
  tenant: "t-session",
  culture: "en",
};

/** callAbpWithSession 只依赖 proxy + auth.session.refresh + logger 三样；用最小结构装配。 */
function runtime(fetchFn: typeof fetch): AbpCallRuntime {
  return {
    proxy: createAbpProxy({ baseUrl: "https://abp.example", fetchFn }),
    auth: { session: { refresh: async () => null } } as unknown as Auth,
    logger: createLogger({ scope: "test", config: resolveConfig({ LOG_LEVEL: "info" }) }),
  };
}

describe("buildPolicyHeaders", () => {
  it("session tenant wins over the cookie tenant", () => {
    expect(buildPolicyHeaders(session, "__tenant=t-cookie").__tenant).toBe("t-session");
  });

  it("falls back to the cookie tenant when the session has none (bug-1 regression)", () => {
    const anon: AuthSession = { tokens: { accessToken: "at" } };
    expect(buildPolicyHeaders(anon, "__tenant=t-cookie").__tenant).toBe("t-cookie");
    expect(buildPolicyHeaders(null, "__tenant=t-cookie").__tenant).toBe("t-cookie");
  });

  it("culture cookie wins over the session snapshot (culture-priority regression)", () => {
    const header = buildPolicyHeaders(session, ".AspNetCore.Culture=c%3Dzh-Hans%7Cuic%3Dzh-Hans");
    expect(header["Accept-Language"]).toBe("zh-Hans");
    expect(buildPolicyHeaders(session, null)["Accept-Language"]).toBe("en");
  });
});

describe("callAbpWithSession", () => {
  it("policy headers win over caller headers and forward through the proxy", async () => {
    const seen: RequestInit[] = [];
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await callAbpWithSession(runtime(fetchFn), session, null, {
      path: "/api/x",
      headers: { "accept-language": "fr", __tenant: "t-forged" },
    });
    const headers = new Headers(seen[0]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer at");
    expect(headers.get("__tenant")).toBe("t-session");
    expect(headers.get("Accept-Language")).toBe("en");
  });

  // 剔除必须是无条件的：会话无租户且请求无 __tenant cookie 时策略头为空，
  // 若只剔除「策略头里实际存在的键」，伪造值就会原样转发到上游。
  it("drops forged policy headers even when no policy value applies", async () => {
    const seen: RequestInit[] = [];
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await callAbpWithSession(runtime(fetchFn), null, null, {
      path: "/api/x",
      headers: { "accept-language": "fr", __tenant: "t-forged", accept: "application/json" },
    });
    const headers = new Headers(seen[0]?.headers);
    expect(headers.get("__tenant")).toBeNull();
    expect(headers.get("Accept-Language")).toBeNull();
    expect(headers.get("Accept")).toBe("application/json");
  });
});
