/** 解析 ASP.NET Core 文化 cookie 值（`c=zh-Hans|uic=zh-Hans`）为文化名，无则 null。 */
export function parseCultureCookie(value: string | undefined): string | null {
  if (!value) return null;
  for (const part of value.split("|")) {
    if (part.startsWith("c=")) return part.slice(2);
  }
  return null;
}

/** 组 ASP.NET Core 文化 cookie 值。 */
export function formatCultureCookie(culture: string): string {
  return `c=${culture}|uic=${culture}`;
}
