import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAbpFile } from "@/api/abp-download";
import { AbpApiError } from "@/api/mutator";

function respondWith(response: Response) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** 分两块吐出的正文，用来观察逐块进度。 */
function chunked(...parts: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(new Uint8Array(part));
      controller.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchAbpFile", () => {
  it("requests the generated URL under the stream route and names the file", async () => {
    const fetchMock = respondWith(
      new Response(new Uint8Array([0x25, 0x50]), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename*=UTF-8''%E7%AE%80%E5%8E%86.pdf",
        },
      }),
    );
    const file = await fetchAbpFile("/api/app/file/1/download");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/stream/api/app/file/1/download");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("简历.pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50]));
  });

  it("reports progress chunk by chunk against Content-Length", async () => {
    respondWith(
      new Response(chunked([1, 2], [3]), { status: 200, headers: { "Content-Length": "3" } }),
    );
    const onProgress = vi.fn();
    const blob = await fetchAbpFile("/x", { onProgress });
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { loaded: 0, total: 3 },
      { loaded: 2, total: 3 },
      { loaded: 3, total: 3 },
    ]);
    expect(blob.size).toBe(3);
  });

  it("reports an unknown total when the length is not given", async () => {
    respondWith(new Response(chunked([1]), { status: 200 }));
    const onProgress = vi.fn();
    await fetchAbpFile("/x", { onProgress });
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 1, total: null });
  });

  it("throws an AbpApiError carrying the ABP error envelope", async () => {
    const envelope = { error: { message: "没有权限" } };
    respondWith(Response.json(envelope, { status: 403 }));
    const error = await fetchAbpFile("/api/app/file/1/download").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AbpApiError);
    expect((error as AbpApiError).status).toBe(403);
    expect((error as AbpApiError).body).toEqual(envelope);
  });
});
