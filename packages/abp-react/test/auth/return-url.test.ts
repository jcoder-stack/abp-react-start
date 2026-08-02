import { describe, expect, it } from "vitest";
import { sanitizeReturnUrl } from "../../src/auth/return-url";

/** 浏览器解析 URL 时会剥掉的字符：TAB / LF / CR，以及会被忽略的前后空格。 */
const STRIPPED_BY_BROWSERS = [9, 10, 13, 32];

describe("sanitizeReturnUrl", () => {
  it("keeps same-origin absolute paths", () => {
    expect(sanitizeReturnUrl("/books")).toBe("/books");
    expect(sanitizeReturnUrl("/")).toBe("/");
  });

  it("rejects protocol-relative and absolute URLs, and empty input, to /", () => {
    expect(sanitizeReturnUrl("//evil.com")).toBe("/");
    expect(sanitizeReturnUrl("/\\evil.com")).toBe("/");
    expect(sanitizeReturnUrl("https://evil.com")).toBe("/");
    expect(sanitizeReturnUrl(null)).toBe("/");
    expect(sanitizeReturnUrl(undefined)).toBe("/");
  });

  it("rejects values carrying characters browsers strip while parsing", () => {
    // 剥掉这些字符后 "/<TAB>//evil.com" 还原成 "//evil.com"，即跳出本站的开放重定向。
    for (const code of STRIPPED_BY_BROWSERS) {
      const value = `/${String.fromCharCode(code)}//evil.com`;
      expect(sanitizeReturnUrl(value)).toBe("/");
    }
  });

  it("keeps percent-encoded characters, which browsers do not strip", () => {
    expect(sanitizeReturnUrl("/books?q=%09")).toBe("/books?q=%09");
  });
});
