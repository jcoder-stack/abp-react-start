// 浏览器解析 URL 时会剥掉 TAB/LF/CR 并忽略首尾空格：`/<TAB>//evil.com` 会被还原成
// `//evil.com`，绕过下面的协议相对前缀判断。这类值一律拒绝，不做净化后放行。
function hasBrowserStrippedChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** 把用户提供的 returnUrl 限制为同源绝对路径；协议相对（"//"、"/\\"）、绝对 URL、含控制字符或空白的值回退为 "/"。 */
export function sanitizeReturnUrl(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  if (hasBrowserStrippedChars(value)) {
    return "/";
  }
  return value;
}
