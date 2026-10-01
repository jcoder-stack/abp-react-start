/**
 * 侧栏当前项：在候选路径里取「在段边界上是 pathname 前缀」的最长那个。
 *
 * 菜单项指向列表页，而用户大部分时间停在它的详情页；用字符串相等判断的话，详情页上侧栏不会有
 * 任何项被点亮。`/books` 命中 `/books/42` 但不命中 `/books-x`；`/identity` 与 `/identity/users`
 * 同时命中时只取后者。根路径 `/` 只在 pathname 恰好是 `/` 时命中，否则它会成为所有页面的前缀。
 */
export function activeMenuPath(
  candidates: readonly (string | undefined)[],
  pathname: string,
): string | undefined {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  let best: string | undefined;
  for (const to of candidates) {
    if (to === undefined) continue;
    const hit = to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`);
    if (!hit) continue;
    if (best === undefined || to.length > best.length) best = to;
  }
  return best;
}
