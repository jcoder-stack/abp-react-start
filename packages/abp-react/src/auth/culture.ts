/** ASP.NET Core 文化 cookie 名，与 ABP 后端约定共享。定义在这里而不是 proxy：边界页在浏览器里
 *  也要读它，而 proxy 子路径引着 node:fs/tls（tls-trust），一进客户端模块图整棵树就求值失败。 */
export const CULTURE_COOKIE = ".AspNetCore.Culture";

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
