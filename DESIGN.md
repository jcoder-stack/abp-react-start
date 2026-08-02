---
version: alpha
name: ABP React Start
description: A Linear-informed baseline for a shadcn/ui + TanStack Start app, carrying its own brand blue. Cool near-black surfaces, one chromatic accent, hairline borders, tight tracking, Inter Variable at 400/510/590. Token names mirror shadcn's semantic layer so the front matter maps 1:1 onto the theme file.
colors:
  # --- canonical set = LIGHT mode (shadcn :root). Dark overrides are tabled in ## Colors. ---
  background: "oklch(0.978 0.001 286)"
  foreground: "oklch(0.19 0.004 286)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.19 0.004 286)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.19 0.004 286)"
  primary: "oklch(0.55 0.21 264)"
  primary-hover: "oklch(0.50 0.21 264)"
  primary-focus: "oklch(0.55 0.19 264)"
  # --- 前景用的亮强调：链接、活动态、选中项。比 primary 亮一档、饱和度高约三成 ---
  primary-bright: "oklch(0.52 0.21 264)"
  primary-foreground: "oklch(0.985 0 0)"
  # --- 品牌标识专用（BrandMark 的内联 SVG）；brand-mark 与 primary 同色相但刻意不同值，见 ## Colors ---
  brand-mark: "oklch(0.52 0.22 264)"
  brand-spark: "oklch(0.750 0.167 51)"
  brand-ink: "oklch(0.259 0.052 263)"
  brand-ink-contrast: "oklch(1 0 0)"
  secondary: "oklch(0.968 0.002 286)"
  secondary-foreground: "oklch(0.24 0.005 286)"
  muted: "oklch(0.968 0.002 286)"
  muted-foreground: "oklch(0.505 0.01 286)"
  # --- 文字四级阶梯（Linear ink ladder 的浅色映射）；foreground → muted → subtle → tertiary ---
  foreground-subtle: "oklch(0.60 0.012 286)"
  foreground-tertiary: "oklch(0.68 0.010 286)"
  accent: "oklch(0.968 0.002 286)"
  accent-foreground: "oklch(0.24 0.005 286)"
  destructive: "oklch(0.505 0.20 25)"
  border: "oklch(0.92 0.003 286)"
  border-strong: "oklch(0.86 0.004 286)"
  border-subtle: "oklch(0.955 0.002 286)"
  input: "oklch(0.92 0.003 286)"
  ring: "oklch(0.55 0.19 264)"
  # --- 叠加面：弹层压在卡片之上时再抬一级，避免两层同色糊在一起 ---
  surface-overlay: "oklch(1 0 0)"
  # --- status tokens (semantic state; dot/text color, tinted bg derived at ~14% alpha) ---
  status-success: "oklch(0.55 0.13 155)"
  status-warning: "oklch(0.62 0.13 70)"
  status-error: "oklch(0.55 0.20 25)"
  status-info: "oklch(0.55 0.15 255)"
  status-neutral: "oklch(0.55 0.01 286)"
  # --- sidebar surfaces (recessed navigation rail; own token group) ---
  sidebar: "oklch(0.967 0.002 286)"
  sidebar-foreground: "oklch(0.30 0.005 286)"
  sidebar-primary: "oklch(0.55 0.21 264)"
  sidebar-primary-foreground: "oklch(0.985 0 0)"
  sidebar-accent: "oklch(0.94 0.004 286)"
  sidebar-accent-foreground: "oklch(0.19 0.004 286)"
  sidebar-border: "oklch(0.91 0.003 286)"
  sidebar-ring: "oklch(0.55 0.19 264)"
  row-selected: "oklch(0.955 0.014 264)"
typography:
  display-xl:
    fontFamily: Inter Variable
    fontSize: 4.5rem
    fontWeight: 510
    lineHeight: 1.0
    letterSpacing: -0.022em
  display-lg:
    fontFamily: Inter Variable
    fontSize: 3.5rem
    fontWeight: 510
    lineHeight: 1.0
    letterSpacing: -0.022em
  display:
    fontFamily: Inter Variable
    fontSize: 2.5rem
    fontWeight: 510
    lineHeight: 1.05
    letterSpacing: -0.026em
  h1:
    fontFamily: Inter Variable
    fontSize: 2rem
    fontWeight: 400
    lineHeight: 1.13
    letterSpacing: -0.022em
  h2:
    fontFamily: Inter Variable
    fontSize: 1.5rem
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: -0.012em
  h3:
    fontFamily: Inter Variable
    fontSize: 1.25rem
    fontWeight: 590
    lineHeight: 1.33
    letterSpacing: -0.012em
  body-lg:
    fontFamily: Inter Variable
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: -0.011em
  body-md:
    fontFamily: Inter Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.013em
  body-sm:
    fontFamily: Inter Variable
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.01em
  label:
    fontFamily: Inter Variable
    fontSize: 0.8125rem
    fontWeight: 510
    lineHeight: 1.2
    letterSpacing: -0.01em
  label-caps:
    fontFamily: Inter Variable
    fontSize: 0.6875rem
    fontWeight: 590
    lineHeight: 1
    letterSpacing: 0.08em
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  section: 96px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 14px
    height: 34px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 14px
    height: 34px
  button-secondary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: 14px
    height: 34px
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 36px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: 20px
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 9px
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.full}"
    padding: 9px
  popover:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.lg}"
    padding: 5px
  dialog:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    titleTypography: "{typography.body-lg}"
    titleWeight: 590
    rounded: "{rounded.xl}"
    padding: 22px
  progress-track:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.full}"
    height: 7px
  helper-text:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body-sm}"
  sidebar-item:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px
    height: 32px
  sidebar-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 8px
  sidebar-label:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label-caps}"
  table-header:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label-caps}"
    padding: 14px
    height: 40px
  table-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    padding: 14px
    height: 48px
  table-row-selected:
    backgroundColor: "{colors.row-selected}"
    textColor: "{colors.foreground}"
  filter-chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 10px
    height: 32px
  search-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 11px
    height: 34px
  pagination-item:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 28px
  pagination-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 28px
  hero-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: 24px
  feature-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  cta-banner:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.h2}"
    rounded: "{rounded.lg}"
    padding: 48px
  changelog-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 24px 0
  site-footer:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body-sm}"
    padding: 64px 32px
  top-nav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    height: 56px
  icon-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: 34px
    width: 34px
