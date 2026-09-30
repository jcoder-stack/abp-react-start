import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const HOUR_DIGITS = 2;
const MAX_DIGITS = 4;

/** 边敲边整形：只留数字，最多四位；三位按 `H:mm`、四位按 `HH:mm` 补冒号——与 `normalizeTime`
 *  的口径一致，框里看到的就是失焦会落成的值（`930` 显示 `9:30`，而不是 `93:0`）。 */
export function maskTimeInput(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, MAX_DIGITS);
  if (digits.length <= HOUR_DIGITS) return digits;
  const hourDigits = digits.length === MAX_DIGITS ? HOUR_DIGITS : 1;
  return `${digits.slice(0, hourDigits)}:${digits.slice(hourDigits)}`;
}

/**
 * 把输入整理成 `HH:mm`，整理不出来时返回 null。
 * 只给一两位数字时按小时理解（`9` → `09:00`），敲 `930` 的意思是 9 点半。
 */
export function normalizeTime(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const padded =
    digits.length <= HOUR_DIGITS
      ? `${digits.padStart(HOUR_DIGITS, "0")}00`
      : digits.padStart(MAX_DIGITS, "0");
  const hour = Number(padded.slice(0, HOUR_DIGITS));
  const minute = Number(padded.slice(HOUR_DIGITS));
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * 失焦时该落成什么值。
 *
 * 整理不出来时保留表单里的原值：清空一个看不懂的时刻，等于在用户只是点了一下的情况下把它悄悄
 * 删掉，而后端跨天的 TimeSpan（`d.HH:mm`）正好长成这样。空输入是明确要清掉，照办——除非
 * 这个时刻不可清空（`clearable: false`），那就回到原值。
 */
export function resolveTimeOnBlur(text: string, current: string, clearable = true): string {
  if (text.trim() === "") return clearable ? "" : current;
  return normalizeTime(text) ?? current;
}

/**
 * 24 小时制的时分输入，显示与取值恒为 `HH:mm`（空串表示未填）。
 *
 * 原生 `<input type="time">` 的 12/24 制跟浏览器区域设置走，不受页面 `lang` 控制：中文界面上会
 * 渲染成 `05:30 PM`，与系统其余地方的 `17:30` 不是一套读法；弹出的时分列表是浏览器自绘的，
 * 无法主题化。这里换成受控文本框。
 */
export function TimeInput(props: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  /** 能否清空成 `""`，默认可以。为 false 时清空后失焦回到原值，也不往外发空串——用在「时分
   *  只是日期的一部分」的地方，否则框里显示已清空、真实值却还带着原时分。 */
  clearable?: boolean;
}) {
  const clearable = props.clearable ?? true;
  const [text, setText] = useState(props.value);
  // 外部改了值（换一天、表单重置）要跟上；正在敲的中间态由 onChange 自己维护
  useEffect(() => setText(props.value), [props.value]);

  return (
    <Input
      id={props.id}
      name={props.name}
      inputMode="numeric"
      placeholder="--:--"
      className={cn("tabular-nums", props.className)}
      value={text}
      disabled={props.disabled}
      aria-label={props["aria-label"]}
      aria-required={props["aria-required"]}
      aria-invalid={props["aria-invalid"]}
      // 聚焦即全选：已有 `00:00` 时直接敲 `930` 要整体替换，否则新数字追加在后面、被掩码截掉
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const masked = maskTimeInput(event.target.value);
        setText(masked);
        // 敲满四位才往外发，半截的 `09:3` 会被上游当成一个时刻
        const normalized = masked.length === 5 ? normalizeTime(masked) : null;
        if (normalized !== null) props.onChange(normalized);
        if (masked === "" && clearable) props.onChange("");
      }}
      onBlur={() => {
        const resolved = resolveTimeOnBlur(text, props.value, clearable);
        setText(resolved);
        // 值没变就不发：只是 Tab 经过也调 onChange，表单会被标成已修改，关抽屉时平白弹确认
        if (resolved !== props.value) props.onChange(resolved);
        props.onBlur?.();
      }}
    />
  );
}
