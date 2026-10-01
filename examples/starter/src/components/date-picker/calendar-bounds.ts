import type { Locale } from "date-fns";
import { format } from "date-fns";
import { useMemo } from "react";

/** 年下拉里的年份跨度：当年往前 10 年、往后 1 年。这是界面可选范围，不是业务参数——补一条几个
 *  季度前的记录要往回翻几十个月，逐月点太慢。当前值落在范围外时由 `widenBounds` 撑开。 */
const YEARS_BACK = 10;
const YEARS_AHEAD = 1;

export interface CalendarBounds {
  startMonth: Date;
  endMonth: Date;
}

export function calendarBounds(today: Date): CalendarBounds {
  const year = today.getFullYear();
  return {
    startMonth: new Date(year - YEARS_BACK, 0, 1),
    endMonth: new Date(year + YEARS_AHEAD, 11, 1),
  };
}

/** 模块加载时算一次：日历每渲染重算会让 `startMonth`/`endMonth` 每次都是新引用，
 *  react-day-picker 据此重置当前显示的月份。跨年那天重开页面即更新。 */
const CALENDAR_BOUNDS = calendarBounds(new Date());

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/** 把范围撑到能装下给定日期所在的整年；都在范围内时原样返回同一个对象，保住引用。
 *  不撑的话，一条十五年前的生日在日历里根本翻不到，打开时还会被夹到下界；撑到整年而不是
 *  那个月，是为了把它改成同年更早的月份也够得着。 */
export function widenBounds(
  bounds: CalendarBounds,
  dates: readonly (Date | undefined)[],
): CalendarBounds {
  let { startMonth, endMonth } = bounds;
  for (const date of dates) {
    if (date === undefined) continue;
    const month = monthStart(date);
    if (month < startMonth) startMonth = new Date(date.getFullYear(), 0, 1);
    if (month > endMonth) endMonth = new Date(date.getFullYear(), 11, 1);
  }
  return startMonth === bounds.startMonth && endMonth === bounds.endMonth
    ? bounds
    : { startMonth, endMonth };
}

const monthKey = (date: Date | undefined) =>
  date === undefined ? null : date.getFullYear() * 12 + date.getMonth();

const fromKey = (key: number | null) =>
  key === null ? undefined : new Date(Math.floor(key / 12), key % 12, 1);

/**
 * 日历的可选范围，撑到能装下当前值。`range` 覆盖默认的「当年往前 10 年、往后 1 年」（生日这类
 * 字段放宽下界用）。只在所涉月份变化时才换引用：同月里改日、改时分不换，调用方每次渲染传新的
 * `range` 对象也不换。
 */
export function useCalendarBounds(
  first?: Date,
  last?: Date,
  range?: { startMonth?: Date; endMonth?: Date },
): CalendarBounds {
  const firstKey = monthKey(first);
  const lastKey = monthKey(last);
  const startKey = monthKey(range?.startMonth);
  const endKey = monthKey(range?.endMonth);
  return useMemo(() => {
    const base =
      startKey === null && endKey === null
        ? CALENDAR_BOUNDS
        : {
            startMonth: fromKey(startKey) ?? CALENDAR_BOUNDS.startMonth,
            endMonth: fromKey(endKey) ?? CALENDAR_BOUNDS.endMonth,
          };
    return widenBounds(base, [fromKey(firstKey), fromKey(lastKey)]);
  }, [firstKey, lastKey, startKey, endKey]);
}

const monthFormatters = new Map<
  Locale | undefined,
  { formatMonthDropdown: (date: Date) => string }
>();

/** 年月下拉里的月份名。shadcn 的 Calendar 默认用 `toLocaleString("default", …)` 格式化月份下拉，
 *  走的是运行时 locale 而不是日历自己的 `locale`，中文界面里会冒出 Jan…Dec。按 locale 缓存：
 *  每渲染新建对象会让 react-day-picker 每次都拿到新的 formatters 引用。 */
export function calendarFormatters(locale: Locale | undefined) {
  let cached = monthFormatters.get(locale);
  if (!cached) {
    cached = { formatMonthDropdown: (date: Date) => format(date, "LLL", { locale }) };
    monthFormatters.set(locale, cached);
  }
  return cached;
}
