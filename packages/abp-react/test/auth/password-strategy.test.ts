import { describe, expect, it } from "vitest";
import { AuthError } from "../../src/auth/errors";
import type { TokenClient } from "../../src/auth/oidc/token-client";
import { passwordStrategy } from "../../src/auth/strategies/password";

function fakeTokenClient(fail = false): TokenClient & { grants: unknown[] } {
  const grants: unknown[] = [];
  return {
    grants,
    metadata: async () => ({ issuer: "i", authorization_endpoint: "a", token_endpoint: "t" }),
    exchangeCode: async () => ({ accessToken: "at" }),
    passwordGrant: async (p) => {
      grants.push(p);
      if (fail) throw new AuthError("invalid_credentials");
      return { accessToken: "at", refreshToken: "rt", expiresIn: 60 };
    },
    refreshGrant: async () => ({ accessToken: "at" }),
    revoke: async () => {},
    authorizeUrl: async () => "u",
    endSessionUrl: async () => null,
  };
}

describe("passwordStrategy", () => {
  it("completes credentials into a TokenResult with absolute expiry", async () => {
    const client = fakeTokenClient();
    const result = await passwordStrategy({ tokenClient: client, now: () => 1000 }).complete({
      kind: "credentials",
      userName: "admin",
      password: "1q2w3E*",
      tenant: "t1",
    });
    expect(client.grants[0]).toEqual({ userName: "admin", password: "1q2w3E*", tenant: "t1" });
    expect(result).toEqual({
      tokens: { accessToken: "at", refreshToken: "rt", idToken: undefined },
      expiresAt: 61000,
    });
  });

  it("propagates invalid_credentials from the token client", async () => {
    await expect(
      passwordStrategy({ tokenClient: fakeTokenClient(true) }).complete({
        kind: "credentials",
        userName: "admin",
        password: "wrong",
      }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  // 喂错策略是编程错误，不该伪装成「密码错误」渲染给用户。
  it("rejects callback inputs as invalid_input, not a credential failure", async () => {
    await expect(
      passwordStrategy({ tokenClient: fakeTokenClient() }).complete({
        kind: "callback",
        params: new URLSearchParams(),
        handshake: { state: "s", nonce: "n", codeVerifier: "v", returnUrl: "/", issuedAt: 0 },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
