import { useCulture, useLocalization } from "@jcoder/abp-react/react";
import type { Locale } from "date-fns";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** culture → date-fns locale；未映射的 culture 返回 undefined（= react-day-picker 默认 enUS）。
 * 只影响展示格式，存储值恒为 ISO 字符串（见 date-io.ts）。 */
export function dateFnsLocale(culture: string): Locale | undefined {
  return culture === "zh-Hans" ? zhCN : undefined;
}

export interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export function DatePicker(props: DatePickerProps) {
  const L = useLocalization();
  const culture = useCulture();
  const [open, setOpen] = useState(false);
  const locale = dateFnsLocale(culture);
  const label = props.value
    ? format(props.value, "PPP", { locale })
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
          // 窄容器里格式化后的日期常超出按钮宽度；Button 的 whitespace-nowrap 会直接裁断，
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
          // 不给锚点时日历停在当前月，编辑一条旧记录要手动往回翻几十个月才见到原值。
          // defaultMonth 只在挂载时读一次，而 Popover 关闭即卸载内容，于是每次打开都按
          // 当时的 value 重新起锚，用户上一次翻到的月份不会残留。
          defaultMonth={props.value}
          onSelect={(date) => {
            props.onChange(date);
            setOpen(false);
          }}
          locale={locale}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
