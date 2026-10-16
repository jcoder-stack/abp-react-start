import type { AnyExtension, Editor } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { FileHandler } from "@tiptap/extension-file-handler";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import { OfficePaste } from "./office-paste";
import { PaletteColor, PaletteHighlight, PaletteTextStyle } from "./palette";

/** 上传图片，resolve 成可直接放进 `<img src>` 的 URL。编辑器从不把图片转成 base64 内嵌。 */
export type UploadImage = (file: File) => Promise<string>;

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * 默认只注册后台业务常见的十来种语言，避免把 highlight.js 全量（约 190 种）打进包里。
 * 要更多语言就自己 `createLowlight()` + `register()` 后经 `lowlight` 选项传入。
 */
export const defaultLowlight = createLowlight({
  bash,
  csharp,
  css,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
});

export interface RichTextExtensionOptions {
  /** 空文档时的占位文案；传函数可在不重建编辑器的前提下跟随语言切换。 */
  placeholder?: string | (() => string);
  /** 不给则粘贴/拖入图片被忽略、工具栏不出图片按钮。 */
  uploadImage?: UploadImage;
  onUploadError?: (error: unknown, file: File) => void;
  lowlight?: ReturnType<typeof createLowlight>;
  /** 追加到内置扩展之后，例如下游的 `@成员` / `#任务` Mention 节点。 */
  extensions?: AnyExtension[];
}

/** 上传完成时用户可能已经继续编辑，`pos` 只是首选位置，越界时落到文末。 */
export function insertUploadedImage(
  editor: Editor,
  file: File,
  upload: UploadImage,
  pos?: number,
  onError?: (error: unknown, file: File) => void,
): Promise<void> {
  return upload(file).then(
    (src) => {
      if (editor.isDestroyed) return;
      const image = { type: "image", attrs: { src, alt: file.name } };
      const at = pos === undefined ? undefined : Math.min(pos, editor.state.doc.content.size);
      if (at === undefined) editor.chain().focus().insertContent(image).run();
      else editor.chain().insertContentAt(at, image).run();
    },
    (error: unknown) => onError?.(error, file),
  );
}

/** 编辑器与只读展示共用的扩展清单——两边 schema 一致，同一份 HTML 才能原样往返。 */
export function createRichTextExtensions(options: RichTextExtensionOptions = {}): AnyExtension[] {
  const { placeholder, uploadImage, onUploadError, lowlight = defaultLowlight } = options;
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    PaletteTextStyle,
    PaletteColor,
    PaletteHighlight,
    CodeBlockLowlight.configure({ lowlight }),
    Image.configure({ allowBase64: false }),
    Markdown,
    OfficePaste,
  ];

  if (placeholder !== undefined) {
    extensions.push(
      Placeholder.configure({
        placeholder: typeof placeholder === "function" ? () => placeholder() : placeholder,
      }),
    );
  }

  if (uploadImage) {
    extensions.push(
      FileHandler.configure({
        allowedMimeTypes: IMAGE_MIME_TYPES,
        onDrop: (editor, files, pos) => {
          for (const file of files)
            insertUploadedImage(editor, file, uploadImage, pos, onUploadError);
        },
        onPaste: (editor, files, pasteContent) => {
          // 同时带 HTML 的粘贴（网页、Word）交给常规 HTML 粘贴，否则同一张图会进来两份。
          if (pasteContent) return;
          for (const file of files)
            insertUploadedImage(editor, file, uploadImage, undefined, onUploadError);
        },
      }),
    );
  }

  return [...extensions, ...(options.extensions ?? [])];
}
