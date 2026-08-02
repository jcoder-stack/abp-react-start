import { useLocalization } from "@jcoder/abp-react/react";
import { useState } from "react";
import { DatePicker } from "@/components/date-picker/date-picker";
import { type DateRange, DateRangePicker } from "@/components/date-picker/date-range-picker";
import { DateTimePicker } from "@/components/date-picker/date-time-picker";

/** date-picker 展示：单日期/区间/日期时间三种 popover 并列，格式随当前文化（date-fns locale）联动。 */
export function DatePickerDemo() {
  const L = useLocalization();
  const [date, setDate] = useState<Date | undefined>();
  const [range, setRange] = useState<DateRange | undefined>();
  const [dateTime, setDateTime] = useState<Date | undefined>();
  return (
    <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
      <DatePicker value={date} onChange={setDate} placeholder={L("Showcase:DatePickerSingle")} />
      <DateRangePicker
        value={range}
        onChange={setRange}
        placeholder={L("Showcase:DatePickerRange")}
      />
      <DateTimePicker
        value={dateTime}
        onChange={setDateTime}
        placeholder={L("Showcase:DatePickerDateTime")}
      />
    </div>
  );
}