---

## Overview

ABP React Start is the operating temperature of a focused tool, not a marketing page. The mood is quiet and engineered: cool near-black surfaces in dark mode, warm-neutral whites in light mode, and a single brand blue (`oklch(0.55 0.21 264)`) reserved for the one thing the user should act on — the same hue the product mark carries, so the interface and the logo read as one thing. Everything else — borders, dividers, metadata — recedes to hairline weight so hierarchy comes from spacing and type, never from heavy chrome.

The system is built for a back-office productivity surface: data tables, filters, search, status, dense lists, forms, and command menus. Text is small by web standards (13–14px is the workhorse), tracking is tight, and radii are modest (6–8px). Restraint is the brief: if a screen looks busy, remove color and weight before adding structure. The table is the hero component — most screens are a filtered, sortable, selectable table of records — so it gets first-class tokens and rules (see Components).

This file is dual-mode. The front-matter tokens are the **light** set and match shadcn's `:root`; the **dark** overrides live in the Colors table below and map to shadcn's `.dark` selector. Token names are deliberately identical to shadcn/ui's semantic layer so `export --format css-tailwind` drops straight into a Tailwind v4 project.

## Colors

The palette is a near-neutral slate ramp (a whisper of blue at hue 286) plus one chromatic accent — the brand blue at hue 264. Neutrals never go fully chromatic and the accent never gets diluted across the UI: one blue, one job.

- **background / foreground** — The page and its default text. Light is a warm off-white, not `#fff`; dark is a cool near-black (`oklch(0.145)`), never pure `#000`, which reads harsh on OLED.
- **card / popover** — Raised surfaces. In dark mode they sit one step *lighter* than the background so elevation reads without shadows doing the work.
- **brand-mark** — Same hue and same origin as `primary`, but deliberately *not* the same value. The mark's inner triangle renders at roughly 8×9px in the sidebar, and at that size the area effect (small patches of colour read lighter than large ones) compounds with anti-aliasing along the diagonal edges, so reusing `primary` verbatim makes the mark look a step paler than the buttons. It is compensated optically, and the two themes compensate in opposite directions: a light ground dilutes the edge pixels toward white, so the mark goes darker; a dark ground pulls them down, so the mark goes lighter. Matching numbers would be the wrong kind of consistency here.
- **primary** — The brand blue, hue 264. It is the product's own colour rather than a borrowed one, and the mark uses the same token, so logo and interface never drift apart.

  Blue behaves differently from violet in sRGB: the gamut narrows sharply as lightness rises, so the dark theme cannot simply lift the value the way violet does — past about 0.65 the chroma clips. Dark therefore holds a similar lightness and leans on chroma instead. Every rung is measured: `primary` carries white text at 5.09:1 in light and 4.65:1 in dark, `primary-bright` reads as a link at 5.48:1 and 6.24:1, and the focus ring clears 3:1 against both grounds.
- **primary-hover** — A shade darker in light, a shade lighter in dark; the button always brightens toward the pointer.
- **secondary / muted / accent** — The quiet trio. `secondary` backs low-emphasis buttons, `muted` backs inputs and track fills, `accent` is the hover wash on ghost items. Their `-foreground` pairs carry text.
- **muted-foreground** — Metadata, placeholders, captions. Tuned to clear WCAG AA on its surface while still reading as "secondary."
- **destructive** — Reserved strictly for irreversible actions and error states. Never decorative.
- **border / input / ring** — `border` and `input` are the same hairline value; `ring` reuses `primary` so focus is unmistakably the accent.
- **primary-bright** — The accent as *foreground*: links, the active nav item, a selected row's emphasis. It runs a rung lighter and about a third more saturated than `primary`, because an accent tuned to sit behind white text does not have the contrast to *be* the text. One hue, two jobs: `primary` fills, `primary-bright` marks.
- **primary-focus** — A slightly deeper accent reserved for focus rings. The ring sits directly on the control's own border, and painting both in the same value fuses them into one thick edge.

### The three ladders

Three places outgrow a single token, so each gets a ladder. **Pick by asking "which rung is this?" — never by grabbing whichever value looks close.**

**Text, four rungs** (`foreground` → `muted-foreground` → `foreground-subtle` → `foreground-tertiary`): body and headings / metadata and placeholders / weaker supporting copy / disabled and footnotes. A dense back-office screen routinely shows three rungs at once; with only two, "secondary" has to carry everything from subtitle to disabled and the screen flattens into uniform grey.

**Surface, four rungs** (`background` → `card`·`popover` → `accent`·`muted` → `surface-overlay`): page / cards and popovers / hover washes and inset blocks / layers stacked *on top of* a card. In dark mode each rung sits one step lighter than the one beneath it, and **skipping a rung is not allowed** — it invents depth that isn't there.

**Border, three rungs** (`border-subtle` → `border` → `border-strong`): dividers inside one block / the default card and control edge / edges that must assert themselves (focus, the outer rim of a nested panel). All three are 1px; only lightness changes. Weight is never the emphasis knob.

**Dark mode overrides** (shadcn `.dark`). Same token names, swapped values:

