import { zhCN } from "date-fns/locale";
import { describe, expect, it } from "vitest";
import { formatIso, ISO_DATE, ISO_DATE_TIME, parseIso } from "@/components/date-picker/date-io";
import { dateFnsLocale } from "@/components/date-picker/date-picker";

describe("parseIso", () => {
  it.each([
    ["空串", ""],
    ["undefined", undefined],
    ["非法输入", "not-a-date"],
  ])("%s 返回 undefined", (_label, input) => {
    expect(parseIso(input, ISO_DATE)).toBeUndefined();
  });

  it("按本地日历字段解析，不经过 UTC 偏移", () => {
    const parsed = parseIso("2026-07-29", ISO_DATE);
    expect(parsed).toBeDefined();
    expect([parsed?.getFullYear(), parsed?.getMonth(), parsed?.getDate()]).toEqual([2026, 6, 29]);
  });
});

describe("formatIso", () => {
  it("undefined 返回空串", () => {
    expect(formatIso(undefined, ISO_DATE)).toBe("");
  });

  it("格式化为 ISO_DATE", () => {
    expect(formatIso(new Date(2026, 6, 29), ISO_DATE)).toBe("2026-07-29");
  });
});

describe("parseIso/formatIso 往返一致", () => {
  it.each([
    ["ISO_DATE", "2026-07-29", ISO_DATE],
    ["ISO_DATE_TIME", "2026-07-29T10:15", ISO_DATE_TIME],
  ])("%s 往返", (_label, iso, pattern) => {
    expect(formatIso(parseIso(iso, pattern), pattern)).toBe(iso);
  });
});

describe("dateFnsLocale", () => {
  // 未映射的 culture 返回 undefined = 沿用 react-day-picker 默认 enUS。
  it.each([
    ["zh-Hans", zhCN],
    ["en", undefined],
    ["fr", undefined],
  ])("%s 映射到预期 locale", (culture, expected) => {
    expect(dateFnsLocale(culture)).toBe(expected);
  });
});
