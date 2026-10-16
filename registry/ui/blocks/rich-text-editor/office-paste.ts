import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const OFFICE_MARKER = /urn:schemas-microsoft-com|class="?Mso|mso-[a-z-]+\s*:|<o:p[\s>]/i;
const MSO_LIST = /mso-list\s*:\s*([^;"']+)/i;
const MSO_LIST_IGNORE = /mso-list\s*:\s*ignore/i;
/** Word 的列表标号：`1.` `a)` `(iv)` `IV.` 算有序，其余（`·` `§` `o` 及 Symbol 字体私有区字符）算无序。 */
const ORDERED_MARKER = /^\(?(\d+|[a-z]|[ivxlcdm]+)[.)]/i;
const DROPPED_ELEMENTS = "style, script, meta, link, title, xml";

/** 剪贴板 HTML 是否来自 Word / Outlook / OneNote 这类 Office 产品。 */
export function isOfficeHtml(html: string): boolean {
  return OFFICE_MARKER.test(html);
}

/**
 * 清洗 Office 粘贴的 HTML：`mso-list` 段落还原成真正的 `<ul>`/`<ol>`（含嵌套层级），去掉
 * `<o:p>`、书签锚点、条件注释、`mso-*` 样式与 `Mso*` 类名。非 Office 来源原样返回。
 *
 * 依赖 `DOMParser`，只在浏览器（或 jsdom）里调用——粘贴本来就只发生在客户端。
 */
export function cleanOfficeHtml(html: string): string {
  if (!isOfficeHtml(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;

  removeComments(body);
  for (const element of Array.from(body.querySelectorAll(DROPPED_ELEMENTS))) element.remove();
  convertLists(doc);
  for (const element of Array.from(body.querySelectorAll("*"))) cleanElement(element);

  return body.innerHTML.trim();
}

function removeComments(root: Node) {
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  if (!walker) return;
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);
}

function unwrap(element: Element) {
  element.replaceWith(...Array.from(element.childNodes));
}

function cleanElement(element: Element) {
  if (!element.isConnected) return;
  const tag = element.tagName.toLowerCase();
  // 带命名空间的 Office 标签（o:p、w:sdt、v:shape…）：o:p 只是空段落占位，其余保留内容去掉壳。
  if (tag === "o:p") {
    element.remove();
    return;
  }
  if (tag.includes(":")) {
    unwrap(element);
    return;
  }
  // 书签与目录锚点（`<a name="_Toc…">`）没有 href，留着只会变成一段无意义的链接标记。
  if (tag === "a" && !element.hasAttribute("href")) {
    unwrap(element);
    return;
  }

  const style = element.getAttribute("style");
  if (style !== null) {
    const kept = style
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration !== "" && !/^mso-/i.test(declaration));
    if (kept.length > 0) element.setAttribute("style", kept.join("; "));
    else element.removeAttribute("style");
  }

  const className = element.getAttribute("class");
  if (className !== null) {
    const kept = className.split(/\s+/).filter((name) => name !== "" && !/^mso/i.test(name));
    if (kept.length > 0) element.setAttribute("class", kept.join(" "));
    else element.removeAttribute("class");
  }
  element.removeAttribute("lang");

  if (tag === "span" && element.attributes.length === 0) unwrap(element);
}

interface ListParagraph {
  element: Element;
  level: number;
  ordered: boolean;
}

function readListParagraph(element: Element): ListParagraph | undefined {
  const match = MSO_LIST.exec(element.getAttribute("style") ?? "");
  // `mso-list: none` 出现在列表后接的续行段落上，它不是列表项。
  if (!match?.[1] || /ignore|none/i.test(match[1])) return undefined;
  const level = Number(/level(\d+)/i.exec(match[1])?.[1] ?? "1");

  const marker = Array.from(element.querySelectorAll("[style]")).find((candidate) =>
    MSO_LIST_IGNORE.test(candidate.getAttribute("style") ?? ""),
  );
  const markerText = (marker?.textContent ?? "").replace(/\s+/g, "");
  marker?.remove();

  return { element, level, ordered: ORDERED_MARKER.test(markerText) };
}

/** Word 不产出列表元素，而是一串带 `mso-list: l0 level2 lfo1` 的平级段落；连续的这类段落合成一棵列表。 */
function convertLists(doc: Document) {
  const paragraphs = Array.from(doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6"))
    .map(readListParagraph)
    .filter((paragraph) => paragraph !== undefined);

  // 先按 DOM 相邻关系分组再动 DOM：建列表会把段落移走，之后就判断不了谁和谁挨着了。
  const runs: ListParagraph[][] = [];
  for (const paragraph of paragraphs) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run && last && last.element.nextElementSibling === paragraph.element) run.push(paragraph);
    else runs.push([paragraph]);
  }
  for (const run of runs) buildList(doc, run);
}

function buildList(doc: Document, run: ListParagraph[]) {
  const stack: { level: number; list: Element }[] = [];
  for (const { element, level, ordered } of run) {
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) > level) stack.pop();

    let top = stack.at(-1);
    if (!top || top.level < level) {
      const list = doc.createElement(ordered ? "ol" : "ul");
      const parentItem = top?.list.lastElementChild;
      if (top && parentItem) parentItem.appendChild(list);
      else if (top) top.list.appendChild(doc.createElement("li")).appendChild(list);
      else element.before(list);
      top = { level, list };
      stack.push(top);
    }

    const item = doc.createElement("li");
    const paragraph = doc.createElement("p");
    paragraph.append(...Array.from(element.childNodes));
    item.appendChild(paragraph);
    top.list.appendChild(item);
    element.remove();
  }
}

/** 把 {@link cleanOfficeHtml} 挂到 ProseMirror 的 `transformPastedHTML` 上。 */
export const OfficePaste = Extension.create({
  name: "officePaste",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("officePaste"),
        props: { transformPastedHTML: cleanOfficeHtml },
      }),
    ];
  },
});
