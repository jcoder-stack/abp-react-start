import { describe, expect, it, vi } from "vitest";
import {
  handleCallback,
  handleLogin,
  handleLogout,
  handleSetCulture,
  handleSetTenant,
} from "../../src/proxy/auth-handlers";
import { createAbpAuthRuntime } from "../../src/proxy/auth-runtime";

const ENV = {
  AUTH_ISSUER: "https://idp.example",
  AUTH_CLIENT_ID: "web",
  AUTH_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_REDIRECT_URI: "https://app.example/api/auth/callback",
  AUTH_POST_LOGOUT_REDIRECT_URI: "https://app.example/",
  AUTH_ABP_BASE_URL: "https://abp.example",
};

const METADATA = {
  issuer: ENV.AUTH_ISSUER,
  authorization_endpoint: "https://idp.example/connect/authorize",
  token_endpoint: "https://idp.example/connect/token",
  end_session_endpoint: "https://idp.example/connect/endsession",
  revocation_endpoint: "https://idp.example/connect/revocat",
};

/** IdP 假 fetch：discovery + token + revocation 按脚本响应并记录。 */
function idpFetch(tokenResponse: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes(".well-known")) return Response.json(METADATA);
    if (url === METADATA.token_endpoint) return tokenResponse();
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const okToken = () => Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3600 });

function setCookiePairs(res: Response): string[] {
  return res.headers.getSetCookie();
}

describe("handleLogin", () => {
  it("302s to the authorize URL and seals the handshake into auth_login", async () => {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await handleLogin(
      new Request("https://app.example/api/auth/login?returnUrl=/books"),
      rt,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe(METADATA.authorization_endpoint);
    const login = setCookiePairs(res).find((c) => c.startsWith("auth_login="));
    expect(login).toBeDefined();
    const sealed = decodeURIComponent(
      (login ?? "").split(";")[0]?.slice("auth_login=".length) ?? "",
    );
    const handshake = await rt.handshakeCodec.open(sealed);
    expect(handshake?.returnUrl).toBe("/books");
    expect(handshake?.state).toBe(location.searchParams.get("state"));
  });

  it("applies the login cookie secure/sameSite overrides", async () => {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, {
      fetchFn,
      cookies: { login: { secure: false, sameSite: "Strict" } },
    });
    const res = await handleLogin(new Request("https://app.example/api/auth/login"), rt);
    const login = setCookiePairs(res).find((c) => c.startsWith("auth_login=")) ?? "";
    expect(login).not.toMatch(/Secure/);
    expect(login).toMatch(/SameSite=Strict/);
  });
});

describe("handleCallback", () => {
  async function loginThenCallback(
    rt: ReturnType<typeof createAbpAuthRuntime>,
    mutate?: (state: string) => string,
    loginCookieName = "auth_login",
  ) {
    const login = await handleLogin(
      new Request("https://app.example/api/auth/login?returnUrl=/books"),
      rt,
    );
    const location = new URL(login.headers.get("Location") ?? "");
    const state =
      mutate?.(location.searchParams.get("state") ?? "") ?? location.searchParams.get("state");
    const loginCookie = setCookiePairs(login)
      .find((c) => c.startsWith(`${loginCookieName}=`))
      ?.split(";")[0];
    return handleCallback(
      new Request(`https://app.example/api/auth/callback?code=c1&state=${state}`, {
        headers: { cookie: loginCookie ?? "" },
      }),
      rt,
    );
  }

  it("establishes the session and bounces to the handshake returnUrl", async () => {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await loginThenCallback(rt);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/books");
    const cookies = setCookiePairs(res);
    expect(cookies.some((c) => c.startsWith("auth_session"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("auth_login=;") || c.startsWith("auth_login=; "))).toBe(
      true,
    );
  });

  it("302s to /login?error=invalid_state on a state mismatch", async () => {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await loginThenCallback(rt, () => "evil");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login?error=invalid_state");
  });

  it("302s to /login?error=session_open_failed without a handshake cookie", async () => {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await handleCallback(
      new Request("https://app.example/api/auth/callback?code=c1&state=s"),
      rt,
    );
    expect(res.headers.get("Location")).toBe("/login?error=session_open_failed");
  });

  it("honors a custom login cookie name across login and callback", async () => {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn, cookies: { login: { name: "hs" } } });
    const login = await handleLogin(new Request("https://app.example/api/auth/login"), rt);
    expect(setCookiePairs(login).some((c) => c.startsWith("hs="))).toBe(true);
    expect(setCookiePairs(login).some((c) => c.startsWith("auth_login="))).toBe(false);
    const res = await loginThenCallback(rt, undefined, "hs");
    expect(res.status).toBe(302);
    expect(setCookiePairs(res).some((c) => c.startsWith("auth_session"))).toBe(true);
  });
});

