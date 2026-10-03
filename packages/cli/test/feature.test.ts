import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { patchRootForFeatures } from "../src/feature";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

/** 只看语法：补丁产物至少得是能被编译器读懂的 TSX。 */
function syntaxErrors(source: string): string[] {
  const out = ts.transpileModule(source, {
    fileName: "__root.tsx",
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

function expectWired(patched: string | null): string {
  expect(patched).not.toBeNull();
  const out = patched ?? "";
  expect(syntaxErrors(out)).toEqual([]);
  expect(out.match(/from "@\/features";/g)).toHaveLength(1);
  expect(out).toMatch(/= mergeCatalogs\(\s*\.\.\.featureMessages[,)]/);
  expect(out).toMatch(/\.\.\.featureHead\.meta,\s*\]/);
  expect(out).toMatch(/\.\.\.featureHead\.links,\s*\]/);
  expect(out).toMatch(
    /<SessionProvider[^>]*>\s*<FeatureProviders>\s*<Outlet\s*\/>\s*<\/FeatureProviders>\s*<\/SessionProvider>/,
  );
  return out;
}

describe("patchRootForFeatures", () => {
  it.each(["root-v0.4.tsx.txt", "root-starter-v0.4.tsx.txt"])(
    "wires a 0.4 root (%s) at all three points",
    (name) => {
      expectWired(patchRootForFeatures(fixture(name)));
    },
  );

  it("leaves an already-wired root alone so reruns are no-ops", () => {
    const once = expectWired(patchRootForFeatures(fixture("root-v0.4.tsx.txt")));
    expect(patchRootForFeatures(once)).toBe(once);
  });

  it("accepts <Outlet/> without the space", () => {
    const source = fixture("root-v0.4.tsx.txt").replace("<Outlet />", "<Outlet/>");
    expectWired(patchRootForFeatures(source));
  });

  it("keeps CRLF files CRLF", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(/\n/g, "\r\n");
    const out = expectWired(patchRootForFeatures(source));
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("puts the import after the last import even when that one spans lines", () => {
    // 0.4 模板里块词条 import 排在最后；把最后一条改成多行，插入点必须落在它的 `} from` 之后。
    const source = fixture("root-v0.4.tsx.txt").replace(
      'import appMessages from "@/i18n/app-messages.json";',
      'import {\n  default as appMessages,\n} from "@/i18n/app-messages.json";',
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain('} from "@/i18n/app-messages.json";\nimport { FeatureProviders');
  });

  it("feeds featureMessages to an empty mergeCatalogs()", () => {
    const source = fixture("root-v0.4.tsx.txt").replace(
      "mergeCatalogs(layoutMessages, appMessages)",
      "mergeCatalogs()",
    );
    const out = expectWired(patchRootForFeatures(source));
    expect(out).toContain("= mergeCatalogs(...featureMessages)");
  });

  it.each([
    ["the outlet is missing", (s: string) => s.replace("<Outlet />", "")],
    [
      "the outlet sits outside SessionProvider",
      (s: string) =>
        s.replace("<Outlet />", "").replace("<Toaster", "<Outlet />\n        <Toaster"),
    ],
    [
      "there are two head meta arrays",
      (s: string) => s.replace("links: [", "links: [], meta: [], links2: ["),
    ],
    [
      "the catalogs are not built with mergeCatalogs",
      (s: string) => s.replace("= mergeCatalogs(", "= combine("),
    ],
  ])("returns null (no partial patch) when %s", (_, mutate) => {
    expect(patchRootForFeatures(mutate(fixture("root-v0.4.tsx.txt")))).toBeNull();
  });
});
