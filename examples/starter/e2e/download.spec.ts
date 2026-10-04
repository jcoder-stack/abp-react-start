import { expect, test } from "@playwright/test";

test("streams an ABP attachment through /api/stream without buffering it", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const started = performance.now();
    const res = await fetch("/api/stream/api/app/e2e-file/download");
    const reader = res.body?.getReader();
    const bytes: number[] = [];
    let firstChunkAt = -1;
    for (;;) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      if (firstChunkAt < 0) firstChunkAt = performance.now() - started;
      bytes.push(...chunk.value);
    }
    return {
      status: res.status,
      disposition: res.headers.get("content-disposition"),
      cacheControl: res.headers.get("cache-control"),
      bytes,
      firstChunkAt,
      total: performance.now() - started,
    };
  });
  expect(result.status).toBe(200);
  expect(result.bytes).toEqual([0x00, 0xff, 0x10, 0x20, 0x30]);
  expect(result.disposition).toBe("attachment; filename*=UTF-8''%E5%91%98%E5%B7%A5.bin");
  expect(result.cacheControl).toBe("private, no-store");
  // mock 在两块之间停 1.5s：首块明显早于结束，说明代理与 server route 都没有攒整份。
  expect(result.total).toBeGreaterThan(1400);
  expect(result.firstChunkAt).toBeLessThan(result.total - 1000);
});

test("passes an ABP error envelope through with its status", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/stream/api/app/e2e-file/forbidden");
    return { status: res.status, body: await res.json() };
  });
  expect(result).toEqual({ status: 403, body: { error: { message: "没有权限" } } });
});

test("refuses a cross-site request", async ({ request }) => {
  const res = await request.get("/api/stream/api/app/e2e-file/download", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(res.status()).toBe(403);
});
