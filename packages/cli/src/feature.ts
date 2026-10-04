import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asRecord, type CommandRunner, installShadcnBlock } from "./blocks";

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

/** The line minus trailing `//` and inline block comments; quotes are honoured so `"http://x"` survives. */
function stripLineComments(line: string): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      const close = skipString(line, i);
      if (close === -1) return out + line.slice(i);
      out += line.slice(i, close + 1);
      i = close;
    } else if (ch === "/" && line[i + 1] === "/") {
      return out;
    } else if (ch === "/" && line[i + 1] === "*") {
      const close = line.indexOf("*/", i + 2);
      if (close === -1) return out;
      i = close + 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** A statement-ending line of an import: closing quote, optional `with { … }` / `assert { … }`, optional `;`. */
const IMPORT_END = /["'](\s*(with|assert)\s*\{[^}]*\})?\s*;?$/;
/** Lines allowed between `import {` and its `} from`: names, `type X`, `default as X`, commas, braces. */
const IMPORT_BODY = /^[\w$*\s,{}]+$/;

/** End offset (exclusive of the line break) of the last top-level import statement; -1 if none, or if
 *  an import does not look like any shape we know (we would rather skip the patch than guess). */
function endOfImports(source: string): number {
  let offset = 0;
  let end = -1;
  let inImport = false;
  for (const rawLine of source.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const code = stripLineComments(line).trim();
    if (inImport || /^import[\s"'{*]/.test(code)) {
      if (IMPORT_END.test(code)) {
        inImport = false;
        end = offset + line.length;
      } else if (inImport && !IMPORT_BODY.test(code)) {
        return -1;
      } else {
        inImport = true;
      }
    } else if (code !== "" && !/^(\/\/|\/\*|\*)/.test(line.trim())) {
      break;
    }
    offset += rawLine.length + 1;
  }
  return inImport ? -1 : end;
}

function lineIndent(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? "";
}

function insertAt(source: string, at: number, text: string): string {
  return source.slice(0, at) + text + source.slice(at);
}

/** Index of the last character before `close` that is neither whitespace nor inside a comment; `open` if there is none. */
function lastSignificant(source: string, open: number, close: number): number {
  let last = open;
  for (let i = open + 1; i < close; i++) {
    const ch = source[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      last = i;
    } else if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
    } else if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2) + 1;
    } else if (!/\s/.test(ch)) {
      last = i;
    }
  }
  return last;
}

/** Appends `item` as the array's last element, matching the last element's indentation. The comma goes
 *  right after the last real token (never inside a trailing comment); the item goes after any comments. */
function appendLastItem(
  source: string,
  open: number,
  close: number,
  item: string,
  eol: string,
): string {
  const significant = lastSignificant(source, open, close);
  if (significant === open) return insertAt(source, close, item);
  let end = close - 1;
  while (/\s/.test(source[end] ?? "")) end--;
  const withItem = insertAt(source, end + 1, `${eol}${lineIndent(source, significant)}${item},`);
  return source[significant] === "," ? withItem : insertAt(withItem, significant + 1, ",");
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
  const metaOpen = meta + "meta: ".length;
  const linksOpen = links + "links: ".length;
  const metaClose = closingBracket(source, metaOpen);
  const linksClose = closingBracket(source, linksOpen);
  if (metaClose === -1 || linksClose === -1) return null;

  // 从后往前改，前面算好的下标才一直指向原文。
  const edits: [number, (s: string) => string][] = [
    [imports, (s) => insertAt(s, imports, `${eol}${FEATURES_IMPORT}`)],
    [merge, (s) => prependFirstArg(s, merge + MERGE_ANCHOR.length, "...featureMessages", eol)],
    [metaClose, (s) => appendLastItem(s, metaOpen, metaClose, "...featureHead.meta", eol)],
    [linksClose, (s) => appendLastItem(s, linksOpen, linksClose, "...featureHead.links", eol)],
    [outletAt, (s) => wrapOutlet(s, outletAt, outlet[0].length, eol)],
  ];
  return edits.sort((a, b) => b[0] - a[0]).reduce((s, [, edit]) => edit(s), source);
}

/** The marker that tells the aggregator files apart from an app's own same-named files. */
const AGGREGATOR_MARKER = "composeFeatures";

const AGGREGATOR_FILES = [
  {
    template: fileURLToPath(new URL("../templates/features-index.ts.tpl", import.meta.url)),
    target: "src/features/index.ts",
  },
  {
    template: fileURLToPath(new URL("../templates/features-compose.ts", import.meta.url)),
    target: "src/features/compose.ts",
  },
] as const;