| Token | Dark value |
| --- | --- |
| background | `oklch(0.145 0.004 286)` |
| foreground | `oklch(0.96 0.003 286)` |
| card / popover | `oklch(0.174 0.005 286)` |
| card-foreground / popover-foreground | `oklch(0.96 0.003 286)` |
| primary | `oklch(0.57 0.21 264)` |
| primary-hover | `oklch(0.63 0.18 264)` |
| primary-foreground | `oklch(0.985 0 0)` |
| secondary / accent | `oklch(0.24 0.006 286)` |
| secondary-foreground / accent-foreground | `oklch(0.96 0.003 286)` |
| muted | `oklch(0.21 0.006 286)` |
| muted-foreground | `oklch(0.68 0.012 286)` |
| destructive | `oklch(0.62 0.20 25)` |
| border / input | `oklch(0.27 0.006 286)` |
| border-strong | `oklch(0.327 0.011 286)` |
| border-subtle | `oklch(0.22 0.005 286)` |
| ring | `oklch(0.62 0.19 264)` |
| primary-focus | `oklch(0.62 0.19 264)` |
| primary-bright | `oklch(0.66 0.17 264)` |
| surface-hover | `oklch(0.278 0.007 286)` |
| foreground-subtle | `oklch(0.62 0.012 286)` |
| foreground-tertiary | `oklch(0.50 0.010 286)` |
| surface-overlay | `oklch(0.213 0.003 286)` |

Note the hover direction flips: in light mode `primary-hover` goes *darker*, in dark mode it goes *lighter*, so the button always brightens toward the pointer.

### Status colors

Status is its own five-tier semantic scale, separate from the accent so state never competes with "act here." This is a deliberate expansion beyond the reference: Linear's own surface carries only a success green, because an issue tracker expresses state through workflow icons rather than colour. A CRUD back-office has no such vocabulary — a tenant is active or suspended, a payment succeeded or failed — so the five tiers stay, held to the same discipline of never inventing a sixth. Each token is the **dot and text** color; the badge background is derived as the same color at ~14% alpha over the surface (implemented with `color-mix`, not a stored token). Keep exactly these five meanings — resist inventing per-feature colors.

- **status-success** (green) — active, paid, healthy, online, done.
- **status-info** (blue) — in-progress, processing, trialing, new.
- **status-warning** (amber) — needs attention, pending review, past due, degraded.
- **status-error** (red) — failed, rejected, offline, blocked.
- **status-neutral** (slate) — draft, archived, inactive, canceled, closed.

`status-error` and `destructive` share hue 25 but are **not** the same token: `status-error` (lighter, ~0.55) reads as a *state* on a tinted pill, while `destructive` (darker, ~0.505) is a *filled action* that must carry white text. Never use a status tint as a button, and never use `destructive` to label a row's state.

### Sidebar surfaces

The navigation rail is a distinct surface group. In **dark mode the sidebar sits a step *lighter* than the page background** (`oklch(0.172)` vs `0.145`) — the rail lifts off the canvas rather than sinking into it. That direction is deliberate and matches the surface ladder: the page is the deepest plane and every panel above it gains light. A recessed (darker) rail inverts the ladder and makes the navigation read as a hole in the page. In light mode the rail goes the other way, a hair *darker* than the content area, because there the page is already the lightest plane. `sidebar-accent` backs hover and the active item; `sidebar-primary` drives the active indicator bar and active icon; `sidebar-foreground` is intentionally softer than body `foreground` so nav labels sit quieter than content.

**Dark mode overrides** for the new tokens:

| Token | Dark value |
| --- | --- |
| status-success | `oklch(0.72 0.15 155)` |
| status-warning | `oklch(0.80 0.14 80)` |
| status-error | `oklch(0.68 0.19 25)` |
| status-info | `oklch(0.70 0.13 250)` |
| status-neutral | `oklch(0.68 0.012 286)` |
| sidebar | `oklch(0.172 0.003 286)` |
| sidebar-foreground | `oklch(0.74 0.01 286)` |
| sidebar-primary | `oklch(0.57 0.21 264)` |
| sidebar-accent | `oklch(0.22 0.006 286)` |
| sidebar-accent-foreground | `oklch(0.96 0.003 286)` |
| sidebar-border | `oklch(0.24 0.006 286)` |
| row-selected | `oklch(0.22 0.024 264)` |

## Typography

One family does almost everything: **Inter Variable**, chosen for its neutral engineering feel and excellent small-size legibility. Load the variable cut, not the static weights — the scale below depends on it. A mono face (**JetBrains Mono**) is used only for code, IDs, and keyboard hints. There is no separate display face — personality comes from weight and tracking, not from a second typeface.

The scale is compact and the tracking tightens as size grows: display and headings sit at `-0.02em` to `-0.035em`, body hovers near `-0.006em`, and only `label-caps` opens up (`+0.08em`) because it is set uppercase for eyebrows and column headers. Body weight is 400; anything that needs emphasis steps to 500, and headings to 600. Avoid 700 — it reads loud in this system.

- **display / h1 / h2 / h3** — Page titles down to card titles. Semibold, tight, short line-height.
- **body-md** — The default UI text at 14px. Most of the interface is set here.
- **body-sm** — Table cells, helper text, dense lists at 13px.
- **label** — Form labels and buttons (500 weight).
- **label-caps** — Uppercase section eyebrows and table headers only. Use sparingly.
- **mono** — `<kbd>` chips, commit hashes, code. Linear pairs its sans with Berkeley Mono; JetBrains Mono is the open substitute used here, matched at the same sizes (12–14px) and weight 400.

### Weight and OpenType

Three weights, and they are variable-font values rather than the usual round numbers:

