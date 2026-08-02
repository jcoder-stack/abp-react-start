import { describe, expect, it } from "vitest";
import { createLogger, createMemorySink, resolveConfig } from "../../src/logger";
import { callAbpWithSession } from "../../src/proxy/abp-call";
import { handleCallback, handleLogin, handleLogout } from "../../src/proxy/auth-handlers";
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

// id_token 不入戏：它要携带握手 nonce 才能通过 callback 校验，而 JWT 载荷是 base64url 编码的，
// 字面量断言对它本就无效。
const SECRETS = {
  accessToken: "SECRET-AT-3f9c",
  refreshToken: "SECRET-RT-8b21",
};

function idpFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(".well-known")) return Response.json(METADATA);
    if (url === METADATA.token_endpoint) {
      return Response.json({
        access_token: SECRETS.accessToken,
        refresh_token: SECRETS.refreshToken,
        expires_in: 3600,
      });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
}

function cookieHeaderOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .filter((c) => !c.includes("Max-Age=0"))
    .map((c) => c.split(";")[0])
    .join("; ");
}

// 这条不变量横跨 auth/manager、oidc/token-client、strategies、proxy、abp-call 五个注入点：
// 任何一处新加的 logger 调用把 session 或 grant 整个塞进 fields，都会在这里失败。
describe("log red line", () => {
  it("never writes access or refresh tokens into log records", async () => {
    const { sink, records } = createMemorySink();
    const logger = createLogger({
      scope: "auth",
      // trace 级：debug 日志才是真正的风险面，按默认 info 跑等于测了个寂寞。
      config: resolveConfig({ LOG_LEVEL: "trace" }),
      sink,
    });
    const rt = createAbpAuthRuntime(ENV, { fetchFn: idpFetch(), logger });

    const login = await handleLogin(
      new Request("https://app.example/api/auth/login?returnUrl=/books"),
      rt,
    );
    const state = new URL(login.headers.get("Location") ?? "").searchParams.get("state");
    const callback = await handleCallback(
      new Request(`https://app.example/api/auth/callback?code=c1&state=${state}`, {
        headers: { cookie: cookieHeaderOf(login) },
      }),
      rt,
    );
    const cookie = cookieHeaderOf(callback);

    const session = await rt.auth.session.current(cookie);
    expect(session?.tokens.accessToken).toBe(SECRETS.accessToken);
    await callAbpWithSession(rt, session, cookie, { path: "/api/app/books" });

    await handleLogout(
      new Request("https://app.example/api/auth/logout", {
        headers: { cookie, "sec-fetch-site": "same-origin" },
      }),
      rt,
    );

    // 一条都没记时下面的断言会全部空转，先锁住「确实记了日志」。
    expect(records.length).toBeGreaterThan(0);
    for (const token of Object.values(SECRETS)) {
      for (const record of records) {
        expect(record.message).not.toContain(token);
        expect(JSON.stringify(record.fields ?? {})).not.toContain(token);
      }
    }
  });
});
