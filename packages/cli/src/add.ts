import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { rewriteRelativeImports } from "./import-rewrite";

/** Locate the registry source dir: an explicit --from wins, else walk up from startDir; throws with guidance. */
export function resolveRegistryDir(startDir: string, explicit?: string): string {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`registry dir not found: ${explicit}`);
    return explicit;
  }
  let dir = resolve(startDir);
  while (true) {
    // Published: an installed @jcoder-stack/registry. Dev monorepo: a top-level registry/ dir.
    const published = join(dir, "node_modules", "@jcoder-stack", "registry");
    if (existsSync(published) && statSync(published).isDirectory()) return published;
    const local = join(dir, "registry");
    if (existsSync(local) && statSync(local).isDirectory()) return local;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("registry dir not found; install @jcoder-stack/registry or pass --from <path>");
}

/** Relative file paths under `dir`, sorted, always `/`-separated. Windows readdir emits `\`,
 *  which would break relocate matching and cwd-relative reporting. */
export function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .map((entry) => entry.split(sep).join("/"))
    .filter((entry) => statSync(join(dir, entry)).isFile())
    .sort();
}

/** Where a registry item's files land in the consuming project: a base dir plus optional
 *  relocations (a subdir goes to a different target, with relative imports rewritten).
 *
 *  `requiresPathAlias` names a `paths` glob the item's source relies on, e.g. `"@/*"`.
 *  It is checked against the target project's tsconfig before anything is written. */
