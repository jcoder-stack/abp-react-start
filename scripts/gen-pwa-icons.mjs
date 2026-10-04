// 用法：node scripts/gen-pwa-icons.mjs
// 换品牌时改 examples/starter/public/app-icon.svg（BrandMark 的静态版）后重跑，把产物提交。
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "examples/starter/public/app-icon.svg"), "utf8");
const outDirs = [join(root, "registry/assets/pwa"), join(root, "examples/starter/public/pwa")];

/** `any` 图标保留圆角透明边；maskable 与 apple-touch 由系统自己裁形，必须满底无圆角。 */
const fullBleed = source.replace(/\srx="[\d.]+"/, "");
const icons = [
  { file: "icon-192.png", size: 192, svg: source, transparent: true },
  { file: "icon-512.png", size: 512, svg: source, transparent: true },
  { file: "icon-maskable-512.png", size: 512, svg: fullBleed, transparent: false },
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed, transparent: false },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of icons) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    const svg = icon.svg.replace(/width="\d+" height="\d+"/, `width="${icon.size}" height="${icon.size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    for (const dir of outDirs) {
      mkdirSync(dir, { recursive: true });
      await page.locator("svg").screenshot({ path: join(dir, icon.file), omitBackground: icon.transparent });
    }
  }
} finally {
  await browser.close();
}
console.log(`wrote ${icons.length} icons to ${outDirs.join(" and ")}`);
