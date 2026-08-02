import { describe, expect, it } from "vitest";
import { interpolate } from "../../src/i18n/interpolate";

describe("interpolate", () => {
  it("positional args", () => {
    expect(interpolate("你好 {0}", ["Alice"])).toBe("你好 Alice");
    expect(interpolate("{0} and {1}", ["a", "b"])).toBe("a and b");
  });

  it("named args when a single plain object is passed", () => {
    expect(interpolate("你好 {name}", [{ name: "Alice" }])).toBe("你好 Alice");
  });

  it("leaves unmatched placeholders untouched", () => {
    expect(interpolate("{0}", [])).toBe("{0}");
    expect(interpolate("{missing}", [{ name: "Alice" }])).toBe("{missing}");
  });

  it("keeps the placeholder when the argument is undefined", () => {
    expect(interpolate("你好 {name}", [{ name: undefined }])).toBe("你好 {name}");
    expect(interpolate("{0} and {1}", ["a", undefined])).toBe("a and {1}");
  });

  it("no placeholders returns template unchanged", () => {
    expect(interpolate("plain text", ["x"])).toBe("plain text");
  });
});
