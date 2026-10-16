# Rich text editor

> English edition. 简体中文版: [`rich-text-editor.md`](rich-text-editor.md)

The `rich-text-editor` block is built on [Tiptap 3](https://tiptap.dev) and uses only MIT-licensed public npm packages (no `@tiptap-pro`, no Tiptap Cloud). Content is stored as HTML, with a plain-text copy on the side; Markdown is import/export only.

It is **not** part of `jc-abp init`'s default blocks: not every project needs rich text, and Tiptap plus ProseMirror is not small. Install it on its own when you need it.

## Install

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/rich-text-editor.json
```

What lands in the project:

- 8 source files plus the `rich-text-editor-messages.json` catalog under `src/components/rich-text-editor/`;
- the shadcn primitives `button`, `command`, `dropdown-menu`, `input`, `popover`, `separator`, `tooltip` (existing ones are left alone);
- three additions to the theme css: the palette tokens `--rte-text-*` / `--rte-highlight-*` (one set each for light and dark), `@plugin "@tailwindcss/typography"`, and the content rules under `[data-slot="rich-text-content"]` (prose colors mapped to semantic tokens, task lists, tables, code highlighting, the placeholder);
- dependencies: `@tiptap/*`, `lowlight`, `highlight.js`, `@floating-ui/dom`, plus the dev dependency `@tailwindcss/typography`.

Then merge the catalog into `messages` in `src/routes/__root.tsx`, the same way as every other block's `*-messages.json`:

```ts
import richTextMessages from "@/components/rich-text-editor/rich-text-editor-messages.json";
// …mergeCatalogs(…, richTextMessages, …)
```

## Editing

```tsx
import { RichTextEditor } from "@/components/rich-text-editor/rich-text-editor";

function DescriptionField() {
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  return (
    <RichTextEditor
      value={html}
      onChange={(next, { text }) => {
        setHtml(next);
        setText(text); // plain text: keep a copy for search, list excerpts, notification bodies
      }}
      placeholder="Add a description…"
      uploadImage={async (file) => (await uploadAttachment(file)).url}
      onUploadError={() => toast.error("Image upload failed")}
      contentClassName="min-h-48"
    />
  );
}
```

- **Controlled**: `value` is an HTML string and an empty document is `""` (not `<p></p>`), so a required check can test for empty directly. Passing back exactly what `onChange` emitted does not reset the caret; passing anything else (a form reset, switching records) replaces the content.
- **Toolbar**: `toolbar` takes an array of buttons that sets which ones show and in what order; `"|"` is a divider and `false` hides the toolbar. The default is the exported `DEFAULT_TOOLBAR`. The selection bubble menu works the same way through `bubbleMenu` (default `DEFAULT_BUBBLE_ITEMS`).
- **Images**: enabled only when you pass `uploadImage(file) => Promise<url>`. The toolbar then shows an image button, and pasted or dropped image files are uploaded first, then inserted by URL. **Images are never embedded as base64**: an `<img>` with a `data:` source is dropped while parsing.
- **Read-only and disabled**: `disabled` locks both the content and the toolbar; for display only, use `RichTextViewer` below.
- **Forms**: `id`, `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-invalid` and `aria-required` land on the editable region, to pair with `<Label htmlFor>` and field errors. With `aria-invalid` the frame turns destructive, like the other input controls.

## Display

```tsx
import { RichTextViewer } from "@/components/rich-text-editor/rich-text-viewer";

<RichTextViewer value={task.descriptionHtml} />
```

The viewer doesn't use `dangerouslySetInnerHTML`. It parses the HTML through the same schema instead: tags and attributes outside the schema are dropped, and custom nodes render through their own NodeViews. The cost is an empty first SSR frame; content appears after hydration. **Still sanitize on the server**: parsing on the client does nothing against content written straight to the API.

## Storage and server-side sanitizing

Store one HTML column and one plain-text column. When the server sanitizes with an allowlist (HtmlSanitizer or similar), allow at least what the editor produces:

| Kind | Tags | Attributes |
| --- | --- | --- |
| Text | `p` `h1`–`h3` `strong` `em` `u` `s` `code` `br` `hr` `blockquote` | — |
| Color | `span` `mark` | `data-color` (a palette name: `gray` `red` `orange` `yellow` `green` `blue` `purple` `pink`) |
| Links | `a` | `href` (http/https/mailto only), `target`, `rel` |
| Lists | `ul` `ol` `li` | `start` `type`; task lists also need `data-type` `data-checked`, plus `label` `input[type=checkbox][checked]` `div` |
| Code blocks | `pre` `code` | `class` on `code`, `language-*` only |
| Images | `img` | `src` (http/https or your attachment path), `alt`, `title`, `width`, `height` |
| Tables | `table` `colgroup` `col` `tbody` `tr` `th` `td` | `colspan` `rowspan` `colwidth`; `style` on `table`/`col` with only `width` and `min-width` |
| Mentions | `span` | `data-type` `data-id` `data-label` `data-mention-suggestion-char` |

Colors are stored as **palette names**, not color values. The values come from theme tokens per light/dark theme, so changing the theme needs no data migration, and the server only has to allow one attribute, `data-color`. Names outside the palette (hand-edited HTML, a `style="color:…"` pasted from elsewhere) are dropped while parsing.

## Markdown

The storage format is always HTML; Markdown is for import and export only (built on `@tiptap/markdown`, which Tiptap labels an early release). Get the editor through `editorRef`, then call:

```tsx
import type { Editor } from "@tiptap/core";
import { getMarkdown, setMarkdown } from "@/components/rich-text-editor/use-rich-text-editor";

const editorRef = useRef<Editor | null>(null);
<RichTextEditor editorRef={editorRef} value={html} onChange={setHtml} />;

const md = editorRef.current && getMarkdown(editorRef.current);   // export
if (editorRef.current) setMarkdown(editorRef.current, importedMd); // import; fires onChange(html) as usual
```

## Pasting from Word

The built-in `OfficePaste` extension cleans Word and Outlook HTML on paste: `mso-list` paragraphs become real ordered or bulleted lists (nesting included), and `<o:p>`, bookmark anchors, conditional comments, `mso-*` styles and `Mso*` class names are removed. The cleaning function `cleanOfficeHtml` is exported on its own too, for other sources.

## Extending: @members, #tasks

`extensions` appends any Tiptap extensions. `createMentionSuggestion` builds the candidate popup for Mention: it renders with the Command primitive and takes data from your async search (with a built-in 150ms debounce and request cancellation, so a stale response never overwrites a newer one). ↑↓ moves, Enter/Tab picks, Esc closes.

```tsx
import { Mention } from "@tiptap/extension-mention";
import { createMentionSuggestion } from "@/components/rich-text-editor/mention-suggestion";

const memberMention = Mention.configure({
  suggestion: createMentionSuggestion({
    char: "@",
    search: (query, signal) => searchMembers({ filter: query }, { signal }),
    getId: (member) => member.id,
    getLabel: (member) => member.name,
    renderItem: (member) => <MemberRow member={member} />,
  }),
});
// give a second kind of reference its own name so it doesn't clash with @
const taskMention = Mention.extend({ name: "taskRef" }).configure({
  suggestion: createMentionSuggestion({ char: "#", search: searchTasks, getId: (t) => t.id, getLabel: (t) => t.code }),
});

const extensions = [memberMention, taskMention]; // module constant or useMemo: read once on mount

<RichTextEditor value={html} onChange={setHtml} extensions={extensions} />
<RichTextViewer value={html} extensions={extensions} />
```

To render a reference as a card, add `addNodeView() { return ReactNodeViewRenderer(TaskCard) }` to the extension. **Pass the same `extensions` to the viewer**, or `RichTextViewer` drops those nodes through its schema.

## Code highlighting

Only ten languages are registered by default (bash, csharp, css, javascript, json, python, sql, typescript, xml/html, yaml), so the whole of highlight.js doesn't end up in the bundle. To add languages, register more in `defaultLowlight` in `extensions.ts`: the block is source code in your project, so edit it directly.

## SSR

The editor uses `immediatelyRender: false`: the server doesn't render the editing area, and the editor is created after hydration, which avoids a hydration mismatch. Until then `editorRef.current` is `null`.
