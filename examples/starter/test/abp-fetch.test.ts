import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server-fns", () => ({ abpRequestFn: vi.fn(), abpUploadFn: vi.fn() }));
vi.mock("@/api/mutator", () => ({ configureAbpMutator: vi.fn() }));

import { abpFetch } from "@/api/abp-fetch";
import { abpRequestFn, abpUploadFn } from "@/auth/server-fns";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("abpFetch", () => {
  it("handles 204 No Content response without throwing", async () => {
    vi.mocked(abpRequestFn).mockResolvedValue({
      status: 204,
      contentType: null,
      body: "",
    });
    const res = await abpFetch("/books/1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("parses 200 OK response with JSON body", async () => {
    vi.mocked(abpRequestFn).mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: '{"a":1}',
    });
    const res = await abpFetch("/books", { method: "GET" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ a: 1 });
  });
});

describe("abpFetch non-text bodies", () => {
  const ok = { status: 204, contentType: null, body: "" };

  it("keeps a string body on the JSON request fn", async () => {
    vi.mocked(abpRequestFn).mockResolvedValue(ok);
    await abpFetch("/books", { method: "POST", body: '{"a":1}' });
    expect(vi.mocked(abpRequestFn)).toHaveBeenCalledOnce();
    expect(vi.mocked(abpUploadFn)).not.toHaveBeenCalled();
  });

  it("routes a FormData body to the upload fn instead of dropping it", async () => {
    vi.mocked(abpUploadFn).mockResolvedValue(ok);
    const form = new FormData();
    form.append("file", new Blob(["a,b"], { type: "text/csv" }), "import.csv");
    await abpFetch("/books/import", { method: "POST", body: form });
    expect(vi.mocked(abpRequestFn)).not.toHaveBeenCalled();
    const sent = vi.mocked(abpUploadFn).mock.calls[0]?.[0]?.data as FormData;
    expect(sent.get("file")).toBeInstanceOf(File);
  });

  // 元数据平铺成 __path/__method 会和调用方自己的字段撞名；收在一个字段里，
  // 撞名面从「若干个保留字」缩到一个。
  it("carries path, method and headers in a single meta field", async () => {
    vi.mocked(abpUploadFn).mockResolvedValue(ok);
    const form = new FormData();
    form.append("file", new Blob(["x"]), "x.bin");
    await abpFetch("/books/import", {
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      body: form,
    });
    const sent = vi.mocked(abpUploadFn).mock.calls[0]?.[0]?.data as FormData;
    const meta = JSON.parse(String(sent.get("__abp")));
    expect(meta.path).toBe("/books/import");
    expect(meta.method).toBe("POST");
    expect(meta.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(meta.kind).toBe("form");
  });

  it("routes raw bytes to the upload fn and marks them as a byte body", async () => {
    vi.mocked(abpUploadFn).mockResolvedValue(ok);
    await abpFetch("/files/1", {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3]),
    });
    const sent = vi.mocked(abpUploadFn).mock.calls[0]?.[0]?.data as FormData;
    const meta = JSON.parse(String(sent.get("__abp")));
    expect(meta.kind).toBe("bytes");
    expect(meta.headers["content-type"]).toBe("application/octet-stream");
    expect(sent.get("__abpBody")).toBeInstanceOf(File);
  });
});
