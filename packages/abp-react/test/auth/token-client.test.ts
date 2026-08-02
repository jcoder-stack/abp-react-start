import { describe, expect, it } from "vitest";
import { decodeIdTokenClaims } from "../../src/auth/oidc/claims";
import { discoverMetadata } from "../../src/auth/oidc/metadata";
import {
  createTokenClient,
  type TokenClientConfig,
  toTokenResult,
} from "../../src/auth/oidc/token-client";

const METADATA = {
  issuer: "https://idp.example",
  authorization_endpoint: "https://idp.example/connect/authorize",
  token_endpoint: "https://idp.example/connect/token",
  end_session_endpoint: "https://idp.example/connect/endsession",
  revocation_endpoint: "https://idp.example/connect/revocat",
};
const GRANT = { access_token: "at", refresh_token: "rt", id_token: "idt", expires_in: 3600 };

/** fake fetch：discovery 返回元数据，token/revocation 端点按脚本响应并记录请求。 */
function fakeFetch(script: { token?: () => Response }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes(".well-known")) return Response.json(METADATA);
    if (url === METADATA.token_endpoint) return (script.token ?? (() => Response.json(GRANT)))();
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function client(
  script: { token?: () => Response } = {},
  overrides: Partial<TokenClientConfig> = {},
) {
  const { fetchFn, calls } = fakeFetch(script);
  return {
    calls,
    client: createTokenClient({
      issuer: "https://idp.example",
      clientId: "web",
      clientSecret: "shh",
      scope: "openid profile",
      fetchFn,
      ...overrides,
    }),
  };
}

/** ABP 的 `__tenant` 约定，作为可注入 hook 由宿主提供而非内建在协议客户端里。 */
const abpTenant = (tenant: string) => ({
  headers: { __tenant: tenant },
  query: { __tenant: tenant },
});

