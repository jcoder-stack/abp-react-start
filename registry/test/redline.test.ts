import { createLogger, createMemorySink, resolveConfig } from "@jcoder/abp-react/logger";
import { createAbpAuthRuntime, handleCallback, handleLogin } from "@jcoder/abp-react/proxy";
import { describe, expect, it } from "vitest";

const ENV = {
  AUTH_ISSUER: "https://idp.example",
  AUTH_CLIENT_ID: "web",
  AUTH_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_REDIRECT_URI: "https://app.example/api/auth/callback",
  AUTH_ABP_BASE_URL: "https://abp.example",
  AUTH_DEBUG: "true",
};

const SECRETS = {
  accessToken: "SECRET-ACCESS-TOKEN-a8f3",
  refreshToken: "SECRET-REFRESH-TOKEN-b7e2",
  code: "SECRET-AUTH-CODE-c6d1",
  password: "SECRET-PASSWORD-d5c0",
};

const METADATA = {
  issuer: ENV.AUTH_ISSUER,
  authorization_endpoint: "https://idp.example/connect/authorize",
  token_endpoint: "https://idp.example/connect/token",
};

const fetchFn = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes(".well-known")) return Response.json(METADATA);
  if (url === METADATA.token_endpoint)
    return Response.json({
      access_token: SECRETS.accessToken,
      refresh_token: SECRETS.refreshToken,
      expires_in: 3600,
    });
  return new Response("{}", { status: 200 });
}) as typeof fetch;

describe("debug logging red line", () => {
  it("never writes tokens, codes, verifiers or passwords to the log — even at debug level", async () => {
    const { sink, records } = createMemorySink();
    const logger = createLogger({
      scope: "auth",
      sink,
      config: resolveConfig({ LOG_LEVEL: "debug" }),
    });
    const rt = createAbpAuthRuntime(ENV, { fetchFn, logger });

    const login = await handleLogin(new Request("https://app.example/api/auth/login"), rt);
    const location = new URL(login.headers.get("Location") ?? "");
    const state = location.searchParams.get("state") ?? "";
    const verifier = (
      await rt.handshakeCodec.open(
        decodeURIComponent(
          login.headers
            .getSetCookie()
            .find((c) => c.startsWith("auth_login="))
            ?.split(";")[0]
            ?.slice("auth_login=".length) ?? "",
        ),
      )
    )?.codeVerifier;
    await handleCallback(
      new Request(`https://app.example/api/auth/callback?code=${SECRETS.code}&state=${state}`, {
        headers: {
          cookie:
            login.headers
              .getSetCookie()
              .find((c) => c.startsWith("auth_login="))
              ?.split(";")[0] ?? "",
        },
      }),
      rt,
    );
    await rt.auth.strategy("password").complete({
      kind: "credentials",
      userName: "admin",
      password: SECRETS.password,
    });

    expect(records.length).toBeGreaterThan(0);
    const dump = JSON.stringify(records);
    for (const secret of [...Object.values(SECRETS), verifier]) {
      expect(secret).toBeDefined();
      expect(dump).not.toContain(secret as string);
    }
  });
});
