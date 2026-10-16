// @vitest-environment jsdom
import type { ApplicationConfiguration } from "@jcoder-stack/abp-react/core";
import { AppConfigProvider } from "@jcoder-stack/abp-react/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { Mention } from "@tiptap/extension-mention";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRichTextExtensions } from "../ui/blocks/rich-text-editor/extensions";
import { createMentionSuggestion } from "../ui/blocks/rich-text-editor/mention-suggestion";
import { cleanOfficeHtml, isOfficeHtml } from "../ui/blocks/rich-text-editor/office-paste";
import { RichTextEditor } from "../ui/blocks/rich-text-editor/rich-text-editor";
import messages from "../ui/blocks/rich-text-editor/rich-text-editor-messages.json";
import { RichTextViewer } from "../ui/blocks/rich-text-editor/rich-text-viewer";
import {
  getEditorHtml,
  getMarkdown,
  setMarkdown,
} from "../ui/blocks/rich-text-editor/use-rich-text-editor";

// jsdom 缺 ResizeObserver 与 scrollIntoView；cmdk 用前者量列表高度、用后者把高亮项滚进视野。
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (Element.prototype.scrollIntoView === undefined) Element.prototype.scrollIntoView = () => {};

const config: ApplicationConfiguration = {
  currentUser: { isAuthenticated: false, id: null, userName: null, tenantId: null, roles: [] },
  auth: { grantedPolicies: {} },
  setting: { values: {} },
  localization: {
    currentCulture: { name: "en" },
    languages: [{ cultureName: "en", displayName: "English" }],
    values: {},
  },
  currentTenant: { id: null, name: null, isAvailable: true },
  features: { values: {} },
};

function renderWithLocalization(ui: React.ReactNode) {
  return render(
    <AppConfigProvider config={config} messages={messages} fallbackCulture="en">
      {ui}
    </AppConfigProvider>,
  );
}

/** 不经 React 的无头编辑器，与组件共用同一份扩展清单，用来断言 schema 层的 HTML 输出。 */
function headless(content: string): Editor {
  const editor = new Editor({ extensions: createRichTextExtensions(), content });
  editors.push(editor);
  return editor;
}

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

async function findEditable(): Promise<HTMLElement> {
  return screen.findByRole("textbox");
}

