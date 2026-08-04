import { createRequire } from "node:module";
import type ts from "typescript";

// typescript 只有 add 的 relocate 改写用得到，却有几十 MB：静态 import 会让 gen 也被迫要求它存在，
// 而 npx/bunx 未必装上 optional peer。改成首次调用时才加载，并把缺失场景翻译成可操作的提示。
let cached: typeof ts | undefined;

function loadTypeScript(): typeof ts {
  if (cached !== undefined) return cached;
  try {
    cached = createRequire(import.meta.url)("typescript") as typeof ts;
  } catch (error) {
    throw new Error(
      "jc-abp add needs typescript to rewrite relative imports, and the current project does not have it. " +
        "Install it first (bun add -D typescript) and retry.",
      { cause: error },
    );
  }
  return cached;
}

/** 把 relocate 文件里命中 [from,to] 规则的相对 import/export/动态 import 说明符按 AST 精确改写；其余字节不变。 */
export function rewriteRelativeImports(
  content: string,
  fileName: string,
  rule: [string, string],
): string {
  const ts = loadTypeScript();
  const [from, to] = rule;
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, kind);
  const edits: { start: number; end: number; value: string }[] = [];

  const consider = (spec: ts.Expression | undefined): void => {
    if (spec === undefined || !ts.isStringLiteral(spec)) return;
    const v = spec.text;
    if (!v.startsWith(from) || v.slice(from.length).startsWith("../")) return;
    edits.push({
      start: spec.getStart(sf) + 1,
      end: spec.getEnd() - 1,
      value: to + v.slice(from.length),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      consider(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      consider(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  let out = content;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.value + out.slice(e.end);
  }
  return out;
}
