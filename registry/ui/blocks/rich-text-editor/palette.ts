import { Highlight } from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";

/**
 * 文字色与高亮色的预设色板。存进 HTML 的是色板名（`data-color="red"`），不是色值——
 * 色值由 `--rte-text-<名>` / `--rte-highlight-<名>` 令牌按亮/暗主题给出，换主题不必迁移数据，
 * 后端白名单也只需放行 `data-color` 一个属性。
 */
export const RICH_TEXT_PALETTE = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
] as const;

export type RichTextPaletteColor = (typeof RICH_TEXT_PALETTE)[number];

export function isPaletteColor(value: unknown): value is RichTextPaletteColor {
  return typeof value === "string" && (RICH_TEXT_PALETTE as readonly string[]).includes(value);
}

/** 色板外的名字（手改的 HTML、旧数据、别处粘来的 `style="color:…"`）一律视为无色，不落进文档。 */
function parsePaletteAttribute(element: HTMLElement): RichTextPaletteColor | null {
  const name = element.getAttribute("data-color");
  return isPaletteColor(name) ? name : null;
}

function renderPaletteAttribute(attributes: Record<string, unknown>) {
  return isPaletteColor(attributes.color) ? { "data-color": attributes.color } : {};
}

/**
 * 只认带色板名的 `<span>`。原版 TextStyle 认的是带 `style` 的 span，外部粘来的
 * `style="color:…"` 会留下一层没有任何属性的空 `<span>`；这里色板外的 span 直接拆掉。
 */
export const PaletteTextStyle = TextStyle.extend({
  parseHTML() {
    return [
      {
        tag: "span",
        consuming: false,
        getAttrs: (element) => (isPaletteColor(element.getAttribute("data-color")) ? {} : false),
      },
    ];
  },
});

/** 沿用 Color 的 `setColor` / `unsetColor` 命令，只把渲染从 `style="color:…"` 换成 `data-color`。 */
export const PaletteColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: parsePaletteAttribute,
            renderHTML: renderPaletteAttribute,
          },
        },
      },
    ];
  },
});

/** 多色高亮；与 PaletteColor 同理只存色板名，`<mark>` 不带色时用主题的 `highlight` 令牌。 */
export const PaletteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: parsePaletteAttribute,
        renderHTML: renderPaletteAttribute,
      },
    };
  },
}).configure({ multicolor: true });
