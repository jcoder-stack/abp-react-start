/** Plural form mapping: category name to localized string. */
export type PluralForms = Record<string, string>;

// culture 来自后端配置，可能不是合法 BCP-47（如 "zh_CN"）；缓存 null 避免对同一非法 locale 反复 try/catch。
const rulesCache = new Map<string, Intl.PluralRules | null>();

function rulesFor(locale: string): Intl.PluralRules | null {
  let rules = rulesCache.get(locale);
  if (rules === undefined) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = null;
    }
    rulesCache.set(locale, rules);
  }
  return rules;
}

/** Picks the CLDR plural category via Intl.PluralRules for locale and count; invalid locale tags fall back to 'other', then ''. */
export function selectPluralForm(count: number, forms: PluralForms, locale: string): string {
  const category = rulesFor(locale)?.select(count);
  return (category !== undefined ? forms[category] : undefined) ?? forms.other ?? "";
}