describe("RichTextEditor", () => {
  it("renders the controlled value and re-syncs when the value changes from outside", async () => {
    function Harness() {
      const [value, setValue] = useState("<p>Hello <strong>world</strong></p>");
      return (
        <>
          <RichTextEditor value={value} onChange={setValue} aria-label="Description" />
          <button type="button" onClick={() => setValue("<h2>Replaced</h2>")}>
            replace
          </button>
          <button type="button" onClick={() => setValue("")}>
            clear
          </button>
        </>
      );
    }
    renderWithLocalization(<Harness />);

    const editable = await findEditable();
    expect(editable.getAttribute("aria-label")).toBe("Description");
    expect(editable.querySelector("strong")?.textContent).toBe("world");

    await userEvent.click(screen.getByRole("button", { name: "replace" }));
    await waitFor(() => expect(editable.querySelector("h2")?.textContent).toBe("Replaced"));

    await userEvent.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() => expect(editable.textContent).toBe(""));
  });

  it("emits HTML plus plain text on edits, and an empty document as an empty string", async () => {
    const onChange = vi.fn();
    const editorRef = createRef<Editor | null>();
    renderWithLocalization(
      <RichTextEditor value="<p>first</p>" onChange={onChange} editorRef={editorRef} />,
    );
    await findEditable();
    const editor = editorRef.current;
    if (!editor) throw new Error("editor not ready");

    act(() => {
      editor.chain().setContent("<p>one</p><p>two</p>", { emitUpdate: true }).run();
    });
    expect(onChange).toHaveBeenLastCalledWith(
      "<p>one</p><p>two</p>",
      expect.objectContaining({ text: "one\ntwo" }),
    );

    act(() => {
      editor.commands.clearContent(true);
    });
    expect(onChange).toHaveBeenLastCalledWith("", expect.objectContaining({ text: "" }));
  });

  it("does not reset the document when the parent echoes the emitted value back", async () => {
    const editorRef = createRef<Editor | null>();
    function Harness() {
      const [value, setValue] = useState("<p>start</p>");
      return <RichTextEditor value={value} onChange={setValue} editorRef={editorRef} />;
    }
    renderWithLocalization(<Harness />);
    await findEditable();
    const editor = editorRef.current;
    if (!editor) throw new Error("editor not ready");

    act(() => {
      editor
        .chain()
        .setTextSelection(editor.state.doc.content.size - 1)
        .insertContent(" more")
        .run();
    });
    const selection = editor.state.selection.from;
    await waitFor(() => expect(editor.getHTML()).toBe("<p>start more</p>"));
    // 回传同值若触发 setContent，光标会被重置到文首。
    expect(editor.state.selection.from).toBe(selection);
  });

  it("applies toolbar formatting to the selection", async () => {
    const onChange = vi.fn();
    const editorRef = createRef<Editor | null>();
    renderWithLocalization(
      <RichTextEditor value="<p>bold me</p>" onChange={onChange} editorRef={editorRef} />,
    );
    await findEditable();
    act(() => {
      editorRef.current?.commands.selectAll();
    });

    await userEvent.click(screen.getByRole("button", { name: "Bold" }));

    expect(onChange).toHaveBeenLastCalledWith("<p><strong>bold me</strong></p>", expect.anything());
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("locks the document and the toolbar when disabled", async () => {
    renderWithLocalization(<RichTextEditor value="<p>x</p>" onChange={() => {}} disabled />);
    const editable = await findEditable();
    expect(editable.getAttribute("contenteditable")).toBe("false");
    expect(screen.getByRole("button", { name: "Bold" }).hasAttribute("disabled")).toBe(true);
  });

  it("hides the image button unless an upload handler is provided", async () => {
    const { unmount } = renderWithLocalization(<RichTextEditor value="" onChange={() => {}} />);
    await findEditable();
    expect(screen.queryByRole("button", { name: "Insert image" })).toBeNull();
    unmount();

    renderWithLocalization(
      <RichTextEditor value="" onChange={() => {}} uploadImage={async () => "/a.png"} />,
    );
    await findEditable();
    expect(screen.getByRole("button", { name: "Insert image" })).toBeTruthy();
  });
});

describe("createMentionSuggestion", () => {
  const MEMBERS = [
    { id: "u1", name: "Alice" },
    { id: "u2", name: "Alan" },
    { id: "u3", name: "Bob" },
  ];

  it("searches with the typed query and inserts the picked candidate as a mention node", async () => {
    const search = vi.fn(async (query: string) =>
      MEMBERS.filter((member) => member.name.toLowerCase().startsWith(query.toLowerCase())),
    );
    const mention = Mention.configure({
      suggestion: createMentionSuggestion({
        char: "@",
        search,
        getId: (member) => member.id,
        getLabel: (member) => member.name,
        debounceMs: 0,
      }),
    });
    const onChange = vi.fn();
    const editorRef = createRef<Editor | null>();
    renderWithLocalization(
      <RichTextEditor
        value=""
        onChange={onChange}
        editorRef={editorRef}
        extensions={[mention]}
        bubbleMenu={false}
      />,
    );
    const editable = await findEditable();
    act(() => {
      editorRef.current?.commands.insertContent("@al");
    });

    expect(await screen.findByRole("option", { name: "Alan" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Alice" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Bob" })).toBeNull();
    expect(search).toHaveBeenLastCalledWith("al", expect.any(AbortSignal));

    fireEvent.keyDown(editable, { key: "ArrowDown" });
    fireEvent.keyDown(editable, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining('data-type="mention" data-id="u2" data-label="Alan"'),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  });
});

describe("RichTextViewer", () => {
  it("renders the stored HTML read-only", async () => {
    renderWithLocalization(<RichTextViewer value="<h1>Title</h1><p>Body</p>" />);
    const heading = await screen.findByRole("heading", { name: "Title" });
    expect(heading.closest("[contenteditable]")?.getAttribute("contenteditable")).toBe("false");
  });
});

describe("rich text HTML schema", () => {
  it("stores palette names as data-color and drops colors outside the palette", () => {
    const editor = headless(
      '<p><span data-color="red">red</span> <span data-color="#ff0000">hex</span> <span style="color: blue">styled</span></p>',
    );
    expect(editor.getHTML()).toBe('<p><span data-color="red">red</span> hex styled</p>');
  });

  it("keeps multicolor highlights as palette names", () => {
    const editor = headless('<p><mark data-color="yellow">a</mark> <mark>b</mark></p>');
    expect(editor.getHTML()).toBe('<p><mark data-color="yellow">a</mark> <mark>b</mark></p>');
  });

  it("round-trips task lists, tables and language-tagged code blocks", () => {
    const html =
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>' +
      '<table style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>h</p></th><th colspan="1" rowspan="1"><p></p></th><th colspan="1" rowspan="1"><p></p></th></tr></tbody></table>' +
      '<pre><code class="language-typescript">const a = 1;</code></pre>';
    const editor = headless(html);
    const output = editor.getHTML();
    expect(output).toContain('<li data-checked="true" data-type="taskItem">');
    expect(output).toContain("<th");
    expect(output).toContain('<pre><code class="language-typescript">const a = 1;</code></pre>');
    // 二次解析结果不变：存进库的 HTML 读回来是同一份文档。
    expect(headless(output).getHTML()).toBe(output);
  });

  it("never embeds base64 images", () => {
    const editor = headless(
      '<p>x</p><img src="data:image/png;base64,AAAA"><img src="https://cdn.example/a.png" alt="a">',
    );
    const output = editor.getHTML();
    expect(output).not.toContain("data:image");
    expect(output).toContain('src="https://cdn.example/a.png"');
  });

  it("treats an empty document as an empty string", () => {
    expect(getEditorHtml(headless(""))).toBe("");
    expect(getEditorHtml(headless("<p></p>"))).toBe("");
  });

  it("imports and exports Markdown while HTML stays the storage format", () => {
    const editor = headless("");
    setMarkdown(editor, "# Title\n\n- one\n- two\n\n**bold**");
    expect(editor.getHTML()).toBe(
      "<h1>Title</h1><ul><li><p>one</p></li><li><p>two</p></li></ul><p><strong>bold</strong></p>",
    );
    expect(getMarkdown(editor)).toContain("# Title");
    expect(getMarkdown(editor)).toContain("**bold**");
  });
});

describe("cleanOfficeHtml", () => {
  const wordList = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>
<!--StartFragment-->
<p class="MsoListParagraphCxSpFirst" style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><!--[if !supportLists]--><span style="font-family:Symbol;mso-fareast-font-family:Symbol"><span style="mso-list:Ignore">·<span style="font:7.0pt &quot;Times New Roman&quot;">&nbsp;&nbsp;&nbsp; </span></span></span><!--[endif]-->Apple<o:p></o:p></p>
<p class="MsoListParagraphCxSpMiddle" style="margin-left:72.0pt;mso-add-space:auto;text-indent:-18.0pt;mso-list:l0 level2 lfo1"><!--[if !supportLists]--><span style="mso-list:Ignore">1.<span>&nbsp;&nbsp; </span></span><!--[endif]-->Green<o:p></o:p></p>
<p class="MsoListParagraphCxSpLast" style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><!--[if !supportLists]--><span style="mso-list:Ignore">·<span>&nbsp;&nbsp; </span></span><!--[endif]-->Banana<o:p></o:p></p>
<p class="MsoNormal"><a name="_Toc123"></a><b><span lang="EN-US" style="font-size:12.0pt;mso-bidi-font-size:11.0pt;color:red">After</span></b><o:p></o:p></p>
<!--EndFragment-->
</body></html>`;

  it("turns mso-list paragraphs into nested lists with the right list type", () => {
    const container = document.createElement("div");
    container.innerHTML = cleanOfficeHtml(wordList);

    const outer = container.querySelector(":scope > ul");
    expect(outer).not.toBeNull();
    const items = outer?.querySelectorAll(":scope > li") ?? [];
    expect(Array.from(items, (li) => li.querySelector(":scope > p")?.textContent?.trim())).toEqual([
      "Apple",
      "Banana",
    ]);
    const nested = items[0]?.querySelector(":scope > ol");
    expect(nested?.querySelector("li")?.textContent?.trim()).toBe("Green");
    // 标号（· 1.）不能残留在正文里。
    expect(container.textContent).not.toContain("·");
    expect(container.textContent).not.toMatch(/1\.\s*Green/);
  });

  it("strips Office-only markup but keeps real formatting", () => {
    const cleaned = cleanOfficeHtml(wordList);
    expect(cleaned).not.toMatch(/mso-|Mso|<o:p|<!--|_Toc|lang=/);
    expect(cleaned).toContain('<b><span style="font-size:12.0pt; color:red">After</span></b>');
  });

  it("leaves non-Office HTML untouched", () => {
    const html = '<p class="note" style="color: red">plain <!-- c --></p>';
    expect(isOfficeHtml(html)).toBe(false);
    expect(cleanOfficeHtml(html)).toBe(html);
  });

  it("produces lists the editor schema accepts", () => {
    const editor = headless(cleanOfficeHtml(wordList));
    expect(editor.getHTML()).toContain(
      "<ul><li><p>Apple</p><ol><li><p>Green</p></li></ol></li><li><p>Banana</p></li></ul>",
    );
  });
});