/**
 * Read-only: throws when an aggregator path holds a file that is not ours. src/features is a common
 * home for an app's own modules, so a same-named file is refused rather than overwritten; init runs
 * this in its preflight so the refusal comes before any write.
 */
export function assertAggregatorPathsFree(cwd: string): void {
  for (const { target } of AGGREGATOR_FILES) {
    const path = resolve(cwd, target);
    if (existsSync(path) && !readFileSync(path, "utf8").includes(AGGREGATOR_MARKER)) {
      throw new Error(
        `${target} already exists and is not the jc-abp feature aggregator; optional features need ` +
          "that path. Move your own file aside and rerun.",
      );
    }
  }
}

/**
 * Seeds the feature aggregator (src/features/index.ts + compose.ts) when missing. Once seeded the
 * files belong to the app; a foreign file at either path is refused before anything is written.
 * @returns the project-relative paths written this run.
 */
export function seedFeatureAggregator(cwd: string): string[] {
  assertAggregatorPathsFree(cwd);
  const seeded: string[] = [];
  for (const { template, target } of AGGREGATOR_FILES) {
    const path = resolve(cwd, target);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(template, path);
    seeded.push(target);
  }
  return seeded;
}

/** An optional feature: a registry block of the same name plus the env lines it needs. */
export interface FeatureDefinition {
  name: string;
  /** `KEY=value` or commented `# KEY=value` lines appended to .env.example (and .env when present). */
  env: readonly string[];
  /**
   * Binary files shadcn's JSON registry cannot carry, copied from the registry package
   * (`from`, relative to it) into the project (`to`). An existing target is the app's own and is kept.
   */
  assets?: readonly { from: string; to: string }[];
  /** Runs after the block is installed; returns one line per file it changed, for the summary. */
  postInstall?: (cwd: string) => string[];
}

const MANIFEST_FILE = "public/manifest.webmanifest";

/** Reads one key from the app's .env; quotes around the value are stripped. Undefined when unset or empty. */
function readEnvValue(cwd: string, key: string): string | undefined {
  const path = resolve(cwd, ".env");
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = new RegExp(`^${key}=(.*)$`).exec(line.trim());
    if (match === null) continue;
    const value = (match[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
    return value === "" ? undefined : value;
  }
  return undefined;
}

/**
 * Names the installed app after VITE_APP_TITLE. shadcn rewrites the manifest with the template
 * name on every install, so this runs after each one; without a title the template name stays.
 */
export function applyAppTitleToManifest(cwd: string): string[] {
  const title = readEnvValue(cwd, "VITE_APP_TITLE");
  const path = resolve(cwd, MANIFEST_FILE);
  if (title === undefined || !existsSync(path)) return [];
  const manifest = asRecord(JSON.parse(readFileSync(path, "utf8")));
  if (manifest === undefined) return [];
  writeFileSync(
    path,
    `${JSON.stringify({ ...manifest, name: title, short_name: title }, null, 2)}\n`,
  );
  return [`${MANIFEST_FILE} (name from VITE_APP_TITLE)`];
}

/** Features `init --with` and `add <name>` know about. Each feature's PR adds its entry. */
export const FEATURES: readonly FeatureDefinition[] = [
  { name: "signalr", env: ["# SIGNALR_HUB_PREFIX=/signalr-hubs"] },
  {
    name: "pwa",
    env: [],
    assets: ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"].map(
      (file) => ({ from: `assets/pwa/${file}`, to: `public/pwa/${file}` }),
    ),
    postInstall: (cwd) => applyAppTitleToManifest(cwd),
  },
];

export function findFeature(
  name: string,
  features: readonly FeatureDefinition[] = FEATURES,
): FeatureDefinition | undefined {
  return features.find((feature) => feature.name === name);
}

/** Resolves feature names, throwing before anything is written when one is unknown. */
export function resolveFeatures(
  names: readonly string[],
  features: readonly FeatureDefinition[] = FEATURES,
): FeatureDefinition[] {
  const unknown = names.filter((name) => findFeature(name, features) === undefined);
  if (unknown.length > 0) {
    const available = features.map((feature) => feature.name).join(", ") || "none";
    throw new Error(`unknown feature: ${unknown.join(", ")} (available: ${available})`);
  }
  return names.flatMap((name) => {
    const feature = findFeature(name, features);
    return feature === undefined ? [] : [feature];
  });
}

const ROOT_FILE = "src/routes/__root.tsx";
/** __root.tsx.bak already holds init's backup of the scaffold original; this one must not clobber it. */
const ROOT_BACKUP_SUFFIX = ".pre-features.bak";