- **400** — reading. Body copy, table cells, anything the eye moves through.
- **510** — emphasis and UI. Labels, buttons, the active nav item, the current row. Sitting a hair above 500 gives a nudge of emphasis without the visible thickening of a true medium; this is the workhorse.
- **590** — announcement. Headings and the rare piece of strong emphasis.
- **300** — the deliberate whisper. Only for copy that must be present but explicitly de-emphasised; never for anything a user needs to read carefully.

**Never 700.** Past ~590 the letterforms gain weight faster than hierarchy, and the page starts to shout.

Counter-intuitively, **the largest headings are the lightest**: display and the 32px/24px headings run at 400, and only the 20px heading climbs to 590. At display sizes the size and the negative tracking already carry all the hierarchy needed, and adding weight on top makes the block feel blunt. Weight is the tool for headings that are too small for size alone to separate them. If something needs more presence at 590, it needs more size or more space, not more ink.

Inter also ships stylistic sets, and two of them are part of the identity rather than decoration:

```css
font-feature-settings: "cv01", "ss03";
```

`cv01` swaps in the single-storey lowercase `a`; `ss03` cleans up several letterforms toward a more geometric read. Applied globally to every text node — without them this is generic Inter, with them it is this system's Inter.

### The small end of the scale

Most of a back-office screen lives between 11px and 15px, so that stretch gets its own rungs rather than being lumped into "small":

| Size | Weight | Tracking | Where it goes |
| --- | --- | --- | --- |
| 15px | 400 / 510 | -0.165px | Secondary body, descriptions under a title |
| 14px | 510 / 590 | -0.182px | Sub-labels, category headers, compact links |
| 13px | 400 / 510 | -0.13px | Metadata, timestamps, table cells, nav items |
| 12px | 400–590 | 0 | Button text, small labels, toolbar controls |
| 11px | 510 | 0 | Tiny labels, badge text |

Line heights follow the same logic in reverse: **1.0 at display, 1.13–1.33 through the headings, 1.5 for body, 1.6 where text needs to breathe** (descriptions, multi-line secondary copy). Tight leading at display is what lets a compressed headline read as one object; anything looser and it dissolves into separate lines.

Two things to read off this table. Tracking stays *slightly* negative down to 13px and only reaches 0 at 12px — the compression never fully lets go. And weight does more work than size in this range: 13px/510 against 13px/400 is what separates the active nav item from the rest of the list, without either changing size.

### Tracking, quantified

Negative tracking scales with size, not by taste: roughly **4% of the font size at display, tapering to 0 by body**. Linear's own marketing runs -3.0px at 80px (≈3.75%) and holds -0.05px at 16px; the ladder here is the same curve at back-office sizes.

### Latin and CJK do not share a scale

`label-caps` is specified at 11px uppercase, and that number only works for Latin script. Capitals have a cap-height of roughly 0.72 × the font size, while mixed-case text has an x-height of about 0.52 — the uppercase transform closes the gap, so 11px capitals and 13px mixed-case read as the same size. This is why the 11–12px uppercase table head is a settled convention in Western interfaces.

CJK has neither case nor that compensation. `text-transform: uppercase` is a no-op, ideographs occupy about 0.9 × the font size regardless, and 11px next to 13px is simply one step smaller. **In CJK locales the table head returns to 13px with no transform**, and the distinction is carried by weight and colour instead:

```css
:lang(zh) [data-slot="table-head"],
:lang(ja) [data-slot="table-head"],
:lang(ko) [data-slot="table-head"] {
  font-size: var(--text-sm);
  letter-spacing: normal;
  text-transform: none;
}
```

This requires `<html lang>` to track the active locale rather than being hardcoded — which it must anyway, for screen-reader pronunciation, line-breaking rules and font fallback.

### Tracking, quantified — continued

`label-caps` is the deliberate exception to negative tracking — it opens to **+0.08em**. Positive tracking against an otherwise negative-tracked system is what marks a string as taxonomy rather than content, which is why it is reserved for column headers and section eyebrows and never used for a sentence.

Weight tops out at 600. Linear's display type never reaches 700, and neither should this system: past 600 the letterforms thicken faster than they gain hierarchy, and the page starts to shout.

## Layout

Layout is built on an 8px rhythm (`spacing` scale). Content maxes out around a readable measure — roughly `1200px` for app shells, narrower for forms — and breathes with generous vertical spacing between sections rather than boxes and rules.

Structure reads through alignment and whitespace. A section is introduced by a `label-caps` eyebrow with a hairline rule trailing off to the edge, not by a heavy header bar. Grids are simple: cards sit in equal 2- or 3-column arrangements at `spacing.lg` (16px) gaps and collapse to a single column below ~820px. Group related controls tightly (`spacing.sm`) and separate unrelated groups loosely (`spacing.xl`); the gap size *is* the grouping signal.

The measured values are not all on the grid: 7px, 11px, 19px and 22px show up between the round numbers. They are optical corrections, not a second scale — a 1px border or an icon's own bearing shifts the perceived edge, and the odd value puts it back. Reach for one only when something *looks* misaligned at a grid value; never as a starting point.

Two rungs exist above the working scale and are used sparingly: `spacing.3xl` (48px) separates major regions inside one page, and `spacing.section` (96px) separates full sections on long marketing-style pages. Neither belongs inside a data-dense admin view — there, `spacing.xl` is already the loosest gap that still reads as "same screen".

## Elevation & Depth

Depth is carried by the surface ladder and hairline borders first, shadows last. In dark mode each raised layer sits one rung lighter than what's behind it, plus a 1px border and a barely-there top inset highlight (`inset 0 1px 0 oklch(1 0 0 / 0.04)`) that mimics a light source above.

