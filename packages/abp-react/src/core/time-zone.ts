import type { ApplicationConfiguration } from "./application-configuration";

/** 租户时区的唯一读取点：`Abp.Timing.TimeZone` 经 application-configuration 归一成 IANA 名。
 *  未配置或无法识别时按 UTC——后端 `SettingTenantTimeZoneProvider` 同样回落 UTC；回落到浏览器
 *  时区等于又多一个时区来源，SSR 与浏览器还会算出不同的结果。运行时 Intl 不认识的名字同样按
 *  UTC，于是这里返回的值永远能直接交给 `Intl`。 */
export function tenantTimeZone(config: ApplicationConfiguration): string {
  const name = config.timing?.timeZone?.iana?.timeZoneName;
  return name && isSupportedTimeZone(name) ? name : "UTC";
}

/** 精简 ICU 的运行时可能不认识某些 IANA 名；在读取点就把它们收成 UTC。 */
function isSupportedTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

/** 运行时 Intl 不认的时区名（精简 ICU）回落 UTC：与后端未配置时的口径一致，也不让页面白屏。 */
function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = wallClockFormatters.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    // h23：部分引擎在 hour12: false 下把午夜写成 24
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    formatter = wallClockFormatter("UTC");
  }
  wallClockFormatters.set(timeZone, formatter);
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(ms: number, timeZone: string): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of wallClockFormatter(timeZone).formatToParts(ms)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/** 只接 API 返回的真实时刻：不带时区后缀的也当 UTC，按运行时本地解析会让结果随机器变。 */
function parseInstant(value: string): number {
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}

/** 真实时刻（`creationTime`、`*Utc` 等）按给定时区显示成 `yyyy-MM-dd HH:mm`。空值返回空串，
 *  解析不了的原样返回。已是墙钟的字段（不带时区语义的本地时间）不要走这里。 */
export function formatInstant(value: string | null | undefined, timeZone: string): string {
  if (!value) return "";
  const ms = parseInstant(value);
  if (Number.isNaN(ms)) return value;
  const w = wallClock(ms, timeZone);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)} ${pad2(w.hour)}:${pad2(w.minute)}`;
}

/** 「今天」按给定时区的日历取（`yyyy-MM-dd`）：运行时本地时区在 SSR 与浏览器里可能不同，
 *  首屏与客户端跳转会算出不同的今天。 */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  const w = wallClock(now.getTime(), timeZone);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

/** 该时区某日（`yyyy-MM-dd`）0 点对应的 UTC 毫秒。偏移随时刻变（夏令时），所以用猜出的时刻
 *  再取一次偏移校正；0 点被跳过时返回当天第一个存在的时刻。`isoDate` 不是 `yyyy-MM-dd` 时
 *  抛 `RangeError`。 */
export function zonedMidnightUtc(isoDate: string, timeZone: string): number {
  const wall = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
  const offsetAt = (ms: number) => {
    const w = wallClock(ms, timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms;
  };
  const guess = wall - offsetAt(wall);
  const corrected = wall - offsetAt(guess);
  // 0 点被夏令时跳过时，校正结果会落回前一天 23 点；当天第一个存在的时刻就是跳变那一刻，即 guess
  return todayIso(timeZone, new Date(corrected)) === isoDate ? corrected : guess;
}