const manifestSchema = z.object({
  base: z.string(),
  relocate: z
    .array(
      z.object({
        dir: z.string(),
        to: z.string(),
        importRewrite: z.tuple([z.string(), z.string()]).optional(),
        skipIfExists: z.boolean().optional(),
      }),
    )
    .optional(),
  requiresPathAlias: z.string().optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;

/** 把路径归一到「最近的已存在祖先的 realpath + 其余段」：待写入的目标本身还不存在，而 realpathSync 只接受存在的路径。 */
function realpathOfNearestExisting(target: string): string {
  const rest: string[] = [];
  let dir = target;
  while (true) {
    if (existsSync(dir)) return join(realpathSync(dir), ...rest.reverse());
    const parent = dirname(dir);
    if (parent === dir) return target;
    rest.push(basename(dir));
    dir = parent;
  }
}

/** manifest 可能来自任意 --from 目录：base/to 若解析到项目外（`../..`、绝对路径、或项目内一条指向外部的符号链接），写盘就成了任意文件写入，必须在规划期拦下。 */
function assertInsideProject(cwd: string, dest: string): void {
  // resolve() 不解符号链接：`src/link -> /etc` 时字面路径落在界内、实际写到界外，必须比对 realpath。
  const relDest = relative(
    realpathOfNearestExisting(resolve(cwd)),
    realpathOfNearestExisting(dest),
  );
  if (relDest.startsWith("..") || isAbsolute(relDest)) {
    throw new Error(`manifest path escapes the project: ${dest}`);
  }
}

/** The relocate rule covering `rel` (rule dir itself or anything under it), if any. Accepts `\`-separated input so a raw Windows readdir path still matches the manifest's `/`-separated dirs. */
export function matchRelocation(
  rel: string,
  relocate: Manifest["relocate"],
): NonNullable<Manifest["relocate"]>[number] | undefined {
  const posix = rel.split("\\").join("/");
  return relocate?.find((r) => posix === r.dir || posix.startsWith(`${r.dir}/`));
}

/** Parses JSONC into `unknown`, throwing like `JSON.parse` on anything else. The TanStack
 *  scaffold's tsconfig ships both comments and trailing commas. String-aware: `//`, `,}` and
 *  `, ]` inside a string literal are content, not syntax. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    // 收尾括号处回删刚积累的逗号：out 里字符串字面量总以引号结尾，所以能匹配到的 `,` 必是结构逗号，
    // 而对整串跑正则会把 `"a, ]"` 这类内容一起吃掉。
    if (ch === "}" || ch === "]") out = out.replace(/,\s*$/, "");
    out += ch;
    i += 1;
  }
  return JSON.parse(out);
}

/**
 * 只读目标项目顶层 `tsconfig.json` 自身的 `compilerOptions.paths`，不追 `extends` 链。
 * 校验的目的是把隐性前置显性化，所以只有「解析成功且确无该别名」才判 "no"；文件缺失或
 * 解析失败一律 "unknown" 放行，让后续编译自然暴露问题，而不是在检测能力边界上武断拦截。
 */
function hasPathAlias(cwd: string, alias: string): "yes" | "no" | "unknown" {
  const tsconfigPath = join(cwd, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return "unknown";
  try {
    const parsed = parseJsonc(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    const paths = parsed?.compilerOptions?.paths;
    if (typeof paths !== "object" || paths === null) return "no";
    return alias in paths ? "yes" : "no";
  } catch {
    return "unknown";
  }
}

/** cwd 相对且一律 `/` 分隔：Windows 上 relative() 出的是 `\`，与 AddResult 宣称的归一化不符。 */
function toPosixRelative(cwd: string, dest: string): string {
  return relative(cwd, dest).split(sep).join("/");
}

/** What runAdd did: the source item dir, the written files, and any skipIfExists targets left untouched (all cwd-relative, `/`-separated, sorted). */
export interface AddResult {
  source: string;
  files: string[];
  skipped: string[];
}

export interface AddOptions {
  name: string;
  cwd: string;
  from?: string;
  dest?: string;
}

/** What `jc-abp add <name>` would write: the source item dir, the copies to make, the
 *  skipIfExists targets to leave alone, and the destinations that already exist and would be
 *  overwritten. A whole-tree copy leaves `copies` empty and carries its target in
 *  `wholeTreeDest` instead.
 *
 *  Planning never touches the disk, so callers can inspect `conflicts` first. */
interface AddPlan {
  source: string;
  wholeTreeDest?: string;
  copies: { src: string; dest: string; rewrite?: [string, string] }[];
  skipped: string[];
  conflicts: string[];
}

function planAdd(opts: AddOptions): AddPlan {
  // name 会拼进 registry 源路径与 wholeTreeDest，`../x` 这类值可双向逃逸目录。
  if (!/^[\w-]+$/.test(opts.name)) {
    throw new Error(`invalid item name: ${opts.name}`);
  }
  const registryDir = resolveRegistryDir(opts.cwd, opts.from);
  const source = join(registryDir, opts.name);
  if (!existsSync(source)) {
    throw new Error(`registry item not found: ${opts.name} (looked in ${registryDir})`);
  }

  const manifestPath = join(source, "manifest.json");
  if (!existsSync(manifestPath)) {
    const dest = resolve(opts.cwd, opts.dest ?? "src", opts.name);
    assertInsideProject(opts.cwd, dest);
    return {
      source,
      wholeTreeDest: dest,
      copies: [],
      skipped: [],
      conflicts: existsSync(dest) ? [dest] : [],
    };
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    // 裸 SyntaxError 只说「Unexpected token」，指不到是哪份 manifest 写坏了。
    throw new Error(
      `${opts.name} 的 manifest.json 不是合法 JSON（${manifestPath}）: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = manifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    throw new Error(`invalid manifest.json for ${opts.name}: ${parsed.error.message}`);
  }
  const manifest = parsed.data;
  if (manifest.requiresPathAlias && hasPathAlias(opts.cwd, manifest.requiresPathAlias) === "no") {
    const alias = manifest.requiresPathAlias;
    throw new Error(
      `jc-abp add ${opts.name}: 目标项目的 tsconfig.json 里没找到 "${alias}" 路径别名，而 ${opts.name} ` +
        `的源码用它引用（不写相对路径）。请在 tsconfig.json 的 compilerOptions.paths 里补一条，例如 ` +
        `{ "${alias}": ["./src/*"] }（具体相对路径按你的 src 根调整），再重跑 jc-abp add ${opts.name}。` +
        `（这里只看 tsconfig.json 顶层自身声明的 paths，不会追踪 extends 链。）`,
    );
  }
  const copies: AddPlan["copies"] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];
  for (const rel of listFilesRecursive(source)) {
    if (rel === "manifest.json") continue;
    const reloc = matchRelocation(rel, manifest.relocate);
    const dest = reloc
      ? resolve(opts.cwd, reloc.to, rel.slice(reloc.dir.length + 1))
      : resolve(opts.cwd, manifest.base, rel);
    assertInsideProject(opts.cwd, dest);
    if (existsSync(dest)) {
      if (reloc?.skipIfExists) skipped.push(toPosixRelative(opts.cwd, dest));
      else conflicts.push(dest);
      continue;
    }
    copies.push({ src: join(source, rel), dest, rewrite: reloc?.importRewrite });
  }
  return { source, copies, skipped: skipped.sort(), conflicts };
}

/** Destinations `jc-abp add <name>` would refuse to overwrite, cwd-relative and sorted.
 *  Empty when the copy would land cleanly.
 *
 *  Callers that write other things first can check this up front and fail before touching
 *  anything, instead of aborting halfway with files already on disk. `jc-abp init` needs it:
 *  it seeds config files before adding the auth shell. */
export function findAddConflicts(opts: AddOptions): string[] {
  return planAdd(opts)
    .conflicts.map((dest) => toPosixRelative(opts.cwd, dest))
    .sort();
}

/** jc-abp add <name>: copy a registry item into the project. With a manifest.json it distributes files to their declared targets (rewriting relative imports for relocated dirs); otherwise it copies the whole tree into <dest ?? "src">/<name>. Refuses to overwrite any existing file. */
export function runAdd(opts: AddOptions): AddResult {
  const plan = planAdd(opts);
  if (plan.conflicts.length > 0) {
    // 只报第一个的话，用户删掉它重跑又撞上下一个。冲突是一次性可知的，就一次报完。
    throw new Error(
      `destination already exists, refusing to overwrite (${plan.conflicts.length}): ${plan.conflicts.join(", ")}`,
    );
  }

  const wholeTreeDest = plan.wholeTreeDest;
  if (wholeTreeDest) {
    cpSync(plan.source, wholeTreeDest, { recursive: true });
    return {
      source: plan.source,
      files: listFilesRecursive(wholeTreeDest)
        .map((file) => toPosixRelative(opts.cwd, join(wholeTreeDest, file)))
        .sort(),
      skipped: [],
    };
  }

  const files: string[] = [];
  for (const item of plan.copies) {
    mkdirSync(dirname(item.dest), { recursive: true });
    if (item.rewrite) {
      const source = readFileSync(item.src, "utf8");
      writeFileSync(item.dest, rewriteRelativeImports(source, item.src, item.rewrite));
    } else {
      // 只有要改写 import 的文件才值得走字符串管道：utf8 往返会静默毁掉 registry 里的图片/字体。
      copyFileSync(item.src, item.dest);
    }
    files.push(toPosixRelative(opts.cwd, item.dest));
  }
  return { source: plan.source, files: files.sort(), skipped: plan.skipped };
}
