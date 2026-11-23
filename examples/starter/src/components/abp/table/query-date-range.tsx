import {
  QueryDateRange as DatePickerQueryDateRange,
  type QueryDateRangeForm as DatePickerQueryDateRangeForm,
  type QueryDateRangeProps as DatePickerQueryDateRangeProps,
} from "@/components/date-picker/query-date-range";

/** @deprecated 已移到 date-picker 块：`@/components/date-picker/query-date-range`。它不依赖 ABP，
 *  非 ABP 的表格也用得上。这个转发会在下一个大版本删除。 */
export const QueryDateRange = DatePickerQueryDateRange;
/** @deprecated 见 `QueryDateRange`。 */
export type QueryDateRangeForm<TName extends string> = DatePickerQueryDateRangeForm<TName>;
/** @deprecated 见 `QueryDateRange`。 */
export type QueryDateRangeProps<TName extends string> = DatePickerQueryDateRangeProps<TName>;