| Level | Surface | Border | Shadow | Use |
| --- | --- | --- | --- | --- |
| 0 — flat | `background` | none | none | Page, list rows |
| 1 — raised | `card` / `popover` | `border` | inset highlight only | Cards, inputs, the table shell |
| 2 — inset | `accent` / `muted` | `border-subtle` | none | Hover washes, table head band, nested blocks |
| 3 — overlay | `surface-overlay` | `border-strong` | `0 12px 40px -8px oklch(0 0 0 / 0.4)` | Dropdowns and popovers **stacked on a card** |
| 4 — modal | `popover` | `border-strong` | multi-layer stack (below) | Dialogs, over a scrim at 85% black |

Two measured shadows are worth copying verbatim rather than approximating. Micro-elevation on toolbar controls is a single hairline offset — `0 1.2px 0 oklch(0 0 0 / 0.03)` — enough to lift a button off the bar without reading as a floating object. Modals stack five near-transparent layers instead of one large blur:

```css
box-shadow:
  0 8px 2px oklch(0 0 0 / 0), 0 5px 2px oklch(0 0 0 / 0.01),
  0 3px 2px oklch(0 0 0 / 0.04), 0 1px 1px oklch(0 0 0 / 0.07),
  0 0 1px oklch(0 0 0 / 0.08);
```

The stack reads as a physically plausible falloff; a single `0 24px 60px` blur reads as a sticker. There is also a **border-as-shadow** trick worth knowing: `0 0 0 1px oklch(0 0 0 / 0.2)` draws an edge that does not consume layout space the way a real border does — useful when a 1px border would break an existing grid.

Levels 3 and 4 are the only ones allowed a real drop shadow. A popover opened from the page itself stays at level 1 + overlay shadow; it only climbs to `surface-overlay` when it lands on top of another raised surface, where same-colour-on-same-colour would erase the boundary.

**Focus** is its own layer and does not participate in the ladder: a 2px `primary-focus` ring at ~50% alpha, drawn outside the control's border. It reads on every rung because it is the only chromatic edge in the system.

### Dark mode works differently

Three techniques carry depth in dark mode, and none of them is a drop shadow. A shadow is dark-on-dark; it disappears exactly where it is needed most.

**Borders are translucent white, not a solid colour.** `rgba(255,255,255,0.05)` for the default hairline, `rgba(255,255,255,0.08)` where an edge must assert itself. A solid grey border reads as a drawn line sitting *on* the surface; a translucent white one reads as the surface catching light at its edge, and it stays correct over any rung of the ladder beneath it.

**Raised surfaces are white at low alpha, not opaque fills.** The ladder in dark mode is `rgba(255,255,255,0.02)` → `0.04` → `0.05`, each rung one step more lit than the last. Because the tint is alpha rather than a fixed colour, a card keeps its relationship to whatever it happens to sit on.

**Low-emphasis buttons are almost transparent.** Ghost and secondary controls sit at `rgba(255,255,255,0.02)`–`0.05` with a translucent border, not at a solid `secondary` fill. On dark surfaces a solid fill reads as a slab; the near-transparent version reads as a control.

**Recessed panels invert the trick.** Where a surface should read as sunken rather than raised — a well holding an inset list, an empty state framed inside a card — use an inner shadow (`inset 0 0 12px oklch(0 0 0 / 0.2)`) instead of stepping the surface *down* a rung. Dropping the rung would just make it look like the layer behind, while the inset shadow reads unambiguously as depth below the plane.

Light mode inverts the idea rather than the values: raised surfaces go *lighter than white is possible*, so they take an opaque `card` fill and lean on the border ladder plus a whisper of shadow instead.

Never stack heavy shadows on low-elevation elements — it breaks the calm and reads as a template default.

## Shapes

Corners are modest and consistent, and the scale is tighter than it looks from a distance:

| Token | Value | Use |
| --- | --- | --- |
| `rounded.sm` | 4px | Inline chips, badges, list items |
| `rounded.md` | 6px | **Buttons, inputs, menu items** — every interactive control |
| `rounded.lg` | 8px | Cards, dropdowns, popovers |
| `rounded.xl` | 12px | Panels and section containers |
| `rounded.full` | 9999px | Pills, avatars, status dots |

The control radius is 6px, not 8px — measured off Linear's own buttons and inputs. It is a small difference that decides whether the UI reads as precise or as slightly soft; 8px already tips toward bubbly at these control sizes. Cards sit one rung above their controls (8px vs 6px), never the reverse.

Borders are always 1px. In light mode they use the `border` ladder; in dark mode they are translucent white (see Elevation). There are no double borders and no heavy outlines.

## Components

Buttons come in five intents. **Primary** is the only filled-accent control and there should be at most one per view — it carries a subtle top inset highlight and a soft accent-tinted shadow. **Secondary** and **outline** share a hairline border and lift to `accent` on hover. **Ghost** is chrome-free until hovered. **Destructive** mirrors primary's shape in the destructive color and appears only for irreversible actions.

Inputs sit on a surface fractionally darker than the card in dark mode, carry a 1px `input` border, and on focus swap the border to `ring` with a 3px translucent accent halo — the same focus signature every focusable element shares. Badges are pill-shaped: filled-accent for counts, `secondary` for neutral labels, and translucent status tints (success/warning/destructive at ~16% alpha over matching text) for states. Popovers and dialogs use the overlay/modal elevations above, `popover` surface, and `xl` radius. Dialog, alert-dialog and sheet titles all sit at `body-lg` (15px) weight 590 — one rung above body copy, not at the 20px `h3` rung: a confirm box is not a page, and at 20px it starts to read like one.

Keyboard affordances are first-class: show shortcuts in `mono` `<kbd>` chips wherever an action has one. This is a tool; power users should see the keys.

### Control sizes, measured

