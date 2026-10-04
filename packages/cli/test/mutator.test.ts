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

  it("returns a byte-identical Blob for a binary download instead of decoding it as text", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    configureAbpMutator({
      fetchFn: vi.fn(
        async () =>
          new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf" } }),
      ),
    });
    const result = await abpMutator<Blob>("/api/app/file/1/download", { method: "GET" });
    expect(result).toBeInstanceOf(Blob);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
  });

  it("returns an attachment as a File named after the RFC 5987 filename*", async () => {
    configureAbpMutator({
      fetchFn: vi.fn(
        async () =>
          new Response("a,b", {
            status: 200,
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition":
                "attachment; filename=staff.csv; filename*=UTF-8''%E5%91%98%E5%B7%A5.csv",
            },
          }),
      ),
    });
    const result = await abpMutator<Blob>("/api/app/staff/export", { method: "GET" });
    expect(result).toBeInstanceOf(File);
    expect((result as File).name).toBe("员工.csv");
    expect(await result.text()).toBe("a,b");
  });

  it("falls back to the quoted plain filename when filename* is absent", async () => {
    configureAbpMutator({
      fetchFn: vi.fn(
        async () =>
          new Response(new Uint8Array([1]), {
            status: 200,
            headers: { "Content-Disposition": 'attachment; filename="report 2026.xlsx"' },
          }),
      ),
    });
    const result = await abpMutator<Blob>("/x", { method: "GET" });
    expect((result as File).name).toBe("report 2026.xlsx");
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
