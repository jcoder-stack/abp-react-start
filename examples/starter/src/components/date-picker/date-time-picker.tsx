import { useCulture, useLocalization } from "@jcoder-stack/abp-react/react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DatePickerProps } from "@/components/date-picker/date-picker";
import { dateFnsLocale } from "@/components/date-picker/date-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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
  const timeValue = props.value ? format(props.value, "HH:mm") : "";
  const label = props.value
    ? format(props.value, "PPp", { locale })
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
          locale={locale}
          autoFocus
        />
        <div className="border-t p-3">
          <Input
            type="time"
            aria-label={L("DatePicker:Time")}
            // 原生时钟指示器会弹出浏览器自绘的时分列表，与全站视觉无关且无法主题化；隐藏它，
            // 只留手输与键盘上下调整（Firefox/Safari 本就没有这个指示器，行为因此一致）。
            className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            value={timeValue}
            onChange={(event) => {
              const time = event.target.value;
              if (time === "") return;
              props.onChange(mergeTime(props.value ?? new Date(), time));
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