The product surface uses tighter controls than the marketing pages, and the radii shrink with them:

| Control | Radius | Type | Fill |
| --- | --- | --- | --- |
| Primary button | 6px | 12–14px / 510 | `primary` |
| Ghost / secondary button | 6px | 12–14px / 510 | translucent (dark) or `secondary` (light) |
| Toolbar button | **2px** | 12px / 510 | barely-there wash |
| Filter chip / tag | pill | 12px / 510 | transparent + 1px border |
| Icon button | **circle** | — | translucent wash |
| Input / textarea | 6px | 13–14px / 400 | translucent (dark) or `card` (light) |

Two of these are easy to get wrong. **Toolbar buttons round at 2px, not 6px** — at that size a 6px radius eats most of the edge and the control turns into a lozenge; 2px keeps it reading as a segment of a bar. **Icon-only buttons are circles**, not squares with a radius: a circle has no orientation, so it never fights the alignment of the strip it sits in.

Filter chips are transparent with a 1px border rather than a filled pill. A filled chip competes with the data; an outlined one stays legible as a control while the table stays the loudest thing on screen.

### Status badges

A status badge is a pill: a `status-*` dot, a `status-*` label, and that color at ~14% alpha as the fill. Set the label in `body-sm` at 500 weight, never uppercase. The subtle tint is the default because a back-office view shows many statuses at once and solid fills would shout. A dot-only variant (no fill, just dot + text) is allowed for the densest tables where even tints add too much noise — pick one variant per table, don't mix.

### Data tables

Tables are the core surface of this system, so they get the most discipline. The wrapper is a `card` with `xl` radius and a 1px `border`; rows are separated by **hairline bottom borders only — never zebra striping**, which reads busy against the quiet palette. The toolbar strip and pagination footer both live inside that same card, each set off from the row grid by a hairline border rather than floating as separate surfaces.

- **Header** — `table-header`: a `muted` band, `label-caps` type in `muted-foreground`, uppercase. Sortable columns show a chevron that sits at low opacity until hover; the active sort column brightens its chevron to `primary`.
- **Row** — `table-cell`: `body-sm`, ~48px tall (comfortable) — the row action button sets the floor, so a text-only row lands nearer ~36px. A compact density (~40px, text-only ~28px) is a supported toggle, not a second design; it swaps cell padding, nothing else. Hover washes the row in `accent` at ~55% alpha.
- **Selection** — row checkbox fills to `primary`; the selected row takes the `row-selected` tint (a faint primary wash, distinct from the neutral hover). Select-all lives in the header.
- **Numeric columns** — right-aligned, `tabular-nums`, so figures line up for scanning.
- **Primary cell** — pair an avatar/monogram with a two-line name + secondary (email/ID); IDs are set in `mono`.
- **Row actions** — a single `⋯` ghost button per row, revealed calmly on hover.

When rows are selected, the toolbar strip's left region swaps in place to a **bulk-action row**: the count, then the batch actions (destructive ones as red text links), then Clear. The right-side utilities stay put. This swap-in-place keeps destructive batch actions visible but not primary, without spawning a second strip.

**Pagination** sits in the table footer, separated by a 1px border: a total label ("248 items"), a rows-per-page select, and page controls where the current page is a filled `primary` `pagination-item-active` and the rest are bordered `pagination-item`.

### Sidebar navigation

The sidebar is a fixed rail (~244px) that collapses to a ~64px icon rail on narrow viewports. Top to bottom: a workspace switcher, a `⌘K` search affordance, grouped nav, and a user footer pinned to the bottom. Groups are introduced by a `sidebar-label` (`label-caps`, muted). A nav item is `sidebar-item` — 13px at weight 400, the same size *and* weight as body copy; the sidebar separates itself from content by surface and colour (a recessed ground, a lighter foreground), not by typographic weight. Only the **active** item goes to 510. The **active** item is `sidebar-item-active` — a `sidebar-accent` fill, a 2px `sidebar-primary` indicator bar on its left edge, and its icon tinted `sidebar-primary`. Item counts sit right-aligned in `muted-foreground`, `tabular-nums`.

### Filters & search

Filtering is chip-based, in a toolbar above the table. An **applied filter** renders as a `filter-chip`: a muted key ("Status"), a value in `foreground` weight 500 ("is Active, Trialing"), and a removable `✕`. New filters are added via a dashed-border "Add filter" button that reads as an affordance, not a solid control. Scoped **search** is a `search-input` (icon + field) at the toolbar's left; global search lives in the top bar with a `⌘K` hint. Segmented status **tabs** with `tabular-nums` counts sit above the toolbar for the common one-tap views; the active tab underlines in `primary`.

Structured, endpoint-driven query forms (the ABP admin tables) intentionally deviate from the chip pattern: every field lives in a labelled grid inside a filter panel, collapsed by default and opened from a funnel icon in the toolbar strip's utility group. Opening the panel swaps out the scoped search input — the panel's precise fields supersede a fuzzy match, and two search affordances on one screen is a duplicate entry point. The panel carries its own "Reset / Query" row; "Query" is secondary, since the strip's single primary is reserved for "Create". While the panel is closed the funnel keeps a dot to signal filters are still applied (with an equivalent screen-reader count) — otherwise a collapsed panel hides the fact that the table is filtered.

### Iconography

Icons are **line icons** from Lucide (the set shadcn/ui ships with), never filled or multicolor glyphs. They inherit `currentColor` so they take the color of their context — muted in metadata, `primary` on an active nav item, `foreground` in a button.

Stroke and size are fixed to a small ladder so icons read consistently:

