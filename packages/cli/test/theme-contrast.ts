export type Oklch = { l: number; c: number; h: number };
export type Rgb = [number, number, number];

/** 取 `selector {` 到下一个行首 `}` 之间的 `--x: oklch(l c h)`；带 alpha 或 var()/color-mix() 的值不收。 */
export function parseBlock(css: string, selector: string): Map<string, Oklch> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`主题文件里找不到 ${selector}`);
  const end = css.indexOf("\n}", start + 1);
  const body = css.slice(start, end);
  const out = new Map<string, Oklch>();
  for (const [, name, l, c, h] of body.matchAll(
    /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    if (name && l && c && h) out.set(name, { l: Number(l), c: Number(c), h: Number(h) });
  }
  return out;
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((v) => {
    const x = Math.max(0, Math.min(1, v));
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  }) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 把半透明前景压到背景上得到的实色。 */
export function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((v, i) => Math.round(v * alpha + (bg[i] ?? 0) * (1 - alpha))) as Rgb;
}
