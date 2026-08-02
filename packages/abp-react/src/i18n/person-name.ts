const SURNAME_FIRST_PREFIXES = ["zh", "ja", "ko"];

/** 按文化拼装人名：CJK 姓前名后连写，其余名前姓后空格分隔；缺一取一。 */
export function formatPersonName(opts: {
  name?: string | null;
  surname?: string | null;
  culture: string;
}): string {
  const name = opts.name ?? "";
  const surname = opts.surname ?? "";
  if (!name || !surname) return name || surname;
  const lang = opts.culture.split("-")[0]?.toLowerCase() ?? "";
  return SURNAME_FIRST_PREFIXES.includes(lang) ? `${surname}${name}` : `${name} ${surname}`;
}
