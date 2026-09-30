import { useCulture, useLocalization } from "@jcoder-stack/abp-react/react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { calendarFormatters, useCalendarBounds } from "@/components/date-picker/calendar-bounds";
import type { DatePickerProps } from "@/components/date-picker/date-picker";
import { dateFnsLocale } from "@/components/date-picker/date-picker";
import { TimeInput } from "@/components/date-picker/time-input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** 把 "HH:mm" 拼进 date 的时分（date 拷贝构造，不改动原引用）。 */
function mergeTime(date: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const merged = new Date(date);
  merged.setHours(hours, minutes, 0, 0);
  return merged;
}

export function DateTimePicker(props: DatePickerProps) {
  const L = useLocalization();
  const culture = useCulture();
  const [open, setOpen] = useState(false);
  const locale = dateFnsLocale(culture);
  const bounds = useCalendarBounds(props.value, props.value, props);
  const timeValue = props.value ? format(props.value, "HH:mm") : "";
  const label = props.value
    ? // 时分固定 24 小时制：locale 的 `p` 在中文下是「上午 12:00」，与全站的 `HH:mm` 不是一套读法
      `${format(props.value, "PP", { locale })} ${format(props.value, "HH:mm")}`
    : (props.placeholder ?? L("DatePicker:Placeholder"));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          type="button"
          variant="outline"
          disabled={props.disabled}
          aria-invalid={props["aria-invalid"] || undefined}
          aria-required={props["aria-required"] || undefined}
          // 日期加时分比单日期更长，窄容器里必然超宽；Button 的 whitespace-nowrap 会直接裁断，
          // 故文本自己 truncate，完整值走 title。占位文案没有「完整值」可揭示，不给 title。
          title={props.value ? label : undefined}
          className={cn(
            "w-full justify-start text-left font-normal",
            !props.value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" />
          <span className="min-w-0 truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={props.value}
          // 见 date-picker.tsx：挂载时按 value 起锚，弹层每次打开都重新定位。这里 value 会
          // 随时间输入变化，而 defaultMonth 只读挂载那一次，故改时分不会把日历甩走。
          defaultMonth={props.value}
          onSelect={(date) => {
            if (date === undefined) {
              props.onChange(undefined);
              return;
            }
            props.onChange(timeValue === "" ? date : mergeTime(date, timeValue));
          }}
          // 见 date-picker.tsx：年月下拉，范围撑到能装下当前值
          captionLayout="dropdown"
          startMonth={bounds.startMonth}
          endMonth={bounds.endMonth}
          formatters={calendarFormatters(locale)}
          locale={locale}
          autoFocus
        />
        <div className="border-t p-3">
          <TimeInput
            aria-label={L("DatePicker:Time")}
            value={timeValue}
            // 时分是日期的一部分，清空它不等于清掉日期；不可清空让框里显示与真实值保持一致
            clearable={false}
            onChange={(time) => props.onChange(mergeTime(props.value ?? new Date(), time))}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
