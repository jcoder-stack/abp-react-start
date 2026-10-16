import type { Editor } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { createRichTextExtensions, type RichTextExtensionOptions } from "./extensions";

export interface RichTextChange {
  /** 纯文本，块之间以换行分隔；供后端另存一份做搜索/摘要。 */
  text: string;
  editor: Editor;
}

export interface UseRichTextEditorOptions extends RichTextExtensionOptions {
  /** HTML 字符串；空文档对应 `""`。 */
  value: string;
  onChange?: (html: string, change: RichTextChange) => void;
  editable?: boolean;
  /** 透传到 contenteditable 根元素（id、aria-label、aria-invalid 等）。 */
  attributes?: Record<string, string>;
}

/** 空文档统一成 `""`：`<p></p>` 是 Tiptap 的空态表示，留着它表单的必填校验永远判不出空。 */
export function getEditorHtml(editor: Editor): string {
  return editor.isEmpty ? "" : editor.getHTML();
}

export function getMarkdown(editor: Editor): string {
  return editor.getMarkdown();
}

/** 用 Markdown 替换整篇内容。`emitUpdate` 为真时照常触发 onChange，存下来的仍是 HTML。 */
export function setMarkdown(editor: Editor, markdown: string, emitUpdate = true): void {
  editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate });
}

/**
 * 受控的 Tiptap 编辑器：`value` 进、`onChange(html)` 出。
 *
 * 扩展清单只在挂载时读取一次（重建编辑器会丢光标与撤销栈），`extensions` 等选项变了不会生效；
 * `onChange` / `uploadImage` / `placeholder` 走 ref，换引用无需 memo。
 * SSR 下首帧返回 `null`（`immediatelyRender: false`），编辑器在水合后才创建，避免水合不一致。
 */
export function useRichTextEditor(options: UseRichTextEditorOptions): Editor | null {
  const { value, editable = true } = options;
  const latest = useRef(options);
  latest.current = options;
  // 记住最后一次「编辑器 → 外部」发出的值，外部把它原样传回时不 setContent，否则每次输入都重置光标。
  const lastEmitted = useRef(value);

  const [extensions] = useState(() =>
    createRichTextExtensions({
      ...options,
      placeholder:
        options.placeholder === undefined
          ? undefined
          : () => {
              const placeholder = latest.current.placeholder;
              return typeof placeholder === "function" ? placeholder() : (placeholder ?? "");
            },
      uploadImage:
        options.uploadImage &&
        ((file) =>
          latest.current.uploadImage?.(file) ?? Promise.reject(new Error("uploadImage removed"))),
      onUploadError: (error, file) => latest.current.onUploadError?.(error, file),
    }),
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable,
      content: value,
      extensions,
      editorProps: { attributes: options.attributes ?? {} },
      onUpdate: ({ editor: current }) => {
        const html = getEditorHtml(current);
        lastEmitted.current = html;
        latest.current.onChange?.(html, {
          text: current.getText({ blockSeparator: "\n" }),
          editor: current,
        });
      },
    },
    // 空依赖：编辑器只建一次。value / editable / attributes 的后续变化由下面的 effect 同步。
    [],
  );

  const attributesKey = JSON.stringify(options.attributes ?? {});
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: JSON.parse(attributesKey) },
    });
  }, [editor, attributesKey]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  return editor;
}
