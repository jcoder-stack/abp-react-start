import { expect, test } from "@playwright/test";

test("serves a manifest the page links to", async ({ page, request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ display: "standalone", start_url: "/" });
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});

test("registers the service worker, then shows the offline page and never caches HTML or API responses", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const scriptURL = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).active?.scriptURL,
  );
  expect(scriptURL).toMatch(/\/sw\.js$/);

  // clients.claim() 之后这一页已受控；再加载一次让 /assets 进缓存。
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cached).toContain("/offline.html");
  expect(cached.some((path) => path.startsWith("/assets/"))).toBe(true);
  expect(cached.filter((path) => path !== "/offline.html" && !path.startsWith("/assets/"))).toEqual(
    [],
  );

  await context.setOffline(false);
});
