import type { AnyExtension } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { richTextContentClassName } from "./rich-text-editor";
import { useRichTextEditor } from "./use-rich-text-editor";

export interface RichTextViewerProps {
  /** 编辑器产出的 HTML。 */
  value: string;
  className?: string;
  /** 与编辑器那侧传同一份（如 Mention 节点），否则这些节点在展示时会被 schema 丢弃。 */
  extensions?: AnyExtension[];
}

/**
 * 只读展示。刻意不用 `dangerouslySetInnerHTML`：内容先经同一份 schema 解析，schema 之外的
 * 标签与属性被丢掉，自定义节点（Mention 卡片等）也能用各自的 NodeView 渲染。
 * 代价是 SSR 首帧为空，水合后才出现内容。
 */
export function RichTextViewer({ value, className, extensions }: RichTextViewerProps) {
  const editor = useRichTextEditor({
    value,
    editable: false,
    extensions,
    attributes: { class: richTextContentClassName },
  });
  return (
    <EditorContent
      editor={editor}
      data-slot="rich-text-content"
      data-readonly=""
      className={className}
    />
  );
}
