import { describe, expect, it } from "vitest";
import { rewriteRelativeImports } from "../src/import-rewrite";

const RULE: [string, string] = ["../", "../auth/"];
const rewrite = (src: string) => rewriteRelativeImports(src, "api.route.ts", RULE);

describe("rewriteRelativeImports", () => {
  it("rewrites a single-level relative import into the relocated base", () => {
    expect(rewrite('import { handleLogin } from "../handlers";')).toBe(
      'import { handleLogin } from "../auth/handlers";',
    );
    expect(rewrite('import { getAuthContext } from "../server/auth-context";')).toBe(
      'import { getAuthContext } from "../auth/server/auth-context";',
    );
  });

  it("leaves bare package specifiers and same-dir imports untouched", () => {
    expect(rewrite('import { createFileRoute } from "@tanstack/react-router";')).toBe(
      'import { createFileRoute } from "@tanstack/react-router";',
    );
    expect(rewrite('import { a } from "./sibling";')).toBe('import { a } from "./sibling";');
  });

  it("does not mangle multi-level specifiers that escape the item", () => {
    expect(rewrite('import { x } from "../../escape";')).toBe('import { x } from "../../escape";');
  });

  it("rewrites re-exports and dynamic imports", () => {
    expect(rewrite('export { y } from "../culture";')).toBe('export { y } from "../auth/culture";');
    expect(rewrite('const m = await import("../handlers");')).toBe(
      'const m = await import("../auth/handlers");',
    );
  });

  it("handles single quotes and type-only imports", () => {
    expect(rewrite("import { z } from '../handlers';")).toBe(
      "import { z } from '../auth/handlers';",
    );
    expect(rewrite('import type { T } from "../handlers";')).toBe(
      'import type { T } from "../auth/handlers";',
    );
  });

  it("ignores fake specifiers inside comments and string constants", () => {
    const src = '// note: from "../fake" stays\nconst s = \'from "../fake"\';';
    expect(rewrite(src)).toBe(src);
  });
});