- **Stroke width** — 2px is the default; drop to 1.75–1.5px only for larger standalone icons (24px+). Never mix stroke widths in one cluster.
- **12px** — dense inline affordances: sort chevrons, breadcrumb separators.
- **14px** — icons *inside* buttons and chips, paired with a text label (`gap` ~7px).
- **16px** — standalone icons: nav items, icon buttons, table row `⋯`, input adornments.

A standalone icon action is an `icon-button`: a 34px square with an `lg` radius, hairline border, a centered 16px icon, and the same `accent` hover as a secondary button. **Every icon must carry an explicit width/height** (via size utility or attributes) — an unconstrained SVG renders at its intrinsic default and blows out the layout. Treat "sized to its box" as a hard requirement, not a default to rely on.

## The Marketing Surface

The landing page is the one place in this system that is *not* a back-office view, and it plays by different rules: display type gets big, sections breathe, and the product itself is the argument. Everything below applies only there — carrying it into the admin shell is how a tool starts looking like a brochure.

### Display type

| Token | Size | Weight | Leading | Tracking |
| --- | --- | --- | --- | --- |
| `display-xl` | 72px | 510 | 1.0 | -0.022em (≈-1.58px) |
| `display-lg` | 56px | 510 | 1.0 | -0.022em |
| `display` | 40px | 510 | 1.05 | -0.026em |
| `h1` | 32px | 400 | 1.13 | -0.022em |

Note the inversion again: the giant sizes run 510 while the 32px heading drops to 400. Tracking holds around -2.2% of the size all the way up, so the headline compresses as it grows — that density against generous surrounding space is the whole effect.

On mobile the ladder collapses rather than scales smoothly: 72 → 48 → 32px, with tracking following proportionally.

### Section rhythm

Sections separate by space, not by rules — **96px between sections on desktop, 48px on mobile, and no dividers**. An eyebrow (`label-caps`) plus a heading opens each one. The dark canvas (or the light page ground) *is* the whitespace; boxes are reserved for content that genuinely groups.

### Product and component showcases

The live component demos are the landing page's protagonists, framed rather than decorated:

- Panel radius `rounded.xl` (12px) with `spacing.lg` (24px) of interior padding.
- A single hairline border — in dark mode translucent white at 0.08, in light mode the `border` token.
- A whisper of shadow beneath the frame (`0 2px 4px oklch(0 0 0 / 0.4)` on dark) so it sits on the page rather than in it.
- Screenshots keep their aspect ratio and are never cropped to fit a grid. A screenshot that must be cropped is the wrong screenshot.
- When a visual bleeds into the bottom of a panel, round only the top corners (`12px 12px 0 0`).

### Changelog

A single-column timeline at every breakpoint — it never becomes a grid. Each `changelog-row` sits on the page background with 24px of vertical padding and a hairline bottom rule; the version and date lead, the body follows. Consistency down the column is what makes a changelog scannable, and a two-column version destroys it.

### Footer

A dense multi-column link grid on the page background, text at `muted-foreground`, 64px of vertical padding and 32px horizontal. Columns stack to one below 768px. The footer is the one place where small type is expected, so it runs at `body-sm` throughout rather than stepping down further.

### Top navigation

56px tall, sticky, on the page background with a hairline bottom border. Links at 13–14px weight 510 in `muted-foreground`, lightening to `foreground` on hover — the same "weight plus lightness, never colour" rule the sidebar follows. The right side pairs a ghost sign-in with the single primary CTA.

## Responsive Behavior

### Breakpoints

| Name | Width | Key changes |
| --- | --- | --- |
| Desktop-XL | ≥1440px | Full layout; sidebar rail at 244px |
| Desktop | ≥1280px | Unchanged; content maxes out around 1200px |
| Laptop | ≥1024px | Card grids 3-up → 2-up; filter panel 3 columns → 2 |
| Tablet | ≥768px | Sidebar collapses to the 64px icon rail; filter panel → 1 column |
| Mobile | <768px | Sidebar becomes an overlay drawer; tables scroll horizontally inside their card; pagination keeps only prev/next |

### Touch targets

Pointer-sized controls are not enough on touch: **any control that can be tapped holds ≥44px of tap height below 768px**, even where the visual chrome stays 32–34px. Grow the hit area with padding rather than the painted box — enlarging the box would break the density the system is built on.

- Primary and secondary buttons: 34px painted, ≥44px tap.
- Icon buttons and row actions: 34px painted, ≥44px tap.
- Table row checkboxes: 16px painted, ≥44px tap.

### Collapsing strategy

- **Tables** never reflow into cards. They scroll horizontally inside the card, with the primary column pinned — a record's identity must stay on screen while scanning its fields.
- **Filter panel** collapses 3 → 2 → 1 column; the Reset/Query row stays right-aligned throughout.
- **Toolbar strip** wraps: the left region (search or bulk actions) drops to its own line before the utility group does.
- **Sidebar** goes rail → overlay drawer. The active-item indicator survives both, since "where am I" matters most when the labels are gone.
- **Display type** steps down the ladder rather than scaling fluidly: 72 → 48 → 32px, tracking following proportionally.
- **Marketing sections** drop from 96px of separation to 48px; feature grids go 3-up → 2-up → stacked; the footer's columns stack.

Note the two surfaces disagree on where the useful breakpoints are — the admin shell cares about 768px (sidebar) and 1024px (grid), the landing page about 640px and 768px (columns and nav). Both are listed; neither needs to know about the other.

## Known Gaps

Documented honestly so nobody mistakes silence for a decision:

- **Charts and data visualisation** have no tokens here. Anything beyond a sparkline needs a categorical palette this system doesn't define.
- **Empty, loading, and error illustrations** are unspecified — the components ship text-only states.
- **Toast/notification placement and stacking** is inherited from the toast primitive, not specified.
- **Print styles** are absent.
- **Motion** has no ramp: durations and easings are whatever the primitives ship with. The one rule that does hold is that reduced-motion preferences are respected.
- **Density beyond two rungs** (comfortable / compact) is out of scope; a third "ultra" density has not been designed.

