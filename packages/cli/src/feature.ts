const FEATURES_IMPORT =
  'import { FeatureProviders, featureHead, featureMessages } from "@/features";';
const MERGE_ANCHOR = "= mergeCatalogs(";

/** Index of the only occurrence of `needle`; -1 when absent or ambiguous (an ambiguous anchor is a shape we don't know). */
function uniqueIndex(source: string, needle: string): number {
  const first = source.indexOf(needle);
  return first !== -1 && source.indexOf(needle, first + 1) === -1 ? first : -1;
}

/** Index of the quote closing the string literal opened at `start`; -1 if unterminated. */
function skipString(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === quote) return i;
  }
  return -1;
}

/** Index of the `]` closing the `[` at `open`. Strings and comments are skipped: head arrays carry
 *  URLs and explanatory comments, either of which may contain brackets. -1 if unbalanced. */
function closingBracket(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      if (i === -1) return -1;
    } else if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) return -1;
    } else if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2);
      if (i === -1) return -1;
      i++;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** End offset (exclusive of the line break) of the last top-level import statement; -1 if none. */
function endOfImports(source: string): number {
  let offset = 0;
  let end = -1;
  let inImport = false;
  for (const rawLine of source.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    if (inImport || /^import[\s"'{*]/.test(trimmed)) {
      inImport = !/["'];?$/.test(trimmed);
      if (!inImport) end = offset + line.length;
    } else if (trimmed !== "" && !/^(\/\/|\/\*|\*)/.test(trimmed)) {
      break;
    }
    offset += rawLine.length + 1;
  }
  return end;
}

function lineIndent(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? "";
}

function insertAt(source: string, at: number, text: string): string {
  return source.slice(0, at) + text + source.slice(at);
}

/** Appends `item` as the array's last element, matching the last element's indentation. */
function appendLastItem(source: string, close: number, item: string, eol: string): string {
  let last = close - 1;
  while (last >= 0 && /\s/.test(source[last] ?? "")) last--;
  if (source[last] === "[") return insertAt(source, close, item);
  const separator = source[last] === "," ? "" : ",";
  return insertAt(source, last + 1, `${separator}${eol}${lineIndent(source, last)}${item},`);
}

/** Inserts `item` as the first argument of the call whose `(` ends right before `at`. */
function prependFirstArg(source: string, at: number, item: string, eol: string): string {
  const rest = source.slice(at);
  if (/^\s*\)/.test(rest)) return insertAt(source, at, item);
  const multiline = /^[ \t]*\r?\n([ \t]*)/.exec(rest);
  if (multiline) return insertAt(source, at, `${eol}${multiline[1]}${item},`);
  return insertAt(source, at, `${item}, `);
}

function wrapOutlet(source: string, index: number, length: number, eol: string): string {
  const indent = lineIndent(source, index);
  const outlet = source.slice(index, index + length);
  return (
    source.slice(0, index) +
    `<FeatureProviders>${eol}${indent}  ${outlet}${eol}${indent}</FeatureProviders>` +
    source.slice(index + length)
  );
}

/**
 * Wires a pre-0.5 `src/routes/__root.tsx` to the feature aggregator: the import, both head arrays,
 * the message merge, and a FeatureProviders around the outlet inside SessionProvider. Returns the
 * source unchanged when it is already wired, and null when any anchor is missing or ambiguous: a
 * half-wired root fails at runtime in ways a compile error would not, so it is all or nothing.
 */
export function patchRootForFeatures(source: string): string | null {
  if (source.includes("FeatureProviders")) return source;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";

  const outlets = [...source.matchAll(/<Outlet\s*\/>/g)];
  const outlet = outlets.length === 1 ? outlets[0] : undefined;
  const sessionOpen = source.indexOf("<SessionProvider");
  const sessionClose = source.indexOf("</SessionProvider>");
  const merge = uniqueIndex(source, MERGE_ANCHOR);
  const meta = uniqueIndex(source, "meta: [");
  const links = uniqueIndex(source, "links: [");
  const imports = endOfImports(source);
  if (
    outlet?.index === undefined ||
    merge === -1 ||
    meta === -1 ||
    links === -1 ||
    imports === -1
  ) {
    return null;
  }
  const outletAt = outlet.index;
  if (!(sessionOpen !== -1 && sessionOpen < outletAt && outletAt < sessionClose)) return null;
  const metaClose = closingBracket(source, meta + "meta: ".length);
  const linksClose = closingBracket(source, links + "links: ".length);
  if (metaClose === -1 || linksClose === -1) return null;

  // 从后往前改，前面算好的下标才一直指向原文。
  const edits: [number, (s: string) => string][] = [
    [imports, (s) => insertAt(s, imports, `${eol}${FEATURES_IMPORT}`)],
    [merge, (s) => prependFirstArg(s, merge + MERGE_ANCHOR.length, "...featureMessages", eol)],
    [metaClose, (s) => appendLastItem(s, metaClose, "...featureHead.meta", eol)],
    [linksClose, (s) => appendLastItem(s, linksClose, "...featureHead.links", eol)],
    [outletAt, (s) => wrapOutlet(s, outletAt, outlet[0].length, eol)],
  ];
  return edits.sort((a, b) => b[0] - a[0]).reduce((s, [, edit]) => edit(s), source);
}
