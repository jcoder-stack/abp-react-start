import { describe, expect, it } from "vitest";
import {
  type ApplicationConfiguration,
  formatInstant,
  tenantTimeZone,
  todayIso,
  zonedMidnightUtc,
} from "../../src/core";

const withTiming = (timing: unknown) => ({ timing }) as unknown as ApplicationConfiguration;

describe("tenantTimeZone", () => {
  it("取归一后的 IANA 名", () => {
    expect(
      tenantTimeZone(
        withTiming({
          timeZone: {
            iana: { timeZoneName: "Asia/Shanghai" },
            windows: { timeZoneId: "China Standard Time" },
          },
        }),
      ),
    ).toBe("Asia/Shanghai");
  });

  it("未配置（null / 空串 / 整段缺失）时按 UTC，与后端回落一致", () => {
    expect(tenantTimeZone(withTiming({ timeZone: { iana: { timeZoneName: null } } }))).toBe("UTC");
    expect(tenantTimeZone(withTiming({ timeZone: { iana: { timeZoneName: "" } } }))).toBe("UTC");
    expect(tenantTimeZone(withTiming(undefined))).toBe("UTC");
  });

  it("运行时不认识的时区名在读取点就回落 UTC，调用方交给 Intl 不会抛错", () => {
    const zone = tenantTimeZone(
      withTiming({ timeZone: { iana: { timeZoneName: "Mars/Olympus_Mons" } } }),
    );
    expect(zone).toBe("UTC");
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone })).not.toThrow();
  });
});

describe("formatInstant", () => {
  it("按给定时区显示成 yyyy-MM-dd HH:mm", () => {
    expect(formatInstant("2026-09-30T16:30:00Z", "Asia/Shanghai")).toBe("2026-10-01 00:30");
    expect(formatInstant("2026-09-30T16:30:00Z", "UTC")).toBe("2026-09-30 16:30");
  });

  it("不带时区后缀的按 UTC 解析，不随运行机器变", () => {
    expect(formatInstant("2026-09-30T16:30:00", "Asia/Shanghai")).toBe("2026-10-01 00:30");
  });

  it("午夜写成 00 而不是 24", () => {
    expect(formatInstant("2026-09-30T16:00:00Z", "Asia/Shanghai")).toBe("2026-10-01 00:00");
  });

  it("空值返回空串，解析不了的原样返回", () => {
    expect(formatInstant(null, "UTC")).toBe("");
    expect(formatInstant("", "UTC")).toBe("");
    expect(formatInstant("not a date", "UTC")).toBe("not a date");
  });

  it("运行时不认的时区名按 UTC 显示，不抛错", () => {
    expect(formatInstant("2026-09-30T16:30:00Z", "Mars/Olympus_Mons")).toBe("2026-09-30 16:30");
  });
});

describe("todayIso", () => {
  it("按时区的日历取今天", () => {
    const now = new Date(Date.UTC(2026, 8, 30, 17, 0));
    expect(todayIso("Asia/Shanghai", now)).toBe("2026-10-01");
    expect(todayIso("UTC", now)).toBe("2026-09-30");
  });
});

describe("zonedMidnightUtc", () => {
  it("该时区某日 0 点对应的 UTC 时刻", () => {
    expect(zonedMidnightUtc("2026-10-01", "Asia/Shanghai")).toBe(Date.UTC(2026, 8, 30, 16));
  });

  it("夏令时切换日（0 点存在）按当天的偏移", () => {
    expect(zonedMidnightUtc("2026-03-08", "America/New_York")).toBe(Date.UTC(2026, 2, 8, 5));
  });

  it("0 点被夏令时跳过时，取当天第一个存在的时刻", () => {
    expect(zonedMidnightUtc("2026-09-06", "America/Santiago")).toBe(Date.UTC(2026, 8, 6, 4));
  });
});
