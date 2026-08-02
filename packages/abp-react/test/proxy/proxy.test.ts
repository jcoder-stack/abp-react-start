import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../src/auth";
import { AbpProxyError, createAbpProxy } from "../../src/proxy/proxy";

const session: AuthSession = { tokens: { accessToken: "at-1", refreshToken: "rt-1" } };
const fresh: AuthSession = { tokens: { accessToken: "at-2", refreshToken: "rt-1" } };

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (next === undefined) throw new Error("fake fetch exhausted");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const noRefresh = { session, refresh: async () => null };

function streamingResponse(status: number): { response: Response; cancelled: () => boolean } {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("payload"));
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(stream, { status }), cancelled: () => cancelled };
}

describe("createAbpProxy", () => {
  it("attaches the bearer token and resolves the path against baseUrl", async () => {
    const { fetchFn, calls } = fakeFetch(new Response("ok", { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send({ path: "/api/app/books" }, noRefresh);
    expect(res.status).toBe(200);
    expect(res.body).toBe("ok");
    expect(calls[0]?.url).toBe("https://abp.example/api/app/books");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer at-1");
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "http://169.254.169.254/latest/meta-data",
    "/api/../../x",
  ])("rejects a path that escapes baseUrl and never fetches (%s)", async (path) => {
    const { fetchFn, calls } = fakeFetch(new Response("ok", { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example/abp/", fetchFn });
    await expect(proxy.send({ path }, noRefresh)).rejects.toThrow(/escapes baseUrl/);
    expect(calls).toHaveLength(0);
  });

  it("keeps the baseUrl path prefix when resolving the request path", async () => {
    const { fetchFn, calls } = fakeFetch(new Response("ok", { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://host.example/abp/", fetchFn });
    await proxy.send({ path: "/api/x" }, noRefresh);
    expect(calls[0]?.url).toBe("https://host.example/abp/api/x");
  });

  it("strips non-whitelisted caller headers and keeps the session Authorization", async () => {
    const { fetchFn, calls } = fakeFetch(new Response(null, { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    await proxy.send(
      {
        path: "/x",
        headers: {
          Authorization: "Bearer forged",
          Cookie: "sid=steal",
          Host: "evil.example",
          "X-Forwarded-For": "1.2.3.4",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
      noRefresh,
    );
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer at-1");
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.has("Host")).toBe(false);
    expect(headers.has("X-Forwarded-For")).toBe(false);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("on 401 with a refresh token: refreshes, replays once with the new bearer, and surfaces setCookies", async () => {
    const { fetchFn, calls } = fakeFetch(
      new Response(null, { status: 401 }),
      new Response("ok", { status: 200 }),
    );
    const refresh = vi.fn(async () => ({ session: fresh, setCookies: ["sc-1"] }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send({ path: "/x" }, { session, refresh });
    expect(res.status).toBe(200);
    expect(res.setCookies).toEqual(["sc-1"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(new Headers(calls[1]?.init?.headers).get("Authorization")).toBe("Bearer at-2");
  });

  it("passes the 401 through when refresh yields null, and never refreshes twice", async () => {
    const { fetchFn } = fakeFetch(new Response(null, { status: 401 }));
    const refresh = vi.fn(async () => null);
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send({ path: "/x" }, { session, refresh });
    expect(res.status).toBe(401);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("passes the 401 through without refresh when the session has no refresh token", async () => {
    const { fetchFn } = fakeFetch(new Response(null, { status: 401 }));
    const refresh = vi.fn();
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send(
      { path: "/x" },
      { session: { tokens: { accessToken: "at" } }, refresh },
    );
    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retries an idempotent GET on 5xx (2 retries default), not a POST", async () => {
    const g = fakeFetch(
      new Response(null, { status: 500 }),
      new Response(null, { status: 502 }),
      new Response("ok", { status: 200 }),
    );
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn: g.fetchFn });
    expect((await proxy.send({ path: "/x" }, noRefresh)).status).toBe(200);
    expect(g.calls).toHaveLength(3);

    const p = fakeFetch(new Response(null, { status: 500 }));
    const proxyPost = createAbpProxy({ baseUrl: "https://abp.example", fetchFn: p.fetchFn });
    expect((await proxyPost.send({ path: "/x", method: "POST" }, noRefresh)).status).toBe(500);
    expect(p.calls).toHaveLength(1);
  });

  it("retries a GET on network failure then throws when exhausted", async () => {
    const { fetchFn, calls } = fakeFetch(new Error("boom"), new Error("boom"), new Error("boom"));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    await expect(proxy.send({ path: "/x" }, noRefresh)).rejects.toThrow("boom");
    expect(calls).toHaveLength(3);
  });

  it("does not retry an untrusted upstream certificate", async () => {
    const tls = new TypeError("fetch failed", {
      cause: Object.assign(new Error("self-signed certificate"), {
        code: "DEPTH_ZERO_SELF_SIGNED_CERT",
      }),
    });
    const { fetchFn, calls } = fakeFetch(tls, tls, tls);
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    await expect(proxy.send({ path: "/x" }, noRefresh)).rejects.toThrow(/NODE_EXTRA_CA_CERTS/);
    expect(calls).toHaveLength(1);
  });

  it("keeps the original certificate error as the cause of the explanation", async () => {
    const cause = new TypeError("fetch failed", {
      cause: Object.assign(new Error("self-signed certificate"), {
        code: "DEPTH_ZERO_SELF_SIGNED_CERT",
      }),
    });
    const { fetchFn } = fakeFetch(cause);
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const error = await proxy.send({ path: "/x" }, noRefresh).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("unreachable");
    expect(error.message).toContain("https://abp.example");
    expect(error.cause).toBe(cause);
  });

  it("carries refreshed session cookies on the error when the replay fails", async () => {
    const cause = new TypeError("network down");
    const { fetchFn } = fakeFetch(new Response(null, { status: 401 }), cause);
    const refresh = vi.fn(async () => ({ session: fresh, setCookies: ["sid=new; Path=/"] }));
    const proxy = createAbpProxy({
      baseUrl: "https://abp.example",
      fetchFn,
      retry: { retries: 0 },
    });
    const error = await proxy.send({ path: "/x" }, { session, refresh }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AbpProxyError);
    if (!(error instanceof AbpProxyError)) throw new Error("unreachable");
    expect(error.setCookies).toEqual(["sid=new; Path=/"]);
    expect(error.cause).toBe(cause);
  });

  it("returns a binary body as byte-identical ArrayBuffer, a JSON body as string", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0xff, 0x00, 0xfe]);
    const binary = fakeFetch(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn: binary.fetchFn });
    const res = await proxy.send({ path: "/x" }, noRefresh);
    expect(res.body).toBeInstanceOf(ArrayBuffer);
    if (!(res.body instanceof ArrayBuffer)) throw new Error("unreachable");
    expect(new Uint8Array(res.body)).toEqual(bytes);

    const json = fakeFetch(
      new Response('{"a":1}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const jsonProxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn: json.fetchFn });
    expect((await jsonProxy.send({ path: "/x" }, noRefresh)).body).toBe('{"a":1}');
  });

  it("cancels the discarded response body when replaying after a refresh", async () => {
    const stale = streamingResponse(401);
    const { fetchFn } = fakeFetch(stale.response, new Response("ok", { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send(
      { path: "/x" },
      { session, refresh: async () => ({ session: fresh, setCookies: [] }) },
    );
    expect(res.status).toBe(200);
    expect(stale.cancelled()).toBe(true);
  });

  it("cancels the discarded response body when retrying a 5xx", async () => {
    const stale = streamingResponse(503);
    const { fetchFn } = fakeFetch(stale.response, new Response("ok", { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send({ path: "/x" }, noRefresh);
    expect(res.status).toBe(200);
    expect(stale.cancelled()).toBe(true);
  });

  it("still reads the body of the response it returns", async () => {
    const kept = streamingResponse(200);
    const { fetchFn } = fakeFetch(kept.response);
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    expect((await proxy.send({ path: "/x" }, noRefresh)).body).toBe("payload");
    expect(kept.cancelled()).toBe(false);
  });

  it("fails as soon as the caller aborts and never retries", async () => {
    const calls: (AbortSignal | undefined | null)[] = [];
    const fetchFn = ((_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.signal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;
    const controller = new AbortController();
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const pending = proxy.send({ path: "/x", signal: controller.signal }, noRefresh);
    controller.abort();
    await expect(pending).rejects.toThrow(/abort/i);
    expect(calls).toHaveLength(1);
  });

  it("stops retrying once the overall time budget is spent", async () => {
    const { fetchFn, calls } = fakeFetch(
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
    );
    const proxy = createAbpProxy({
      baseUrl: "https://abp.example",
      fetchFn,
      totalTimeoutMs: 20,
    });
    await expect(proxy.send({ path: "/x" }, noRefresh)).rejects.toThrow();
    // 首次退避已是 100ms，20ms 的预算在其间耗尽 → 只发出过第一次请求。
    expect(calls).toHaveLength(1);
  });

  it("exposes only content-negotiation headers and drops the upstream Set-Cookie", async () => {
    const upstream = new Response("ok", {
      status: 200,
      headers: {
        "content-type": "application/json",
        etag: 'W/"v1"',
        "cache-control": "no-store",
        "www-authenticate": 'Bearer error="invalid_token"',
        server: "Kestrel/8.0",
      },
    });
    upstream.headers.append("set-cookie", ".AspNetCore.Identity=steal; Path=/; HttpOnly");
    const { fetchFn } = fakeFetch(upstream);
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    const res = await proxy.send({ path: "/x" }, noRefresh);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("etag")).toBe('W/"v1"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(res.headers.has("www-authenticate")).toBe(false);
    expect(res.headers.has("server")).toBe(false);
  });

  it("anonymous request (null session) carries no Authorization header", async () => {
    const { fetchFn, calls } = fakeFetch(new Response(null, { status: 200 }));
    const proxy = createAbpProxy({ baseUrl: "https://abp.example", fetchFn });
    await proxy.send({ path: "/x" }, { session: null, refresh: async () => null });
    expect(new Headers(calls[0]?.init?.headers).has("Authorization")).toBe(false);
  });
});
