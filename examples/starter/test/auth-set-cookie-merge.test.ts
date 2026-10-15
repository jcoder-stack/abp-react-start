import {
  COOKIE_CHUNK_SIZE,
  chunkCookieValue,
  parseCookieHeader,
  readChunkedCookie,
} from "@jcoder-stack/abp-react/auth";
import { appendResponseHeader, getResponseHeaders } from "@tanstack/react-start/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMiddleware } from "@/auth/middleware";

const refresh = vi.fn();
vi.mock("@/auth/runtime", () => ({
  getAuthRuntime: () => ({
    auth: {
      session: {
        current: async () => ({ tokens: { accessToken: "old" }, expiresAt: 0 }),
        isExpired: () => true,
        refresh,
      },
    },
  }),
}));

const SESSION = "app.session";
const opts = { maxAge: 3600 };
// 请求里原本是两块的会话。
const requestCookie = `${SESSION}.0=a; ${SESSION}.1=b; theme=dark`;
const sealed = (chunks: number) => "x".repeat(COOKIE_CHUNK_SIZE * chunks - 10);

type HandlerContext = { cookieHeader: string | null };

/**
 * Start 把请求事件放在全局 AsyncLocalStorage 里；在其中跑中间件，读到的就是这次请求最终发出的
 * Set-Cookie。依赖的正是 Start 1.169 的合并语义——它若再变，这里会先红。
 */
function runRequest(
  handler: (context: HandlerContext) => void,
  before: () => void = () => {},
): Promise<string[]> {
  const storage = (globalThis as Record<symbol, unknown>)[
    Symbol.for("tanstack-start:event-storage")
  ] as { run: <T>(event: unknown, fn: () => T) => T };
  const request = new Request("http://localhost/_serverFn/x", {
    headers: { cookie: requestCookie },
  });
  const server = authMiddleware.options.server as (args: {
    next: (arg: { context: HandlerContext }) => unknown;
  }) => Promise<unknown>;
  return storage.run({ request }, async () => {
    before();
    await server({
      next: ({ context }) => {
        handler(context);
        return {};
      },
    });
    return getResponseHeaders().getSetCookie();
  });
}

/** 按浏览器的方式把 Set-Cookie 依次落到 cookie jar 上。 */
function applyToJar(setCookies: string[]): Record<string, string> {
  const jar = parseCookieHeader(requestCookie);
  for (const line of setCookies) {
    const [pair = ""] = line.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    if (/;\s*Max-Age=0(;|$)/i.test(line)) delete jar[name];
    else jar[name] = decodeURIComponent(pair.slice(eq + 1));
  }
  return jar;
}

const sessionChunks = (jar: Record<string, string>) =>
  Object.keys(jar)
    .filter((k) => k.startsWith(`${SESSION}.`))
    .sort();

beforeEach(() => {
  refresh.mockReset();
});

describe("Set-Cookie after a middleware session refresh", () => {
  it("keeps every cookie written before and after the refresh", async () => {
    const refreshed = sealed(3);
    refresh.mockResolvedValue({
      session: { tokens: { accessToken: "new" }, expiresAt: 1 },
      setCookies: chunkCookieValue(SESSION, refreshed, opts, parseCookieHeader(requestCookie)),
    });

    // before 扮演排在 authMiddleware 之前的中间件，handler 扮演之后写 cookie 的业务代码。
    const jar = applyToJar(
      await runRequest(
        () => appendResponseHeader("Set-Cookie", ["culture=zh-Hans; Path=/"]),
        () => appendResponseHeader("Set-Cookie", ["tenant=t1; Path=/"]),
      ),
    );

    expect(readChunkedCookie(jar, SESSION)).toBe(refreshed);
    expect(jar.tenant).toBe("t1");
    expect(jar.culture).toBe("zh-Hans");
    expect(jar.theme).toBe("dark");
  });

  it("leaves exactly the newer session when the handler refreshes again with fewer chunks", async () => {
    refresh.mockResolvedValue({
      session: { tokens: { accessToken: "new" }, expiresAt: 1 },
      setCookies: chunkCookieValue(SESSION, sealed(4), opts, parseCookieHeader(requestCookie)),
    });
    const newer = sealed(2).replace(/^x/, "y");

    // 与代理里 401 后的二次刷新一致：清旧块的依据是中间件交下来的 cookieHeader。
    const jar = applyToJar(
      await runRequest(({ cookieHeader }) =>
        appendResponseHeader(
          "Set-Cookie",
          chunkCookieValue(SESSION, newer, opts, parseCookieHeader(cookieHeader)),
        ),
      ),
    );

    expect(readChunkedCookie(jar, SESSION)).toBe(newer);
    expect(sessionChunks(jar)).toEqual([`${SESSION}.0`, `${SESSION}.1`]);
  });
});