describe("handleLogout", () => {
  it("clears the session, revokes the refresh token and 302s to the IdP end-session URL", async () => {
    const { fetchFn, calls } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const callback = await (async () => {
      const login = await handleLogin(new Request("https://app.example/api/auth/login"), rt);
      const location = new URL(login.headers.get("Location") ?? "");
      const loginCookie = setCookiePairs(login)
        .find((c) => c.startsWith("auth_login="))
        ?.split(";")[0];
      return handleCallback(
        new Request(
          `https://app.example/api/auth/callback?code=c1&state=${location.searchParams.get("state")}`,
          { headers: { cookie: loginCookie ?? "" } },
        ),
        rt,
      );
    })();
    const sessionCookie = setCookiePairs(callback)
      .filter((c) => c.startsWith("auth_session") && !c.includes("Max-Age=0"))
      .map((c) => c.split(";")[0])
      .join("; ");
    const res = await handleLogout(
      new Request("https://app.example/api/auth/logout", { headers: { cookie: sessionCookie } }),
      rt,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain(METADATA.end_session_endpoint);
    expect(setCookiePairs(res).every((c) => c.includes("Max-Age=0"))).toBe(true);
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === METADATA.revocation_endpoint)).toBe(true);
    });
  });

  it("falls back to the postLogoutRedirectUri override when the IdP has no end-session URL", async () => {
    const noEndSession = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(".well-known"))
        return Response.json({ ...METADATA, end_session_endpoint: undefined });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const rt = createAbpAuthRuntime(ENV, {
      fetchFn: noEndSession,
      postLogoutRedirectUri: "https://app.example/goodbye",
    });
    const res = await handleLogout(new Request("https://app.example/api/auth/logout"), rt);
    expect(res.headers.get("Location")).toBe("https://app.example/goodbye");
  });
});

describe("culture / tenant switch handlers", () => {
  it("handleSetCulture persists the cookie and bounces to the sanitized returnUrl", () => {
    const res = handleSetCulture(
      new Request("https://app/api/culture?culture=zh-Hans&returnUrl=/books"),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/books");
    expect(res.headers.get("Set-Cookie")).toContain(".AspNetCore.Culture=");
    expect(handleSetCulture(new Request("https://app/api/culture")).status).toBe(400);
  });

  it("handleSetTenant sets or clears the tenant cookie", () => {
    const set = handleSetTenant(new Request("https://app/api/tenant?tenant=t1&returnUrl=/"));
    expect(set.headers.get("Set-Cookie")).toContain("__tenant=t1");
    const clear = handleSetTenant(new Request("https://app/api/tenant?returnUrl=//evil.com"));
    expect(clear.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(clear.headers.get("Location")).toBe("/");
  });

  // 这两个值最终会作为 __tenant / Accept-Language 头发往上游；非法字符会让 Headers 构造抛错，
  // 使该用户之后每个请求都 500，而这两个 handler 是 GET、可被一次链接点击触发。
  it("handleSetTenant rejects values that cannot be sent as a header", () => {
    for (const tenant of [
      "值",
      "t1 t2",
      `t1${String.fromCharCode(10)}X-Injected: 1`,
      "a".repeat(65),
    ]) {
      const res = handleSetTenant(
        new Request(`https://app/api/tenant?tenant=${encodeURIComponent(tenant)}`),
      );
      expect(res.status).toBe(400);
      expect(res.headers.get("Set-Cookie")).toBeNull();
    }
  });

  it("handleSetCulture rejects values that are not BCP-47 tags", () => {
    for (const culture of ["值", "zh Hans", `zh${String.fromCharCode(13)}`, "a".repeat(40)]) {
      const res = handleSetCulture(
        new Request(`https://app/api/culture?culture=${encodeURIComponent(culture)}`),
      );
      expect(res.status).toBe(400);
      expect(res.headers.get("Set-Cookie")).toBeNull();
    }
    expect(handleSetCulture(new Request("https://app/api/culture?culture=zh-Hans-CN")).status).toBe(
      302,
    );
  });
});

// 三个 handler 都是 GET 且会改状态（登出、换租户、换文化），顶层导航能带上会话 cookie，
// 所以同源判定是它们唯一的 CSRF 防线。
describe("cross-site protection", () => {
  const CULTURE_URL = "https://app.example/api/culture?culture=zh-Hans";
  const TENANT_URL = "https://app.example/api/tenant?tenant=t1";
  const LOGOUT_URL = "https://app.example/api/auth/logout";

  function logout(headers: Record<string, string>) {
    const { fetchFn } = idpFetch(okToken);
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    return handleLogout(new Request(LOGOUT_URL, { headers }), rt);
  }

  const cases: [string, (headers: Record<string, string>) => Response | Promise<Response>][] = [
    ["handleSetCulture", (headers) => handleSetCulture(new Request(CULTURE_URL, { headers }))],
    ["handleSetTenant", (headers) => handleSetTenant(new Request(TENANT_URL, { headers }))],
    ["handleLogout", logout],
  ];

  for (const [name, call] of cases) {
    it(`${name} rejects a cross-site Sec-Fetch-Site without touching cookies`, async () => {
      const res = await call({ "sec-fetch-site": "cross-site" });
      expect(res.status).toBe(403);
      expect(res.headers.get("Set-Cookie")).toBeNull();
    });

    it(`${name} rejects a foreign Origin when Sec-Fetch-Site is absent`, async () => {
      const res = await call({ origin: "https://evil.example" });
      expect(res.status).toBe(403);
      expect(res.headers.get("Set-Cookie")).toBeNull();
    });

    it(`${name} rejects a foreign Referer when Sec-Fetch-Site and Origin are absent`, async () => {
      const res = await call({ referer: "https://evil.example/lure" });
      expect(res.status).toBe(403);
      expect(res.headers.get("Set-Cookie")).toBeNull();
    });

    it(`${name} allows a same-origin Sec-Fetch-Site`, async () => {
      expect((await call({ "sec-fetch-site": "same-origin" })).status).toBe(302);
    });

    it(`${name} allows a direct navigation (Sec-Fetch-Site: none)`, async () => {
      expect((await call({ "sec-fetch-site": "none" })).status).toBe(302);
    });

    it(`${name} allows a matching Origin when Sec-Fetch-Site is absent`, async () => {
      expect((await call({ origin: "https://app.example" })).status).toBe(302);
    });

    it(`${name} allows a request carrying none of the three headers`, async () => {
      expect((await call({})).status).toBe(302);
    });
  }
});
