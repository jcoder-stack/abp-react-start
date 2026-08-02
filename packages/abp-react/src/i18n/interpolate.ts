function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 使用命名 `{name}` 或位置 `{0}` 参数插值；单个普通对象用命名参数，否则用位置参数。
 *
 * 未命中或取值为 `undefined` 的占位符原样保留。「没给值」与「给了 undefined」对读者是同一件事，
 * 渲染成字面 `undefined` 只会让缺参数的 bug 更难认。不支持转义：模板里的字面 `{0}` 无法保留。
 */
export function interpolate(template: string, args: unknown[]): string {
  if (args.length === 1 && isPlainObject(args[0])) {
    const named = args[0];
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = named[key];
      return value === undefined ? match : String(value);
    });
  }
  return template.replace(/\{(\d+)\}/g, (match, digits: string) => {
    const value = args[Number(digits)];
    return value === undefined ? match : String(value);
  });
}
