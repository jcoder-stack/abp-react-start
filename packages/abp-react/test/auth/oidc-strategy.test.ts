import { describe, expect, it, vi } from "vitest";
import type { TokenClient, TokenGrant } from "../../src/auth/oidc/token-client";
import { generatePkce, generateRandomString } from "../../src/auth/pkce";
import { oidcStrategy } from "../../src/auth/strategies/oidc";

const NONCE_PAYLOAD = btoa(JSON.stringify({ nonce: "n1" }))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const ID_TOKEN = `h.${NONCE_PAYLOAD}.s`;

function fakeTokenClient(grant: Partial<TokenGrant> = {}): TokenClient & { exchanged: unknown[] } {
  const exchanged: unknown[] = [];
  return {
    exchanged,
    metadata: async () => ({ issuer: "i", authorization_endpoint: "a", token_endpoint: "t" }),
    exchangeCode: async (p) => {
      exchanged.push(p);
      return { accessToken: "at", refreshToken: "rt", idToken: ID_TOKEN, expiresIn: 60, ...grant };
    },
    passwordGrant: async () => ({ accessToken: "at" }),
    refreshGrant: async () => ({ accessToken: "at" }),
    revoke: async () => {},
    authorizeUrl: async (p) => `https://idp/authorize?state=${p.state}&nonce=${p.nonce}`,
    endSessionUrl: async () => "https://idp/endsession",
  };
}

function strategy(client = fakeTokenClient()) {
  return oidcStrategy({
    tokenClient: client,
    redirectUri: "https://app/cb",
    now: () => 1000,
    random: vi.fn().mockReturnValueOnce("state-1").mockReturnValueOnce("nonce-1"),
    pkce: async () => ({ verifier: "ver-1", challenge: "ch-1" }),
  });
}

describe("oidcStrategy.begin", () => {
  it("returns the authorize redirect and a handshake holding state/nonce/verifier/returnUrl/issuedAt", async () => {
    const { redirectUrl, handshake } = await strategy().begin({ returnUrl: "/home", tenant: "t1" });
    expect(redirectUrl).toContain("state=state-1");
    expect(handshake).toEqual({
      state: "state-1",
      nonce: "nonce-1",
      codeVerifier: "ver-1",
      returnUrl: "/home",
      issuedAt: 1000,
    });
  });
});

describe("oidcStrategy.complete", () => {
  const handshake = {
    state: "s1",
    nonce: "n1",
    codeVerifier: "v1",
    returnUrl: "/",
    issuedAt: 1000,
  };

  // 握手密文只受 login cookie 的 maxAge 这层浏览器约束，服务端必须自己给它设上限。
  it("rejects a handshake older than the configured lifetime before touching the token endpoint", async () => {
    const client = fakeTokenClient();
    await expect(
      strategy(client).complete({
        kind: "callback",
        params: new URLSearchParams({ code: "c1", state: "s1" }),
        handshake: { ...handshake, issuedAt: 1000 - 600_001 },
      }),
    ).rejects.toMatchObject({ code: "handshake_expired" });
    expect(client.exchanged).toHaveLength(0);
  });

  it("honours a custom handshake lifetime", async () => {
    const strategyWithShortTtl = oidcStrategy({
      tokenClient: fakeTokenClient(),
      redirectUri: "https://app/cb",
      now: () => 1000,
      handshakeMaxAgeSeconds: 1,
    });
    await expect(
      strategyWithShortTtl.complete({
        kind: "callback",
        params: new URLSearchParams({ code: "c1", state: "s1" }),
        handshake: { ...handshake, issuedAt: 1000 - 1_001 },
      }),
    ).rejects.toMatchObject({ code: "handshake_expired" });
  });

  it("rejects a state mismatch before touching the token endpoint", async () => {
    const client = fakeTokenClient();
    await expect(
      strategy(client).complete({
        kind: "callback",
        params: new URLSearchParams({ code: "c1", state: "evil" }),
        handshake,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    expect(client.exchanged).toHaveLength(0);
  });

  it("surfaces a provider error callback as provider_denied without touching the token endpoint", async () => {
    const client = fakeTokenClient();
    await expect(
      strategy(client).complete({
        kind: "callback",
        params: new URLSearchParams({
          error: "access_denied",
          error_description: "user denied",
          state: "s1",
        }),
        handshake,
      }),
    ).rejects.toMatchObject({ code: "provider_denied", message: /access_denied/ });
    expect(client.exchanged).toHaveLength(0);
  });

  it("rejects a missing code", async () => {
    await expect(
      strategy().complete({
        kind: "callback",
        params: new URLSearchParams({ state: "s1" }),
        handshake,
      }),
    ).rejects.toMatchObject({ code: "exchange_failed" });
  });

  it("exchanges the code with the handshake verifier and computes absolute expiry", async () => {
    const client = fakeTokenClient();
    const result = await strategy(client).complete({
      kind: "callback",
      params: new URLSearchParams({ code: "c1", state: "s1" }),
      handshake,
    });
    expect(client.exchanged[0]).toEqual({
      code: "c1",
      codeVerifier: "v1",
      redirectUri: "https://app/cb",
    });
    expect(result.tokens.accessToken).toBe("at");
    expect(result.expiresAt).toBe(61000);
  });

  it("rejects an id_token whose nonce differs from the handshake", async () => {
    await expect(
      strategy().complete({
        kind: "callback",
        params: new URLSearchParams({ code: "c1", state: "s1" }),
        handshake: { ...handshake, nonce: "other" },
      }),
    ).rejects.toMatchObject({ code: "invalid_nonce" });
  });

  // 喂错策略是编程错误，不该与「code 换 token 失败」共用错误码。
  it("rejects a credentials input as invalid_input, not an exchange failure", async () => {
    await expect(
      strategy().complete({ kind: "credentials", userName: "u", password: "p" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("pkce", () => {
  it("generates S256 challenge = BASE64URL(SHA-256(verifier))", async () => {
    const { verifier, challenge } = await generatePkce();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("generateRandomString yields distinct url-safe values", () => {
    const a = generateRandomString();
    expect(a).not.toBe(generateRandomString());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
