import { useCulture, useLocalization } from "@jcoder-stack/abp-react/react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { dateFnsLocale } from "@/components/date-picker/date-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRange {
  from?: Date;
  to?: Date;
}

/** 只有起止都齐全才算日历可继续拼接的锚点；只给了 from 的半截值会被
 * react-day-picker 的 addToRange 当成「已有起点」，下一次点选立刻收尾成
 * from～该天，无法再分两步选出真正的止点，故半截值一律当空处理。 */
function toCalendarRange(range: DateRange | undefined): DateRange | undefined {
  return range?.from !== undefined && range.to !== undefined ? range : undefined;
}

export interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export function DateRangePicker(props: DateRangePickerProps) {
  const L = useLocalization();
  const culture = useCulture();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(() => toCalendarRange(props.value));
  const locale = dateFnsLocale(culture);
  const { value } = props;
  const label =
    value?.from !== undefined
      ? `${format(value.from, "PP", { locale })} – ${
          value.to !== undefined ? format(value.to, "PP", { locale }) : ""
        }`
      : (props.placeholder ?? L("DatePicker:RangePlaceholder"));
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 打开瞬间用最新受控 value 重新起锚；打开期间的中间选区只活在 working
        // 里，不受父组件重渲染影响，两次点选之间不会被打断。
        if (next) setWorking(toCalendarRange(value));
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          type="button"
          variant="outline"
          disabled={props.disabled}
          aria-invalid={props["aria-invalid"] || undefined}
          aria-required={props["aria-required"] || undefined}
          // 区间文本是两个完整日期，窄容器里必然超宽；Button 的 whitespace-nowrap 会直接裁断，
          // 故文本自己 truncate，完整区间走 title。占位文案没有「完整值」可揭示，不给 title。
          title={value?.from !== undefined ? label : undefined}
          className={cn(
            "w-full justify-start text-left font-normal",
            value?.from === undefined && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" />
          <span className="min-w-0 truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          // 相邻两个月的网格互相包含对方的溢出日，开启溢出日时同一天会在两处都带上选中高亮，
          // 看起来是重复的一天、区间断成两截。
          showOutsideDays={false}
          resetOnSelect
          // 见 date-picker.tsx：按起始日起锚（numberOfMonths=2 时它是左侧那个月）。锚点取
          // 用 props.value 而不是 working，半截区间的 working 被归零，仍应停在用户已选的起始月。
          defaultMonth={value?.from}
          selected={working ? { from: working.from, to: working.to } : undefined}
          onSelect={(range) => {
            setWorking(range);
            props.onChange(range);
            if (range?.from !== undefined && range?.to !== undefined) setOpen(false);
          }}
          locale={locale}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
