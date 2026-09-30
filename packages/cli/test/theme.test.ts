import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, type Oklch, oklchToRgb, over, parseBlock } from "./theme-contrast";

const TEMPLATE = readFileSync(new URL("../templates/app-theme.css", import.meta.url), "utf8");
const STARTER = readFileSync(
  new URL("../../../examples/starter/src/styles.css", import.meta.url),
  "utf8",
);

const TEXT = 4.5;
const NON_TEXT = 3.0;
/** 徽标是「文字压在自己那层 15% 淡底上」，用户读到的是药丸内部那组对比，不是文字对卡片。 */
const PILL_ALPHA = 0.15;

const PAIRS: Array<[string, string, number]> = [
  ["foreground", "background", TEXT],
  ["foreground", "card", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["primary-foreground", "primary-hover", TEXT],
  ["highlight-foreground", "highlight", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["foreground", "row-selected", TEXT],
  ["sidebar-foreground", "sidebar", TEXT],
  ["sidebar-muted-foreground", "sidebar", TEXT],
  ["sidebar-accent-foreground", "sidebar-accent", TEXT],
  // 承担 3:1 的是焦点实边框与主按钮边界，不是那圈半透明光晕
  ["ring", "card", NON_TEXT],
  ["ring", "background", NON_TEXT],
  ["primary", "card", NON_TEXT],
  ["sidebar-indicator", "sidebar-accent", NON_TEXT],
  // 标识砖上的播放键：图形元素，对砖面按非文本 3:1
  ["brand-accent", "primary", NON_TEXT],
];

const STATUSES = ["success", "warning", "error", "info", "neutral"] as const;

const THEMES: Array<[string, Map<string, Oklch>]> = [
  ["浅色", parseBlock(TEMPLATE, ":root")],
  ["暗色", parseBlock(TEMPLATE, ".dark")],
];

function token(theme: Map<string, Oklch>, name: string): Oklch {
  const v = theme.get(name);
  if (!v) throw new Error(`缺令牌 --${name}`);
  return v;
}

describe.each(THEMES)("主题令牌（%s）", (_name, theme) => {
  const rgb = (k: string) => oklchToRgb(token(theme, k));

  it.each(PAIRS)("%s 压在 %s 上达到 %s:1", (fg, bg, need) => {
    expect(contrast(rgb(fg), rgb(bg))).toBeGreaterThanOrEqual(need);
  });

  it.each(STATUSES)("状态药丸 %s 的文字压在自己的 15%% 淡底上可读", (s) => {
    const c = rgb(`status-${s}`);
    expect(contrast(c, over(c, rgb("card"), PILL_ALPHA))).toBeGreaterThanOrEqual(TEXT);
  });

  it("单选 toggle 选中态的 55% 墨边对页底达到 3:1", () => {
    const edge = over(rgb("foreground"), rgb("background"), 0.55);
    expect(contrast(edge, rgb("background"))).toBeGreaterThanOrEqual(NON_TEXT);
  });

  // 对比度看不见这一组：曾有暗色侧栏比内容还亮、当前项比轨还暗，而每一对对比度都达标。
  it("导航轨比内容沉一档，当前项比轨浮一档", () => {
    const L = (k: string) => token(theme, k).l;
    expect(L("sidebar")).toBeLessThan(L("background"));
    expect(L("background")).toBeLessThan(L("card"));
    expect(L("sidebar-accent")).toBeGreaterThan(L("sidebar"));
  });
});

it("starter 的 styles.css 与主题模板逐字一致", () => {
  expect(STARTER).toBe(TEMPLATE);
});