## Iteration Guide

1. Work one component at a time and refer to it by its `components:` token name.
2. Before styling anything, decide **which rung** it sits on in all three ladders (text, surface, border). Most disagreements about "this looks off" are a rung mismatch, not a colour choice.
3. Reach for spacing and weight before reaching for colour. If the hierarchy still doesn't read, the problem is usually the layout, not the palette.
4. New states become new entries under `components:` — never an ad-hoc class at the call site.
5. Changing a token means changing this file first, then `styles.css`, then the components. The reverse order is how the three drift apart.
6. Keep the accent scarce. If a screen has two things competing to be "act here", one of them is wrong.

## Do's and Don'ts

- **Do** keep one `primary` action per view; let everything else be secondary, ghost, or plain text.
- **Do** build hierarchy with spacing and type weight before reaching for color or borders.
- **Do** use the accent for exactly one meaning — "act here" — including focus rings and links.
- **Do** keep borders hairline (1px) and use the single `border` token everywhere.
- **Don't** use pure black (`#000`) or pure white for large surfaces; use the warmed neutrals.
- **Don't** introduce a second accent hue or use `destructive` decoratively.
- **Don't** pile drop shadows on cards and inputs — depth comes from surface lightness and borders.
- **Don't** set body copy at 700 weight or loosen tracking on headings; the system reads tight and quiet.
- **Do** keep the five `status-*` meanings fixed; map every new state onto one of them rather than adding colors.
- **Do** separate rows with hairline borders and use `row-selected` for selection; **don't** zebra-stripe tables.
- **Do** swap in place in the toolbar strip's left region for batch actions while rows are selected.
- **Don't** confuse `status-error` (a state tint) with `destructive` (a filled action) — same hue, different jobs.
- **Don't** let the sidebar compete with content: keep it recessed (darker in dark mode) and its labels quieter than body text.
- **Do** give every icon an explicit size (12 / 14 / 16px) and a single stroke width; icons inherit `currentColor`.
- **Don't** ship an unsized SVG or mix filled and line icons — line icons only, always constrained to their box.
- **Do** pick a rung on the text / surface / border ladders deliberately; **don't** grab whichever value looks close.
- **Do** keep display weight at 600 and let tracking carry the rest; **don't** reach for 700.
- **Don't** skip a rung on the surface ladder — it invents depth that isn't there.
- **Do** grow touch targets with padding below 768px; **don't** enlarge the painted control and lose the density.
- **Do** ship Inter **Variable** with `"cv01", "ss03"` applied globally; **don't** treat the OpenType features as optional polish — without them it is generic Inter.
- **Do** use 510 as the working emphasis weight and stop at 590; **don't** reach for 700.
- **Do** give controls a 6px radius and cards 8px; **don't** let a control round harder than the card holding it.
- **Do** build dark-mode depth from translucent white borders and alpha-tinted surfaces; **don't** use drop shadows there — dark on dark is invisible.
- **Don't** fill low-emphasis buttons with a solid colour in dark mode; near-transparent white is what makes them read as controls rather than slabs.
- **Do** split the accent by job — `primary` fills, `primary-bright` marks (links, active nav, selection); **don't** use the fill colour as a foreground and hope the contrast holds.
- **Do** round toolbar buttons at 2px and icon-only buttons as circles; **don't** apply the 6px control radius uniformly to everything that happens to be a button.
- **Do** use an inset shadow for recessed panels; **don't** step the surface *down* a rung — that reads as the layer behind, not as depth.
- **Do** let the landing page use display type and 96px section rhythm; **don't** carry either into the admin shell — a tool that looks like a brochure stops reading as a tool.
- **Do** frame component showcases with a hairline and a whisper of shadow; **don't** decorate them with gradients or glow.
- **Do** keep the changelog a single column at every width.

## Implementation Status

The treatment described here is implemented. Everything below lives in the theme
file (`styles.css` / `app-theme.css`) — the scale in `@theme`, the rest as rules
selected through the primitives' own `data-slot` hooks — so no shadcn component
is forked and anything installed later inherits it.

| Area | State |
| --- | --- |
| Type scale (11 / 12 / 13 / 14 / 15px + display ladder), tracking per size | shipped |
| Weights 400 / 510 / 590 on Inter Variable | shipped |
| `"cv01", "ss03"` applied globally | shipped |
| Text ladder (four rungs), surface ladder (four), border ladder (three) | shipped |
| Brand blue primary with `primary-bright` for foreground use | shipped |
| Dark mode: translucent white borders, alpha-tinted surfaces, near-transparent controls | shipped |
| Focus ring 2px `primary-focus` @50% | shipped |
| Circular icon buttons, 2px toolbar controls, five-layer modal shadow | shipped |
| Table head `label-caps`, with the CJK exception at 13px | shipped |
| Sidebar lifted above the canvas in dark, active indicator, weight 510 on the active item only | shipped |
| `tabular-nums` on right-aligned columns and pagination | shipped |
| Page titles at 24px weight 400 | shipped |

Two deliberate departures from the reference, both recorded in the sections
above rather than treated as debt:

| Area | Reference | Here | Why |
| --- | --- | --- | --- |
| Filters | outlined chips in the toolbar | a panel behind a funnel button | the queries are structured and submitted explicitly, not loose instant conditions |
| Status colour | one success green | five semantic tiers | an issue tracker shows state through workflow icons; a CRUD back-office has only colour |

Not yet built, and honest about it: the marketing surface still lays out its own
sections rather than following the 96px rhythm, and the landing page's showcase
frames predate the panel spec.