describe("createTokenClient", () => {
  it("caches successful discovery (one network call for two metadata reads)", async () => {
    const { client: c, calls } = client();
    await c.metadata();
    await c.metadata();
    expect(calls.filter((x) => x.url.includes(".well-known"))).toHaveLength(1);
  });

  it("does not cache failed discovery", async () => {
    let first = true;
    const fetchFn = (async () => {
      if (first) {
        first = false;
        return new Response(null, { status: 500 });
      }
      return Response.json(METADATA);
    }) as typeof fetch;
    const c = createTokenClient({ issuer: "https://idp.example", clientId: "web", fetchFn });
    await expect(c.metadata()).rejects.toMatchObject({ code: "discovery_failed" });
    await expect(c.metadata()).resolves.toMatchObject({ issuer: "https://idp.example" });
  });

  it("exchangeCode posts the PKCE form and returns the grant", async () => {
    const { client: c, calls } = client();
    const grant = await c.exchangeCode({
      code: "c1",
      codeVerifier: "v1",
      redirectUri: "https://app/cb",
    });
    expect(grant).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      idToken: "idt",
      expiresIn: 3600,
    });
    const body = String(calls.at(-1)?.init?.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=c1");
    expect(body).toContain("code_verifier=v1");
    expect(body).toContain("client_secret=shh");
  });

  it("passwordGrant maps 400 to invalid_credentials and sends no tenant header by default", async () => {
    const { client: c, calls } = client({ token: () => new Response("{}", { status: 400 }) });
    await expect(
      c.passwordGrant({ userName: "admin", password: "wrong", tenant: "t1" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    const headers = new Headers(calls.at(-1)?.init?.headers);
    expect(headers.get("__tenant")).toBeNull();
    expect(String(calls.at(-1)?.init?.body)).toContain("grant_type=password");
  });

  it("passwordGrant sends the headers the tenant propagation hook produces", async () => {
    const { client: c, calls } = client({}, { tenantPropagation: abpTenant });
    await c.passwordGrant({ userName: "admin", password: "pw", tenant: "t1" });
    expect(new Headers(calls.at(-1)?.init?.headers).get("__tenant")).toBe("t1");
  });

  it("refreshGrant maps failure to refresh_failed", async () => {
    const { client: c } = client({ token: () => new Response("{}", { status: 401 }) });
    await expect(c.refreshGrant("rt")).rejects.toMatchObject({ code: "refresh_failed" });
  });

  it("authorizeUrl carries code/PKCE/state/nonce but no tenant param by default", async () => {
    const { client: c } = client();
    const url = new URL(
      await c.authorizeUrl({
        state: "s1",
        nonce: "n1",
        codeChallenge: "ch",
        redirectUri: "https://app/cb",
        tenant: "t1",
      }),
    );
    expect(url.origin + url.pathname).toBe(METADATA.authorization_endpoint);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("nonce")).toBe("n1");
    expect(url.searchParams.get("__tenant")).toBeNull();
  });

  it("authorizeUrl carries the query params the tenant propagation hook produces", async () => {
    const { client: c } = client({}, { tenantPropagation: abpTenant });
    const url = new URL(
      await c.authorizeUrl({
        state: "s1",
        nonce: "n1",
        codeChallenge: "ch",
        redirectUri: "https://app/cb",
        tenant: "t1",
      }),
    );
    expect(url.searchParams.get("__tenant")).toBe("t1");
  });

  it("endSessionUrl returns null when the IdP has no end_session_endpoint", async () => {
    const fetchFn = (async () =>
      Response.json({ ...METADATA, end_session_endpoint: undefined })) as typeof fetch;
    const c = createTokenClient({ issuer: "https://idp.example", clientId: "web", fetchFn });
    expect(await c.endSessionUrl({ idToken: "idt" })).toBeNull();
  });

  it("exchangeCode rejects with exchange_failed when 2xx body is invalid JSON", async () => {
    const { client: c } = client({ token: () => new Response("not-json", { status: 200 }) });
    await expect(
      c.exchangeCode({ code: "c1", codeVerifier: "v1", redirectUri: "https://app/cb" }),
    ).rejects.toMatchObject({ code: "exchange_failed", message: /malformed/ });
  });

  it("exchangeCode rejects with exchange_failed when 2xx body is missing access_token", async () => {
    const { client: c } = client({ token: () => Response.json({}, { status: 200 }) });
    await expect(
      c.exchangeCode({ code: "c1", codeVerifier: "v1", redirectUri: "https://app/cb" }),
    ).rejects.toMatchObject({ code: "exchange_failed", message: /malformed/ });
  });
});

describe("discoverMetadata", () => {
  it("rejects with discovery_failed when the response issuer differs from the requested one", async () => {
    const fetchFn = (async () =>
      Response.json({ ...METADATA, issuer: "https://other.example" })) as typeof fetch;
    await expect(discoverMetadata("https://idp.example", { fetchFn })).rejects.toMatchObject({
      code: "discovery_failed",
    });
  });

  it("tolerates a trailing-slash-only difference in the issuer", async () => {
    const fetchFn = (async () =>
      Response.json({ ...METADATA, issuer: "https://idp.example/" })) as typeof fetch;
    await expect(discoverMetadata("https://idp.example", { fetchFn })).resolves.toMatchObject({
      issuer: "https://idp.example/",
    });
  });
});

describe("helpers", () => {
  it("toTokenResult computes absolute expiry only when expiresIn is present", () => {
    expect(toTokenResult({ accessToken: "at", expiresIn: 60 }, 1000).expiresAt).toBe(61000);
    expect(toTokenResult({ accessToken: "at" }, 1000).expiresAt).toBeUndefined();
  });

  it("decodeIdTokenClaims decodes the JWT payload segment", () => {
    const payload = btoa(JSON.stringify({ nonce: "n1", sub: "u1" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeIdTokenClaims(`h.${payload}.sig`)).toEqual({ nonce: "n1", sub: "u1" });
  });
});
