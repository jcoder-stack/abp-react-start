import { describe, expect, it } from "vitest";
import { formatCultureCookie, parseCultureCookie } from "../../src/auth/culture";

describe("culture cookie", () => {
  it("parses and formats the ASP.NET Core culture value", () => {
    expect(parseCultureCookie("c=zh-Hans|uic=zh-Hans")).toBe("zh-Hans");
    expect(parseCultureCookie(undefined)).toBeNull();
    expect(formatCultureCookie("en")).toBe("c=en|uic=en");
  });
});
