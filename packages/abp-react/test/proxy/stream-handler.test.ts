import { describe, expect, it } from "vitest";
import {
  type Auth,
  type AuthSession,
  COOKIE_CHUNK_SIZE,
  chunkCookieValue,
  parseCookieHeader,
} from "../../src/auth";
import { createAbpAuthRuntime } from "../../src/proxy/auth-runtime";
import { handleAbpStream } from "../../src/proxy/stream-handler";

const ENV = {
  AUTH_ISSUER: "https://idp.example",
  AUTH_CLIENT_ID: "web",
  AUTH_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_REDIRECT_URI: "https://app.example/api/auth/callback",
  AUTH_ABP_BASE_URL: "https://abp.example",
};

/** 记录发往 ABP 的请求，按 `respond` 回响应。 */
function abpFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return respond();
  }) as typeof fetch;
  return { fetchFn, calls };
}

async function signedInCookie(rt: ReturnType<typeof createAbpAuthRuntime>): Promise<string> {
  const [cookie] = await rt.auth.session.establish(
    { tokens: { accessToken: "at-1" } },
    { tenant: "t1", culture: null, cookieHeader: null },
  );
  return String(cookie).split(";")[0] ?? "";
}

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://app.example${path}`, {
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });

/** 按顺序把 Set-Cookie 落进 jar，模拟浏览器收下响应：`Max-Age=0` 即删除。 */
function applyToJar(jar: Map<string, string>, setCookies: string[]) {
  for (const cookie of setCookies) {
    const [pair = "", ...attrs] = cookie.split(/;\s*/);
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    if (attrs.some((attr) => attr.toLowerCase() === "max-age=0")) jar.delete(name);
    else jar.set(name, pair.slice(eq + 1));
  }
}

describe("handleAbpStream", () => {
  it("streams the ABP file back with the session's bearer, tenant and filename", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0xff, 0x00]);
    const { fetchFn, calls } = abpFetch(
      () =>
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="resume.pdf"',
            "cache-control": "public, max-age=3600",
            "set-cookie": "abp-internal=1",
          },
        }),
    );
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const cookie = await signedInCookie(rt);

    const res = await handleAbpStream(
      request("/api/stream/api/app/file/1/download?v=2", { cookie, accept: "application/pdf" }),
      rt,
    );

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="resume.pdf"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(calls[0]?.url).toBe("https://abp.example/api/app/file/1/download?v=2");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer at-1");
    expect(calls[0]?.headers.get("__tenant")).toBe("t1");
    expect(calls[0]?.headers.get("accept")).toBe("application/pdf");
    expect(calls[0]?.headers.has("cookie")).toBe(false);
  });

  it("passes an ABP error envelope through with its status", async () => {
    const envelope = { error: { message: "没有权限" } };
    const { fetchFn } = abpFetch(() => Response.json(envelope, { status: 403 }));
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await handleAbpStream(request("/api/stream/api/app/file/1/download"), rt);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(envelope);
  });

  it("rejects a cross-site request without calling ABP", async () => {
    const { fetchFn, calls } = abpFetch(() => new Response("x"));
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await handleAbpStream(
      request("/api/stream/api/app/file/1", { "sec-fetch-site": "cross-site" }),
      rt,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("refuses a protocol-relative upstream path instead of letting it reach another host", async () => {
    const { fetchFn, calls } = abpFetch(() => new Response("x"));
    const rt = createAbpAuthRuntime(ENV, { fetchFn });
    const res = await handleAbpStream(request("/api/stream//evil.example/steal"), rt);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("answers 502 with an ABP-shaped envelope when the backend is unreachable", async () => {
    const { fetchFn } = abpFetch(() => Promise.reject(new TypeError("fetch failed")));
    const rt = createAbpAuthRuntime(ENV, { fetchFn, proxy: { retries: 0 } });
    const res = await handleAbpStream(request("/api/stream/api/app/file/1"), rt);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("abp.example");
  });

  it("leaves no stale chunks when a 401 forces a second, shorter refresh", async () => {
    const SESSION = "sess";
    const refreshed = ["a".repeat(COOKIE_CHUNK_SIZE * 4), "b".repeat(COOKIE_CHUNK_SIZE * 2)];
    let refreshes = 0;
    const session: AuthSession = {
      tokens: { accessToken: "at-old", refreshToken: "rt" },
      expiresAt: 0,
    } as AuthSession;
    const auth = {
      session: {
        current: async () => session,
        isExpired: () => refreshes === 0,
        refresh: async (_: AuthSession, cookieHeader: string | null) => {
          const value = refreshed[refreshes++] ?? "";
          return {
            session: { ...session, tokens: { accessToken: `at-${refreshes}`, refreshToken: "rt" } },
            setCookies: chunkCookieValue(SESSION, value, {}, parseCookieHeader(cookieHeader)),
          };
        },
      },
    } as unknown as Auth;
    let abpCalls = 0;
    const { fetchFn } = abpFetch(() =>
      abpCalls++ === 0 ? new Response(null, { status: 401 }) : new Response("ok"),
    );
    const rt = { ...createAbpAuthRuntime(ENV, { fetchFn }), auth };
    const jar = new Map([
      [`${SESSION}.0`, "old0"],
      [`${SESSION}.1`, "old1"],
    ]);

    const res = await handleAbpStream(
      request("/api/stream/api/app/file/1", {
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      }),
      rt,
    );

    expect(res.status).toBe(200);
    expect(refreshes).toBe(2);
    applyToJar(jar, res.headers.getSetCookie());
    expect([...jar.keys()].sort()).toEqual([`${SESSION}.0`, `${SESSION}.1`]);
    expect([...jar.values()].join("")).toBe(refreshed[1]);
  });
});
