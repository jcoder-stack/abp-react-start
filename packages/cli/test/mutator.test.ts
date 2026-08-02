import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AbpApiError,
  abpMutator,
  configureAbpMutator,
  resetAbpMutator,
} from "../templates/mutator";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("abpMutator", () => {
  beforeEach(() => configureAbpMutator({ baseUrl: "https://api", fetchFn: undefined }));

  it("GET: prepends baseUrl to the pre-built url and passes the init through unchanged", async () => {
    const fetchFn = vi.fn(async () => json({ ok: true }));
    configureAbpMutator({ fetchFn });
    await abpMutator("/api/identity/users?SkipCount=0&MaxResultCount=10", { method: "GET" });
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://api/api/identity/users?SkipCount=0&MaxResultCount=10",
    );
    expect(fetchFn.mock.calls[0]?.[1]).toEqual({ method: "GET" });
  });

  it("POST: passes body/headers through unchanged and returns the parsed JSON", async () => {
    const fetchFn = vi.fn(async () => json({ id: "1" }));
    configureAbpMutator({ fetchFn });
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: "alice" }),
    };
    const result = await abpMutator<{ id: string }>("/api/identity/users", init);
    expect(result).toEqual({ id: "1" });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://api/api/identity/users");
    expect(fetchFn.mock.calls[0]?.[1]).toEqual(init);
  });

  it("throws an AbpApiError carrying the status and the parsed ABP error envelope", async () => {
    const envelope = {
      error: {
        message: "您的请求无效！",
        validationErrors: [{ message: "字段Name不可为空.", members: ["name"] }],
      },
    };
    configureAbpMutator({ fetchFn: vi.fn(async () => json(envelope, 400)) });
    const err = await abpMutator("/api/app/book", { method: "POST" }).catch((e) => e);
    expect(err).toBeInstanceOf(AbpApiError);
    expect(err.status).toBe(400);
    expect(err.body).toEqual(envelope);
  });

  it("throws an AbpApiError with undefined body when the error response is not JSON", async () => {
    configureAbpMutator({ fetchFn: vi.fn(async () => new Response("boom", { status: 502 })) });
    const err = await abpMutator("/x", { method: "GET" }).catch((e) => e);
    expect(err).toBeInstanceOf(AbpApiError);
    expect(err.status).toBe(502);
    expect(err.body).toBeUndefined();
  });

  it("returns undefined for 204 responses", async () => {
    configureAbpMutator({ fetchFn: vi.fn(async () => new Response(null, { status: 204 })) });
    await expect(abpMutator("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("returns the raw string for a 2xx text/plain response (e.g. ABP's timezone endpoint)", async () => {
    configureAbpMutator({
      fetchFn: vi.fn(
        async () =>
          new Response("Unspecified", {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }),
      ),
    });
    const result = await abpMutator<string>("/api/setting-management/timezone", { method: "GET" });
    expect(result).toBe("Unspecified");
  });

  it("resetAbpMutator clears the configuration (e.g. the baseUrl prefix)", async () => {
    const fetchFn = vi.fn(async () => json({ ok: true }));
    configureAbpMutator({ baseUrl: "https://api", fetchFn });
    resetAbpMutator();
    configureAbpMutator({ fetchFn });
    await abpMutator("/x", { method: "GET" });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/x");
  });
});
