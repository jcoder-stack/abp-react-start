import { format, isValid, parse } from "date-fns";

export const ISO_DATE = "yyyy-MM-dd";
export const ISO_DATE_TIME = "yyyy-MM-dd'T'HH:mm";

/** ISO 字符串 → Date；空串/非法输入返回 undefined。不用 `new Date(string)`，纯日期
 * 字符串按 UTC 解析，正时区显示会串前一天。 */
export function parseIso(value: string | undefined, pattern: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, pattern, new Date());
  return isValid(parsed) ? parsed : undefined;
}

/** Date → ISO 字符串；undefined → ""（表单空值语义，与 DTO 可选字段对齐）。 */
export function formatIso(date: Date | undefined, pattern: string): string {
  return date ? format(date, pattern) : "";
}
