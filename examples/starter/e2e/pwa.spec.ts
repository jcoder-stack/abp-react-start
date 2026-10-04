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

test("renders one theme-color meta per color scheme, already in the server-rendered head", async ({
  page,
  request,
}) => {
  const head = (await (await request.get("/")).text()).split("</head>")[0] ?? "";
  expect(head.match(/<meta name="theme-color"[^>]*>/g)).toHaveLength(2);

  await page.goto("/");
  const metas = await page.locator('meta[name="theme-color" i]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      media: node.getAttribute("media"),
      content: node.getAttribute("content"),
    })),
  );
  expect(metas).toHaveLength(2);
  expect(metas).toEqual(
    expect.arrayContaining([
      { media: "(prefers-color-scheme: light)", content: "#f6f9fd" },
      { media: "(prefers-color-scheme: dark)", content: "#050e1e" },
    ]),
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
