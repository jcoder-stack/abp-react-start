import type { AnyExtension, Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type Ref, useImperativeHandle } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UploadImage } from "./extensions";
import {
  DEFAULT_BUBBLE_ITEMS,
  DEFAULT_TOOLBAR,
  RichTextToolbar,
  type RichTextToolbarItem,
} from "./rich-text-toolbar";
import { type RichTextChange, useRichTextEditor } from "./use-rich-text-editor";

/**
 * 内容区的排版：typography 的 prose 负责节奏，颜色经主题层把 `--tw-prose-*` 映射到语义令牌，
 * 所以这里不写 `dark:prose-invert`。编辑器与只读展示共用，两边观感一致。
 */
export const richTextContentClassName =
  "prose prose-sm max-w-none text-foreground focus:outline-none";

export interface RichTextEditorProps {
  /** HTML 字符串；空文档为 `""`。 */
  value: string;
  onChange: (html: string, change: RichTextChange) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 内容区（可编辑区域）的附加类，例如 `min-h-48`。 */
  contentClassName?: string;
  /** 工具栏按钮；`false` 不显示工具栏。 */
  toolbar?: RichTextToolbarItem[] | false;
  /** 选区气泡菜单的按钮；`false` 关闭气泡菜单。 */
  bubbleMenu?: RichTextToolbarItem[] | false;
  /** 不给则不支持图片：粘贴/拖入的图片文件被忽略，工具栏不出图片按钮。 */
  uploadImage?: UploadImage;
  onUploadError?: (error: unknown, file: File) => void;
  /** 追加扩展（如 `@成员`、`#任务` 的 Mention 节点）。只在挂载时读取。 */
  extensions?: AnyExtension[];
  /** 拿到底层 Tiptap 编辑器（取 Markdown、聚焦等）；水合前为 `null`。 */
  editorRef?: Ref<Editor | null>;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

function ariaAttributes(props: RichTextEditorProps): Record<string, string> {
  const attributes: Record<string, string> = { role: "textbox", "aria-multiline": "true" };
  const pairs: [string, string | boolean | undefined][] = [
    ["id", props.id],
    ["aria-label", props["aria-label"]],
    ["aria-labelledby", props["aria-labelledby"]],
    ["aria-describedby", props["aria-describedby"]],
    ["aria-invalid", props["aria-invalid"]],
    ["aria-required", props["aria-required"]],
    ["aria-disabled", props.disabled],
  ];
  for (const [name, value] of pairs) {
    if (value !== undefined && value !== false) attributes[name] = String(value);
  }
  attributes.class = cn(richTextContentClassName, "min-h-32 px-3 py-2", props.contentClassName);
  return attributes;
}

/**
 * 受控富文本编辑器：HTML 进出，工具栏 + 选区气泡菜单，图片走调用方的 `uploadImage`。
 * 存储约定是 HTML；要 Markdown 用 `editorRef` 拿编辑器再调 `getMarkdown(editor)`。
 */
export function RichTextEditor(props: RichTextEditorProps) {
  const {
    value,
    onChange,
    placeholder,
    disabled = false,
    className,
    toolbar = DEFAULT_TOOLBAR,
    bubbleMenu = DEFAULT_BUBBLE_ITEMS,
    uploadImage,
    onUploadError,
    extensions,
    editorRef,
  } = props;

  const editor = useRichTextEditor({
    value,
    onChange,
    placeholder,
    editable: !disabled,
    uploadImage,
    onUploadError,
    extensions,
    attributes: ariaAttributes(props),
  });

  useImperativeHandle<Editor | null, Editor | null>(editorRef, () => editor, [editor]);

  return (
    <TooltipProvider>
      <div
        data-slot="rich-text-editor"
        data-disabled={disabled || undefined}
        className={cn(
          "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
          "has-[[contenteditable]:focus-visible]:border-ring has-[[contenteditable]:focus-visible]:ring-3 has-[[contenteditable]:focus-visible]:ring-ring/50",
          "has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          className,
        )}
      >
        {editor && toolbar !== false && toolbar.length > 0 && (
          <RichTextToolbar
            editor={editor}
            items={toolbar}
            uploadImage={uploadImage}
            onUploadError={onUploadError}
            className="border-b border-border p-1"
          />
        )}
        {editor && bubbleMenu !== false && bubbleMenu.length > 0 && !disabled && (
          <BubbleMenu
            editor={editor}
            options={{ placement: "top", offset: 6 }}
            className="rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <RichTextToolbar editor={editor} items={bubbleMenu} />
          </BubbleMenu>
        )}
        <EditorContent editor={editor} data-slot="rich-text-content" />
      </div>
    </TooltipProvider>
  );
}