export const FEATURES_WIRING_GUIDE_PATH = fileURLToPath(
  new URL("../templates/features-wiring-guide.txt", import.meta.url),
);

export type RootWiring = "wired" | "already" | "manual";

function wireRootForFeatures(cwd: string): RootWiring {
  const rootPath = resolve(cwd, ROOT_FILE);
  if (!existsSync(rootPath)) return "manual";
  const source = readFileSync(rootPath, "utf8");
  const patched = patchRootForFeatures(source);
  if (patched === null) return "manual";
  if (patched === source) return "already";
  copyFileSync(rootPath, `${rootPath}${ROOT_BACKUP_SUFFIX}`);
  writeFileSync(rootPath, patched);
  return "wired";
}

/** `KEY=` or `# KEY=`: a commented key still counts as present, so a user's deliberate opt-out survives. */
const ENV_KEY = /^#?\s*([A-Z][A-Z0-9_]*)=/;

/**
 * Appends the lines whose key the file lacks. A missing file is left missing: creating .env here
 * would produce one without the auth secrets init derives.
 * @returns the keys appended.
 */
function appendEnvLines(path: string, lines: readonly string[]): string[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const present = new Set(text.split(/\r?\n/).flatMap((line) => ENV_KEY.exec(line)?.[1] ?? []));
  const missing = lines.filter((line) => {
    const key = ENV_KEY.exec(line)?.[1];
    return key !== undefined && !present.has(key);
  });
  if (missing.length === 0) return [];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lead = text === "" || text.endsWith("\n") ? "" : eol;
  writeFileSync(path, `${text}${lead}${missing.join(eol)}${eol}`);
  return missing.flatMap((line) => ENV_KEY.exec(line)?.[1] ?? []);
}

export interface FeatureInstallResult {
  name: string;
  /** Aggregator files written this run; empty once the project has them. */
  aggregatorSeeded: string[];
  /** "manual": the root's shape was not recognized and it was left untouched; print the wiring guide. */
  root: RootWiring;
  /** Env keys appended to .env.example and/or .env this run. */
  envKeysAdded: string[];
  /** Assets copied and files rewritten after the block install, this run. */
  filesWritten: string[];
}

/**
 * Installs one optional feature into an initialized project: aggregator, root wiring, the block
 * itself, then its env lines. Every step only fills what is missing, so rerunning is safe.
 * Throws a plain Error when the aggregator path is taken or the block install fails.
 */
export async function installFeature(opts: {
  cwd: string;
  registryDir: string;
  feature: FeatureDefinition;
  runner: CommandRunner;
}): Promise<FeatureInstallResult> {
  // CLI 与 registry 版本错配（CLI 认识这个功能、registry 还没有它）要在改任何文件前拦下，
  // 否则聚合点和根文件已经动了才报「找不到块」。
  const blockJson = join(opts.registryDir, "public", "r", `${opts.feature.name}.json`);
  if (!existsSync(blockJson)) {
    throw new Error(
      `feature "${opts.feature.name}" is not in the registry at ${opts.registryDir} (expected ${blockJson}); ` +
        "upgrade @jcoder-stack/registry to the same version as @jcoder-stack/cli",
    );
  }
  const missingAssets = (opts.feature.assets ?? [])
    .map((asset) => join(opts.registryDir, asset.from))
    .filter((path) => !existsSync(path));
  if (missingAssets.length > 0) {
    throw new Error(
      `feature "${opts.feature.name}" needs files the registry does not have (${missingAssets.join(", ")}); ` +
        "upgrade @jcoder-stack/registry to the same version as @jcoder-stack/cli",
    );
  }
  const aggregatorSeeded = seedFeatureAggregator(opts.cwd);
  const root = wireRootForFeatures(opts.cwd);
  await installShadcnBlock(opts.cwd, opts.registryDir, opts.feature.name, opts.runner);
  const envKeysAdded = [
    ...new Set([
      ...appendEnvLines(resolve(opts.cwd, ".env.example"), opts.feature.env),
      ...appendEnvLines(resolve(opts.cwd, ".env"), opts.feature.env),
    ]),
  ];
  const filesWritten: string[] = [];
  for (const asset of opts.feature.assets ?? []) {
    const target = resolve(opts.cwd, asset.to);
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(opts.registryDir, asset.from), target);
    filesWritten.push(asset.to);
  }
  filesWritten.push(...(opts.feature.postInstall?.(opts.cwd) ?? []));
  return { name: opts.feature.name, aggregatorSeeded, root, envKeysAdded, filesWritten };
}
