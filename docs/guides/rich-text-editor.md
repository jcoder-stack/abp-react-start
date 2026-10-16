# 富文本编辑器

> 简体中文版。English edition: [`rich-text-editor.en.md`](rich-text-editor.en.md)

`rich-text-editor` 块基于 [Tiptap 3](https://tiptap.dev)，只用 MIT 许可的公开 npm 包（不含 `@tiptap-pro`、Tiptap Cloud）。存储格式是 HTML，另给一份纯文本；Markdown 只作导入/导出。

它**不在** `jc-abp init` 的默认块里——不是每个项目都要富文本，Tiptap 连同 ProseMirror 也不小。需要时单独装。

## 安装

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/rich-text-editor.json
```

装进来的东西：

- `src/components/rich-text-editor/` 下的 8 个源文件 + 词条 `rich-text-editor-messages.json`；
- shadcn 原语 `button`、`command`、`dropdown-menu`、`input`、`popover`、`separator`、`tooltip`（已有的不动）；
- 主题 css 里追加的三样：色板令牌 `--rte-text-*` / `--rte-highlight-*`（亮暗各一套）、`@plugin "@tailwindcss/typography"`、以及 `[data-slot="rich-text-content"]` 开头的内容区规则（prose 颜色映射到语义令牌、任务列表、表格、代码高亮、占位符）；
- 依赖：`@tiptap/*`、`lowlight`、`highlight.js`、`@floating-ui/dom`，开发依赖 `@tailwindcss/typography`。

装完把词条合并进 `src/routes/__root.tsx` 的 `messages`，与其他块的 `*-messages.json` 同样处理：

```ts
import richTextMessages from "@/components/rich-text-editor/rich-text-editor-messages.json";
// …mergeCatalogs(…, richTextMessages, …)
```

## 编辑

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
        setText(text); // 纯文本：存一份给搜索、列表摘要、通知正文
      }}
      placeholder="补充描述…"
      uploadImage={async (file) => (await uploadAttachment(file)).url}
      onUploadError={() => toast.error("图片上传失败")}
      contentClassName="min-h-48"
    />
  );
}
```

- **受控**：`value` 是 HTML 字符串，空文档是 `""`（不是 `<p></p>`），表单必填校验可以直接判空。父组件把 `onChange` 发出的值原样传回时不会重置光标；传入别的值（重置表单、切换记录）才会替换内容。
- **工具栏**：`toolbar` 传按钮数组控制显示哪些、什么顺序，`"|"` 是分隔线，`false` 关掉。默认值是导出的 `DEFAULT_TOOLBAR`。选区气泡菜单同理用 `bubbleMenu`（默认 `DEFAULT_BUBBLE_ITEMS`）。
- **图片**：只在给了 `uploadImage(file) => Promise<url>` 时启用——工具栏出图片按钮，粘贴/拖入图片文件会先上传再插入 URL。**从不内嵌 base64**，HTML 里带 `data:` 的 `<img>` 会在解析时被丢掉。
- **只读与禁用**：`disabled` 锁住内容与工具栏；纯展示用下面的 `RichTextViewer`。
- **表单接入**：`id`、`aria-label`、`aria-labelledby`、`aria-describedby`、`aria-invalid`、`aria-required` 落在可编辑区域上，配合 `<Label htmlFor>` 与字段错误使用。`aria-invalid` 时外框变 destructive，与其他输入控件一致。

## 展示

```tsx
import { RichTextViewer } from "@/components/rich-text-editor/rich-text-viewer";

<RichTextViewer value={task.descriptionHtml} />
```

展示不用 `dangerouslySetInnerHTML`，而是用同一份 schema 解析一遍：schema 外的标签与属性丢掉，自定义节点用各自的 NodeView 渲染。代价是 SSR 首帧为空，水合后才出现内容。**后端仍要清洗**——前端解析防不住绕过 UI 直接调 API 写进来的内容。

## 存储与后端清洗

存 HTML 一列 + 纯文本一列。后端用 HtmlSanitizer 这类白名单清洗时，至少放行编辑器会产出的这些：

| 类别 | 标签 | 属性 |
| --- | --- | --- |
| 文本 | `p` `h1`–`h3` `strong` `em` `u` `s` `code` `br` `hr` `blockquote` | — |
| 颜色 | `span` `mark` | `data-color`（取值是色板名：`gray` `red` `orange` `yellow` `green` `blue` `purple` `pink`） |
| 链接 | `a` | `href`（限 http/https/mailto）`target` `rel` |
| 列表 | `ul` `ol` `li` | `start` `type`；任务列表另需 `data-type` `data-checked`，及 `label` `input[type=checkbox][checked]` `div` |
| 代码块 | `pre` `code` | `code` 的 `class` 只放行 `language-*` |
| 图片 | `img` | `src`（限 http/https 或你的附件路径）`alt` `title` `width` `height` |
| 表格 | `table` `colgroup` `col` `tbody` `tr` `th` `td` | `colspan` `rowspan` `colwidth`；`table`/`col` 的 `style` 只放行 `width` `min-width` |
| Mention | `span` | `data-type` `data-id` `data-label` `data-mention-suggestion-char` |

颜色存的是**色板名**而不是色值：色值由主题令牌按亮暗主题给出，换主题不用迁移数据，后端也只需放行 `data-color` 一个属性。色板外的名字（手改的 HTML、别处粘来的 `style="color:…"`）解析时直接丢掉。

## Markdown

存储格式始终是 HTML；Markdown 只用于导入导出（基于 `@tiptap/markdown`，官方标注为 early release）。经 `editorRef` 拿到编辑器后调用：

```tsx
import type { Editor } from "@tiptap/core";
import { getMarkdown, setMarkdown } from "@/components/rich-text-editor/use-rich-text-editor";

const editorRef = useRef<Editor | null>(null);
<RichTextEditor editorRef={editorRef} value={html} onChange={setHtml} />;

const md = editorRef.current && getMarkdown(editorRef.current);   // 导出
if (editorRef.current) setMarkdown(editorRef.current, importedMd); // 导入，照常触发 onChange(html)
```

## 从 Word 粘贴

内置的 `OfficePaste` 扩展在粘贴时清洗 Word / Outlook 的 HTML：把 `mso-list` 段落还原成真正的有序/无序列表（含嵌套层级），去掉 `<o:p>`、书签锚点、条件注释、`mso-*` 样式和 `Mso*` 类名。清洗函数 `cleanOfficeHtml` 也单独导出，可以拿去处理别的来源。

## 扩展：@成员、#任务

`extensions` 追加任意 Tiptap 扩展。`createMentionSuggestion` 生成 Mention 的候选弹层：Command 原语渲染、数据来自你给的异步搜索（自带 150ms 防抖与请求取消，晚到的旧结果不会盖掉新结果），↑↓ 选择、Enter/Tab 确认、Esc 关闭。

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
// 第二种引用用 extend 换个名字，避免与 @ 冲突
const taskMention = Mention.extend({ name: "taskRef" }).configure({
  suggestion: createMentionSuggestion({ char: "#", search: searchTasks, getId: (t) => t.id, getLabel: (t) => t.code }),
});

const extensions = [memberMention, taskMention]; // 模块级常量或 useMemo：只在挂载时读取

<RichTextEditor value={html} onChange={setHtml} extensions={extensions} />
<RichTextViewer value={html} extensions={extensions} />
```

要把引用渲染成卡片，在扩展上 `addNodeView() { return ReactNodeViewRenderer(TaskCard) }`。**展示侧要传同一份 `extensions`**，否则这些节点在 `RichTextViewer` 里会被 schema 丢弃。

## 代码高亮

默认只注册十种语言（bash、csharp、css、javascript、json、python、sql、typescript、xml/html、yaml），避免把 highlight.js 全量打进包。要更多语言就在 `extensions.ts` 的 `defaultLowlight` 里多注册几个——块是装进项目的源码，直接改即可。

## SSR

编辑器用 `immediatelyRender: false`：服务端不渲染编辑区，水合后才创建，避免 hydration mismatch。`editorRef.current` 在此之前是 `null`。
