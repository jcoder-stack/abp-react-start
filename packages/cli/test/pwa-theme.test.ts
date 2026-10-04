import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { oklchToRgb, parseBlock } from "./theme-contrast";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const theme = read("../templates/app-theme.css");

function backgroundHex(selector: ":root" | ".dark"): string {
  const background = parseBlock(theme, selector).get("background");
  if (background === undefined) throw new Error(`no --background under ${selector}`);
  // oklchToRgb 返回 0–255 的 [r, g, b]。
  return `#${oklchToRgb(background)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

// manifest 与 meta 读不了 CSS 变量，只能写死 hex。改了主题的 --background 却没改这里，装成 App 后
// 标题栏和启动屏会是旧颜色——这个测试就是那道提醒。
describe("pwa colors follow the theme", () => {
  it("manifest theme and background colors equal the light --background", () => {
    const manifest = JSON.parse(
      read("../../../registry/ui/blocks/pwa/public/manifest.webmanifest"),
    );
    expect(manifest.theme_color).toBe(backgroundHex(":root"));
    expect(manifest.background_color).toBe(backgroundHex(":root"));
  });

  it("theme-color metas equal the light and dark --background", () => {
    const feature = read("../../../registry/ui/blocks/pwa/feature.tsx");
    expect(feature).toContain(
      `content: "${backgroundHex(":root")}", media: "(prefers-color-scheme: light)"`,
    );
    expect(feature).toContain(
      `content: "${backgroundHex(".dark")}", media: "(prefers-color-scheme: dark)"`,
    );
  });
});
