# ABP React Start — Design System

**Stance: one navy scale (hue 259) carries every neutral, text and action color; apart from the five status hues there is no second hue anywhere. The system underneath is stock shadcn/ui.**

**Token values live in the theme stylesheet, not here.** In an app, that is the global CSS entry (usually `src/styles.css`), which `jc-abp init` seeds from the CLI's `templates/app-theme.css`. Upstream, `packages/cli/templates/app-theme.css` is the single source and `examples/starter/src/styles.css` mirrors it byte for byte. This file never copies those values — copies drift, and this project has been burned by that. It explains two things: **what we changed relative to stock shadcn, and why**, and **the product conventions shadcn doesn't cover**.

When you style something, add a component or need a new semantic color, read this file first; read the theme stylesheet's `:root` / `.dark` / `@theme inline` sections only when you need to add or change a token.

| | |
| --- | --- |
| [Stance and history](#stance-and-history) | There used to be a custom system; why it was dropped |
| [Differences from stock](#differences-from-stock) | The navy scale replaces stock neutrals; added and removed tokens |
| [Navy scale](#navy-scale) | 11 steps, chroma climbs as it darkens |
| [Typography](#typography) | The 13px baseline, the 16px you must not touch, CJK headers |
| [Color and status](#color-and-status) | Color means state; five statuses; focus and selection; two guarantees |
| [Density](#density) | Where table and form row heights come from |
| [Forms](#forms) | Optional marks, description placement, read-only view, the close gate |
| [Time](#time) | 24-hour clock, tenant time zone, year/month dropdowns |
| [Tables](#tables) | The core screen of this system |
| [Sidebar](#sidebar) / [Filtering](#filtering-and-querying) / [Icons](#icons) | |
| [Motion](#motion) | Three durations and reduced motion |
| [Marketing page](#marketing-page) | The one place admin rules don't apply |
| [Responsive](#responsive) | |
| [Customization layer](#customization-layer) | The `data-slot` rules in the theme and why each exists |
| [Known gaps](#known-gaps) | |
| [Change discipline](#change-discipline) | |

---

## Stance and history

This file used to describe a home-grown design system: custom weights 510/590, per-step negative tracking, a four-level surface ladder, a three-level border ladder, five layers of modal shadow. It was replaced not because it looked bad but because **the accounting didn't work out**.

Five of seven consecutive PRs fixed problems the custom system **had created itself**: Chinese weights rounded and squeezed by tracking (from 510/590 and negative tracking), iOS zooming the whole page on input focus (from changing `--text-base` to 14px), an eleven-step scale of which the product used three, a round-icon-button rule that hit two of twenty-two buttons, and three contrast failures in light mode.

The clearest case is Chinese: thirty-three lines of `:lang(zh)` weight and tracking overrides **existed only because of 510/590 and negative tracking**. Stock has neither, so that block was deleted, not maintained.

The full account is in [`docs/theme-spike.md`](https://github.com/jcoder-stack/abp-react-start/blob/main/docs/theme-spike.md). One conclusion belongs here: **density doesn't need a custom theme**. The same five-field form is 425px tall under both themes, because density is decided by the classes components choose (`h-9` controls, `gap-5` fields, the table's declared `h-10`); the theme's only lever is `--text-sm`.

**The lessons of the first rollback still hold**: no custom weights, no per-step negative tracking, no extra surface or border ladders, no re-skinned or re-rounded dialogs, no OpenType features, and the 13px density baseline stays. The color changed once more since — not because stock was bad, but because the product needs its own identity, and **the accent is exactly the part a preset expects you to replace**. What changed is the colors and how the scale is organized, not the system.

## Differences from stock

The baseline is the `shadcn init` blue preset. **Almost every color token is replaced** (values come from the scale in the next section); the system, radii, weights and type scale are untouched.

### Added

Semantic tokens stock doesn't have but components use: `status-success` / `warning` / `error` / `info` / `neutral`, `row-selected`, `primary-hover`, `destructive-foreground`, `highlight` / `highlight-foreground`, `sidebar-muted-foreground`, `sidebar-indicator`, `focus-halo`, `brand-accent` (only for the play key in `BrandMark`; same hue as primary, differing only in lightness; never used by any component).

### Removed

The four `brand-*` tokens (the old logo's multi-color system; a second hue conflicts with "color means state"), and `sidebar-primary` / `sidebar-primary-foreground` (stock doesn't use them for the sidebar; only the landing page's gradient title referenced them, and that gradient is gone).

### Scale steps (2)

`--text-sm: 0.8125rem` (13px, the admin density baseline; stock is 14px) and `--text-2xs: 0.6875rem` (11px, for badge-sized text). **Every other type step is stock.**

### Fonts

Inter, Noto Sans SC and JetBrains Mono, all variable, are **self-hosted** via fontsource: intranet deployments may not reach a third-party CDN, and a third-party font host sees every visitor's IP. `Noto Sans SC Variable` sits before `system-ui` so Chinese renders in the same face on every platform; fallback is per glyph, so Latin text is unaffected. The whole system font chain stays behind it as a backstop. Inter italic is loaded too, but browsers only download it when a page actually uses italics.

### Explicitly not doing

No custom weights (stock 400/500/600), no per-step negative tracking, no extra surface or border ladders, no re-skinned or re-rounded dialogs, no round icon buttons, no `cv01/ss03`-style OpenType features. **These are exactly where the previous version hurt most.**

## Navy scale

One navy scale at hue 259, 11 steps, **chroma climbing as it darkens** (0.006 → 0.097). The light end is nearly colorless and works as surfaces; the dark end carries real blue and works as ink and action color. The grays have a source — they are the same blue faded out, which is why they don't read as "a gray system".

| | oklch | Typical use |
| --- | --- | --- |
| navy-50 | `0.980 0.006 259` | Page background |
| navy-100 | `0.964 0.010 259` | muted / table header / secondary button / sidebar |
| navy-200 | `0.920 0.016 259` | Borders |
| navy-300 | `0.872 0.022 259` | Input borders |
| navy-400 | `0.740 0.036 259` | Placeholders |
| navy-500 | `0.600 0.046 259` | Spare |
| navy-600 | `0.520 0.054 259` | Secondary text |
| navy-700 | `0.390 0.070 259` | Labels |
| navy-800 | `0.305 0.092 259` | Primary button hover |
| navy-900 | `0.250 0.097 259` | **Primary**: buttons / links / focus / logo |
| navy-950 | `0.198 0.075 259` | Body text |

> This table **defines** the scale; it is not the token list. Which step each token takes is decided by the theme stylesheet.

Dark mode is not this table reversed: surfaces start at `0.165`, and primary rises to `0.800 0.095 259` (navy can't be an action color on a dark surface). Same relationships, different values.

## Typography

**13px is the product baseline** (`text-sm`) and carries about half of all sized elements. Don't reach for adjacent steps for "hierarchy" — a 7% size difference is invisible in UI; hierarchy comes from weight and color.

**`--text-base` is fixed at 16px. Do not change it.** shadcn's input primitives write `text-base md:text-sm`, and the whole point of that idiom is a threshold: **iOS Safari zooms the entire page when an input under 16px gains focus, and never zooms back out**. When this step was changed to 14px, every desktop screenshot still looked right while every focus on a phone zoomed the page. If you want a smaller body step, give it a new name; this one is taken.

`text-lg` (18px) is the "one step above body" title size: dialog, sheet and card titles. Page titles are `text-2xl` (24px / 400).

**Table headers are sized per writing system.** English headers are 12px uppercase with positive tracking: capital letters have a cap height of about 0.72 of the font size while mixed text has an x-height of only 0.52, and the uppercase transform makes up that size difference — that's the premise behind the "11–12px uppercase header" convention in Latin typography. CJK has no case, `uppercase` does nothing, and the compensation never happens, so 12px Chinese next to 13px Chinese is simply one size smaller. **Chinese, Japanese and Korean go back to 13px with no uppercase**; weight and color do the distinguishing.

> This holds for **every** "small size + uppercase" spot, not just table headers.

## Color and status

**Color means state.** Apart from the five `status-*` hues there is no second hue, and those five only appear in pills and alert bars. Hierarchy comes from lightness differences and spacing, not color.

One primary, two uses: fill (primary button, logo brick) and foreground (links, solid focus border, sidebar indicator, sort arrows). `primary-hover` is its hover state.

`destructive` is only for irreversible actions and error states, never decoration.

**Keep emphasis scarce.** At most one primary button per screen; the current pagination page uses a neutral fill, not primary — it says "you are on this page", not "click here".

### Five statuses

`status-success` (enabled, paid, healthy), `status-info` (in progress, new), `status-warning` (pending, overdue), `status-error` (failed, offline), `status-neutral` (draft, archived). **Keep these five meanings and map new states into them; don't add a sixth.**

A badge is a pill: "same-color dot + same-color text + a **15% tint** of that color". **The lightness of these five colors was solved for "text on its own tint", not "text on the card"** — what the user reads is the contrast inside the pill, and the tint eats roughly 0.8–1.2 of contrast.

`status-info` sits at hue 274 and `status-neutral` at 259: had info stayed at 255 it would be 4 degrees from primary, and an "in progress" pill would merge with the links and buttons next to it; neutral used to sit at 286, a different gray family.

**Don't use status badges for booleans.** A badge means "this record is currently in some state"; "is this role public" is a field value. A pill both overstates it and forces you to pick a color you can't justify — the roles page once showed it in blue while the users page showed "enabled" in green: the same "yes" in two colors. Show attributes as plain text, with "No" in `muted-foreground`.

### Focus

**1px solid border + 3px same-color halo** (10% in light, 16% in dark — dark surfaces eat more contrast). **Only the solid border** carries the 3:1; the halo is translucent and never reaches the threshold in either theme. **The halo must match the border's color** — a different-colored halo reads as two unrelated rings.

**The sidebar is the exception.** `sidebar.tsx` writes its focus as `focus-visible:ring-2` + `ring-sidebar-ring` with no solid border — that ring is the only indicator, so it stays fully opaque. Muting the halo assumes "a solid border carries the 3:1"; where that doesn't hold, the conclusion doesn't carry over.

Error states use the same geometry with a different hue: **the shape is fixed, the hue comes from the state.**

### Selection

**A single-select toggle (view / mode switch) shows its selected state with a neutral ink edge plus weight, not a primary fill.** Primary is the action color and means "click here"; filling a "where you are" segment with it gives the brand color a data meaning. The primitive's default `bg-accent` is only **1.05:1** on a sheet surface in this scale (`SheetContent` is `bg-background`). The ink edge is `foreground` at 55%: 4.09 light / 5.76 dark on the sheet surface, 4.15 / 5.62 on a card.

**Multi-select toggles are exempt**: their selected state often carries its own meaning (for example a strikethrough for "not a working day"), so the call site decides.

**Pairwise token checks can't catch this kind of problem** — the failing value is computed by a component from `bg-accent`, not a token itself. That's why the theme check has a separate set of translucent-composite assertions.

### Two guarantees

After changing any color token, re-check both of these (upstream, `bun run check:theme` does it and also runs in CI with `bun run test`):

1. **Contrast** — body text, secondary text, button text, text on selected rows, the solid focus border, the sidebar pairs and indicator, the logo's play key against its brick, the inside of each of the five status pills, and the single-select toggle's composite ink edge (on both the sheet surface and a card).
2. **Lightness order** — `sidebar.L < background.L < card.L`, and `sidebar-accent.L > sidebar.L`.

The second set is necessary because it checks something contrast can't see: one dark version had a sidebar lighter than the content area and a current item darker than the rail, so the current item read as a hole — and every contrast pair in that version passed.

Any new semantic color must pass the same checks — especially one that sits on a tint.

## Density

**Table row height is declared, not pushed out by content**: comfortable 40px, compact 32px, set directly by the density mode as `[&_td]:h-10` / `[&_td]:h-8`, with no vertical cell padding.

This rule matters more than the numbers. Row height used to be "padding + content", so the tallest element in a row decided it, and the tallest element was the trailing menu button most rows never use — in one density mode, text-only rows were 36px and rows with a menu were 48px. Now the button is 28px: **the button fits the row, not the table the button.**

Form rhythm is **6 / 20**: 6px inside a field (label → description → control → error), 20px between fields. A 1.33× difference can't express grouping; spacing itself is the grouping signal.

Controls are uniformly 36px tall (`h-9`) with 8px radius (`rounded-md`).

## Forms

The full rationale is in [`docs/sheetform-design.md`](https://github.com/jcoder-stack/abp-react-start/blob/main/docs/sheetform-design.md); only the conclusions are listed here.

- **No red asterisks for required; mark "Optional" instead.** Red in this system only means error and danger; spending it on a form nobody has touched yet uses up its weight before anything has gone wrong. And the ratio is usually the other way round — most fields in a data-entry form are required, and one "Optional" is cleaner than four red stars. **This switch belongs to the form, not the field** (the `OptionalMarks` context): every query-form field is optional by nature, and marking each one is noise. Required fields still carry `aria-required`; never use the native `required` attribute.
- **Descriptions go above the control, below the label.** The space under the control belongs to errors; when two things share one spot, one of them gets squeezed out exactly when both matter. A field's vertical order is fixed: label → description → control → error.
- **Placeholders teach format; they are not default values.** A prefilled `0` passes a non-empty check, so the required rule never fires, and the user has to delete it first.
- **Titles have an object.** Create mode says "New book"; edit and view modes lead with **the record itself**, with identifiers in the subtitle ("1984" + "George Orwell · 1949-06-08"). The subtitle only takes a line when there is actually something to say.
- **The read-only view is a record, not a disabled form.** Disabled controls are exempt from minimum contrast precisely because they **carry no content**. Each field renders as a key-value row inside `divide-y rounded-lg border bg-card`: 40px rows (same source as tables), keys muted on the left, **values right-aligned into one vertical line**. Rendering belongs to the field (only it knows an enum shows its label and a boolean shows Yes/No); the container belongs to the form; callers write the same code either way.
- **Every close path goes through one gate.** Esc, the × in the corner, clicking the overlay, the Cancel button — if dirty, confirm first; if clean, close. Scattered checks always miss one, and the missed one is only discovered when a user loses data. The confirm dialog's "Discard" is destructive red.
- **Esc needs its own fallback.** When focus is in a text box the browser consumes the key, and the form autofocuses its first field on open — without a fallback, the most standard way out of a modal never works on the real path.
- **"All"-style unrestricted options use an empty-string value**, and in `SelectField` they are a normal selected item (the trigger shows "All"). Don't express "nothing chosen" with the placeholder state — a placeholder means "not filled in yet", while "any" is a deliberate choice in a query form.
- **Sheets come in exactly four widths**: `sm` (`max-w-md`, the usual width for configuration forms and the default), `md` (`max-w-lg`), `lg` (`max-w-2xl`, with a small table or detail list), `xl` (`max-w-5xl`, form and preview side by side). `SheetForm` takes `size`; a hand-written `SheetContent` uses `SHEET_SIZE_CLASS`; pages never write `max-w` directly.
- **Long forms in wide sheets are sectioned with `FormCard`**: in edit mode each section has its own frame with gaps between them; in view mode it collapses into the record layout just like `FormSection` — the whole record has one outer card, sections become a one-line subheading, and plain fields outside cards line up on the same vertical line as fields inside them. Layout written for edit mode (multi-column grids, inline flex) goes inside `FieldLayout`, and filling guidance goes in `FieldHint` — both step aside in view mode so the key-value rows can line up.

## Time

- **24-hour clock, fixed formats.** Times are always `HH:mm`; date-times are always `yyyy-MM-dd HH:mm`. Use `TimeInput` (a controlled text box) for time entry, not native `<input type="time">`: the latter's 12/24-hour mode follows the browser locale, not the page language, so a Chinese UI shows `05:30 PM`, and its popup list can't be themed. Input accepts shorthand: `930` becomes `09:30` on blur, `1730` becomes `17:30`; if it can't be normalized, the original text is kept, never silently cleared. Browser autofill is off on time boxes so history suggestions don't cover them.
- **Real instants display in the tenant's time zone.** The zone comes only from application-configuration's `timing.timeZone.iana.timeZoneName`, defaulting to UTC (matching the backend's fallback; a zone name the runtime doesn't recognize also falls back to UTC instead of crashing the page). Never use the browser's or the Node process's zone — SSR and the browser would compute different results and cause a hydration mismatch. Components use `useTenantTimeZone()` / `<Instant />`; loaders use `tenantTimeZone(config)`; "today" is `todayIso(timeZone)`. **The UI never labels the zone**: a tenant has exactly one, and a label only adds noise.
- **Calendars have year/month dropdowns**, with month names following the UI language; the default range is 10 years back to 1 year ahead, and when the current value is outside it the range stretches to cover that whole year, so editing an old record lands on the month of its value. For fields like birthday or hire date that need to go far back even when creating, pass `startMonth` to widen the lower bound.

## Tables

Tables are the core screen of this system. The shell is a card with a 1px border; the toolbar and the pagination footer live in the same card, separated from the row grid by hairlines.

Rows are separated **only by a hairline bottom border, no zebra striping** — stripes read as noise in this quiet palette. This holds **up to about six columns**; in wider tables, tracking across a row becomes the main reading error and the ban stops paying off. Then keep the hairlines and add full-row hover highlight plus a sticky primary column instead of going back to stripes.

- **Header** — `muted` at 50% background, `muted-foreground` text; English 12px uppercase with positive tracking, CJK 13px without uppercase (the button inside a sortable header follows along, handled once in the theme layer). The chevron of a sortable column is low-opacity at rest and turns `primary` on the current sort column; with multi-sort, a priority number appears next to the arrow.
- **Rows** — 13px, height per [Density](#density). Hover is a `muted` 50% tint. Clickable rows open the view sheet; Enter / Space do the same from the keyboard.
- **Selection** — the checkbox fills `primary`; a selected row uses `row-selected` (a very light primary, distinguishable from the neutral hover).
- **Numeric columns** — declaring `align: "right"` on a column adds `tabular-nums` automatically (the money preset does this).
- **Row actions** — one `⋯` ghost button per row, 28px, **always visible**: muted at rest, darker on row hover or keyboard focus. Hidden-until-hover makes the actions column read as empty, as if you lack permission.

The toolbar's right side is, in order: filter, refresh, export, density, columns. The left side holds page actions; "New" is the only primary button in the table.

When rows are selected, the toolbar's left area **is replaced in place by a bulk-action row**: count, bulk actions (dangerous ones are destructive-colored ghost buttons with an icon), clear. The right-side tools stay put. In-place replacement keeps dangerous bulk actions visible without making them primary, and avoids a second toolbar.

**Bulk delete reports one toast and never reports a hollow success**: all deleted → success; some failed → warning, with the backend's reasons appended one per line; if rows were skipped as not deletable (the row-level check said no, or the row has no id), say how many were deleted, failed and skipped — a user who ticked N rows and sees "Deleted" after only some went will assume all of them did. Failed rows stay selected for a retry; skipped rows are deselected (a retry can't delete them either).

**Refresh and errors**: while refetching, the table body fades to 60% (after a 100ms delay, so fast requests don't flash) and carries `aria-busy`; on error the toolbar, query panel and search all stay, and the body is replaced by an error message and a Retry button — never rendered as an empty list.

**Pagination** sits in the table footer, separated from the row grid by a 1px border: total (hidden when 0), page size, page controls, with the current page in a neutral fill (`secondary` background + weight), not primary — see [Color and status](#color-and-status). The page-number window is fixed at 7 slots so buttons don't jump sideways when paging.

**Deep-link filters**: when another page links into a list with a keyword, `initialFilter` pre-fills the search box; if the data source doesn't support search, a dev-time warning fires instead of silently ignoring it.

## Sidebar

Fixed at 256px; it can be collapsed manually (the trigger or `⌘B`) into a 48px icon rail, and becomes a drawer below 768px. Top to bottom: brand, `⌘K` search, navigation (top-level items can expand into second-level items), and the user area pinned to the bottom. The tenant switcher lives in the header, not the sidebar. A hairline separates the user area from the navigation — the nav list scrolls, and without that line the user area reads as the last nav item.

Nav items are 13px / 400 — **the same size and weight as body text**; only the current item goes to 500. The sidebar separates itself from content through surface and color (a deeper background, a lighter foreground), not weight.

**The rail is always one step deeper than the content, and the current item always one step above the rail.** This is a semantic rule, not a set of values: dark mode uses different values with the same relationships.

Current item = a surface one step up + a 2px indicator bar on the left (`sidebar-indicator`). With only the surface, "where am I" can't be read in a long nav; with only the bar, it would have to be ugly-thick to stand out. On second-level items the bar sits on the `border-l` of `SidebarMenuSub`, reading as "this segment of the tree line is lit".

**The current item is matched by longest prefix on a segment boundary**, not string equality: menu items point at list pages, while users spend most of their time on detail pages. When collapsed to the icon rail, second-level items are hidden, so if the current page is a second-level one, the indicator moves to its top-level item — also when the user has manually collapsed that group (the component marks it with `data-has-active-child` rather than searching the DOM for children).

**The indicator hangs on the li, never on the button.** Both button primitives have `overflow-hidden`, so a negatively offset `::before` on the button gets clipped by the button itself — present in computed styles, absent on screen.

## Filtering and querying

Structured, endpoint-driven query forms (the ABP admin tables) **deliberately don't use the chip pattern**: fields sit in a labeled grid inside a filter panel, collapsed by default and opened by the filter icon (`ListFilter`) in the toolbar.

Opening the panel **replaces** the scoped search box — the panel's precise fields supersede fuzzy matching, and two search inputs on one screen are redundant. The panel has its own Reset / Query row; Query is a secondary button, because the toolbar's only primary button belongs to "New". When the panel is collapsed with filters still active, the filter icon keeps a dot (with an equivalent count for screen readers); otherwise a collapsed panel hides the fact that the table is being filtered.

## Icons

Always Lucide **line icons**, never filled or multi-color glyphs. They inherit `currentColor` and take color from context.

- **Stroke** 2px by default; only standalone icons above 24px drop to 1.75–1.5px. Never mix stroke widths in one cluster.
- **12px** for dense inline cues: sort chevrons, breadcrumb separators.
- **14px** **inside** buttons and chips, next to text.
- **16px** standalone icons: nav items, icon buttons, the row `⋯`, input decorations.

**Every icon must have an explicit width and height** — an unconstrained SVG renders at its own default size and breaks the layout.

## Motion

Motion has one job: explaining what just happened. Three durations, chosen by **what is moving**, not by how important it is:

| Tier | Duration | What moves |
| --- | --- | --- |
| Instant | 100ms | Overlays that follow the pointer: combobox, tooltip, menus |
| Control | 150ms | Controls changing state in place: color, border, focus ring, hover |
| Surface | 200ms | Entering, leaving and moving: dialogs, sheets, sidebar width, tab indicator |

150ms is the default and needs no class — an unqualified `transition-*` already uses it.

Easing depends on direction: **entering** uses `ease-out` (fast start, gentle landing), **leaving** uses `ease-in` (slow start, fast exit — get out of the way rather than linger). **Width uses only `linear`**: content reflows while the sidebar resizes, and any acceleration curve makes the text visibly jitter — the one place where "the right easing is the one with no personality".

Translation is capped at 8px and scale never goes below 0.95. **Some things should never move**: table rows don't animate in or out (data changing is not a performance, and you can't read while rows reflow); hover changes color only, never position; loading states pulse opacity, never sweep a shimmer.

**Reduced motion is a hard requirement.** Don't use the "zero every animation" sledgehammer — that also kills fades, turning the UI into hard cuts and taking away the "what just happened" signal; the preference asks for no movement, not no feedback. Instead, reset the translate/scale/rotate/blur variables that drive enter/exit animations, **keep only opacity**, and shorten durations to 100ms.

## Marketing page

The landing page is the only part of this system that **isn't an admin screen**, and its rules differ: large type, generous whitespace, the product itself as the argument. **The rules below apply only there** — bring them into the admin and the tool starts looking like a brochure.

- **Sections are separated by space, not divider lines**: 96px on desktop, 48px on mobile; when adjacent sections need distinguishing, use a very faint `muted` background, not a line. The top nav's hairline bottom border is the exception — it marks "this is the shell".
- **Showcase panels** are `rounded-xl` with a hairline border and 16px padding (20px from `sm`); screenshots keep their aspect ratio and are never cropped to fit a grid — a screenshot that needs cropping is the wrong screenshot.
- **The footer** is one row: brand + a one-line tagline (`muted-foreground`), with 64px vertical padding. When links are needed, switch to a multi-column link grid rather than stuffing them into that row.
- **Hero title**: the lead phrase in `muted-foreground`, the emphasized words in `foreground` — the lightness difference carries the emphasis. No gradient (it needs a second color stop) and no primary (primary inside a same-hue title is nearly indistinguishable).
- If a **changelog** is added later, it is a single-column timeline at every breakpoint, never a grid. A single column is what makes it scannable.

## Responsive

| Name | Width | Main changes |
| --- | --- | --- |
| Desktop-XL | ≥1440px | Full layout, 256px sidebar |
| Desktop | ≥1280px | Unchanged; the marketing page caps its measure at 1152px, the admin doesn't |
| Laptop | ≥1024px | Card grids and the filter panel at 3 columns |
| Tablet | ≥640px | Card grids and the filter panel at 2 columns; the sidebar stays expanded, users can collapse it to the icon rail |
| Mobile | <768px | Sidebar becomes a drawer; tables scroll horizontally inside their card; pagination keeps only previous / next and "page X of Y"; grids drop to 1 column below 640px |

**Tables never turn into card lists.** They scroll horizontally inside the card — while scanning fields, the record's identity has to stay on screen (the sticky primary column isn't built yet, see [Known gaps](#known-gaps)).

## Customization layer

The theme has about a dozen `data-slot` / pseudo-class rules. The bar is strict: **only things stock can't provide and that help communicate information**. Purely cosmetic rules (round icon buttons, five-layer modal shadows, re-skinned or re-rounded popovers) are never accepted — that kind of rule is exactly where the previous version hurt most.

These rules deliberately sit outside any `@layer`: primitives carry their own utilities such as `p-2`, and inside `@layer components` those utilities would win. The cost is that a caller overriding the same property with a utility class on a single instance is also overridden by these rules; in that case use Tailwind v4's `!` suffix (e.g. `<TableCell className="py-2!">`) rather than editing the theme rule.

| Rule | Why |
| --- | --- |
| `*:focus-visible` and input-group `:has()` override `--tw-ring-color` | Turns the primitives' 50% halo into a same-color 10%/16%. Only one custom property changes; no primitive is forked and no `!important` is needed |
| `[data-slot^="sidebar-"]:focus-visible` restored to full opacity | Those sidebar spots have no solid border to fall back on; the ring is the indicator |
| The sidebar's 2px current-item indicator (on the li) | A surface alone is too weak a "you are here" signal in a long nav. On the li, not the button: button primitives have `overflow-hidden` |
| The indicator for `[data-has-active-child]` on the icon rail | With second-level items hidden, the rail still needs to show which top-level item holds the current page; React decides, because a collapsed group's children are unmounted |
| Weight 500 for the current second-level nav item | The top-level button primitive bolds its current item, the second-level one doesn't; the two levels would disagree |
| Top border on `[data-slot="sidebar-footer"]` | Separates the scrolling nav from the pinned user area |
| `input:-webkit-autofill` inset shadow | Chrome only paints the input itself, leaving half a blue box inside an input-group |
| Single-select `toggle-group` selected ink edge + weight (left border restored on joined segments) | `bg-accent` selection contrast is only 1.05:1; no primary fill |
| `[data-slot="field"]` gap 6px | The primitive's 12px is too close to the 16px between fields to show which parts belong together |
| `[data-slot="table-cell"]` vertical padding 0 | Works with declared row heights; padding on top hands row height back to content |
| 16px outer padding on first/last table cells | Outer padding equal to column spacing keeps the grid even; set on cells so it doesn't scroll away horizontally |
| `[data-slot="sheet-content"]` animation 200ms | The primitive opens in 500ms and closes in 300ms, 2.5× slower than the product's second-slowest animation |
| CJK table headers back to 13px, no uppercase | See [Typography](#typography) |
| `text-transform: inherit` on buttons inside table headers | Browsers default buttons to `none`, so sortable headers would disagree with other headers; the language list stays in one place |
| `[data-slot="combobox-content"]` restores `pointer-events` | Radix modals set body to none; Base UI popups portal outside the dialog and would be unclickable |
| `prefers-reduced-motion` | See [Motion](#motion) |

**Before adding a rule, ask**: can stock really not do this? Is it helping communicate information, or just adjusting looks? Will `asChild` replace the `data-slot`?

## Known gaps

- **Charts** keep stock's five `chart-1..5` colors with zero references; there is no categorical palette or chart spec. When charts are actually needed, design them as a separate round.
- **Input borders are 1.47:1 on white**, below the 3:1 for non-text controls. An industry-wide issue (shadcn's default is the same), and fixing it makes every border on the site noticeably heavier. **Kept deliberately**, and recorded here rather than left silent.
- **Illustrations for empty / loading / error states** are undefined; components only have text states.
- **Toast position and stacking** follow the primitive; not specified.
- **Print styles** don't exist.
- **Table primary column**: there is no column preset for "avatar / initials block + name and secondary identifier on two lines, ID in monospace", and no sticky primary column when scrolling horizontally. Current column presets are text, date, money, enum and boolean.
- **Touch targets**: keeping every tappable control at a ≥44px hit area below 768px (grown with padding, not by enlarging the control) is a goal, not yet implemented; controls are still desktop-sized on phones.
- **A third density** (beyond comfortable / compact) isn't designed.
- **No writing guidelines**: error-message tone, empty-state wording, verbs vs. nouns on buttons, punctuation.
- **Bilingual typography** only covers fonts and table headers, not spacing between Chinese and Latin text, or numbers and units.

## Change discipline

1. **Token values live in the theme stylesheet**; this file doesn't copy them. Before changing a value, ask "is this something stock can't provide?"
2. After changing any color token, re-check contrast and lightness order in both themes (upstream: `bun run check:theme`). The lightness order catches what contrast can't, see [Color and status](#color-and-status).
3. A new customization rule must be justifiable in one line in the [Customization layer](#customization-layer) table; if you can't write that line, don't add the rule.
4. Decide where something belongs in terms of **density** and **semantics** before deciding how it looks. Most "this looks wrong" moments are an unclear placement, not a wrong color.
5. Spacing and weight come before color. When hierarchy doesn't read, the layout is usually the problem.
6. Keep emphasis scarce. If two things on a screen compete for "click here", one of them is wrong.
7. Write gaps down in [Known gaps](#known-gaps). Silence gets read as "already thought through".
