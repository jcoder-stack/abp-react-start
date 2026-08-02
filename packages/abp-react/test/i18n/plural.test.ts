import { describe, expect, it, vi } from "vitest";
import { selectPluralForm } from "../../src/i18n/plural";

const en = { one: "{0} item", other: "{0} items" };

describe("selectPluralForm", () => {
  it("selects the CLDR category for the locale (en)", () => {
    expect(selectPluralForm(1, en, "en")).toBe("{0} item");
    expect(selectPluralForm(2, en, "en")).toBe("{0} items");
    expect(selectPluralForm(0, en, "en")).toBe("{0} items");
  });

  it("falls back to other when the category form is missing", () => {
    expect(selectPluralForm(1, { other: "x" }, "en")).toBe("x");
  });

  it("returns empty string when neither the category nor other exists", () => {
    expect(selectPluralForm(2, {}, "en")).toBe("");
  });

  it("handles a locale with a single plural category (zh)", () => {
    expect(selectPluralForm(1, { other: "{0} 项" }, "zh")).toBe("{0} 项");
    expect(selectPluralForm(5, { other: "{0} 项" }, "zh")).toBe("{0} 项");
  });

  it("falls back to other instead of throwing on an invalid locale tag", () => {
    expect(selectPluralForm(1, { one: "a", other: "b" }, "not a locale!!!")).toBe("b");
    expect(selectPluralForm(1, { one: "a", other: "b" }, "zh_CN")).toBe("b");
  });

  it("constructs Intl.PluralRules once per locale", () => {
    const spy = vi.spyOn(globalThis.Intl, "PluralRules");
    try {
      selectPluralForm(1, en, "fr");
      selectPluralForm(2, en, "fr");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
