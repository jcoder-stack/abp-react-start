import { describe, expect, it } from "vitest";
import { formatPersonName } from "../../src/i18n/person-name";

describe("formatPersonName", () => {
  it("joins CJK cultures surname-first without a space", () => {
    expect(formatPersonName({ name: "三", surname: "张", culture: "zh-Hans" })).toBe("张三");
    expect(formatPersonName({ name: "Taro", surname: "Yamada", culture: "ja" })).toBe("YamadaTaro");
  });

  it("joins western cultures given-name-first with a space", () => {
    expect(formatPersonName({ name: "San", surname: "Zhang", culture: "en" })).toBe("San Zhang");
  });

  it("falls back to the present part and empty string when both missing", () => {
    expect(formatPersonName({ name: "San", surname: null, culture: "en" })).toBe("San");
    expect(formatPersonName({ surname: "张", culture: "zh-Hans" })).toBe("张");
    expect(formatPersonName({ culture: "en" })).toBe("");
  });
});
