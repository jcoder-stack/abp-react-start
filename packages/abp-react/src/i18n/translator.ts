import { interpolate } from "./interpolate";
import { type PluralForms, selectPluralForm } from "./plural";

/** Backend ABP resources: resource name to key-value map for the current culture. */
export type BackendResources = Record<string, Record<string, string>>;

/** Frontend i18n catalog: culture to resource to key to string or plural-forms map. */
export type FrontendCatalog = Record<string, Record<string, Record<string, unknown>>>;

/** Options for translator creation: culture, backend/frontend resources, fallback culture, the resource a key without an explicit `Resource::` prefix belongs to, missing-key callback, and optional interpolation/plural overrides (e.g. to swap in an ICU MessageFormat engine). */
export interface TranslatorOptions {
  culture: string;
  backend?: BackendResources;
  frontend?: FrontendCatalog;
  fallbackCulture?: string;
  /** ABP's `localization.defaultResourceName`; keys written as `::Key` resolve against it. Callers pass it in so this module stays free of any dependency on the configuration package. */
  defaultResourceName?: string;
  onMissing?: (key: string) => void;
  interpolate?: (template: string, args: unknown[]) => string;
  selectPluralForm?: (count: number, forms: PluralForms, culture: string) => string;
}

/** Translator interface: t (string interpolation), plural (plural form selection), and has (resolvability check). */
export interface Translator {
  /** Translates `key`, falling back to a plural entry's `other` form; returns the key itself when unresolved. */
  t(key: string, ...args: unknown[]): string;
  /** Picks the plural form for `count`; a single plain-object arg interpolates by name with `count` merged in, otherwise args are positional with the count at `{0}`. */
  plural(key: string, count: number, ...args: unknown[]): string;
  /** True exactly when `t(key)` would return a translation rather than the key.
   *  A plural entry counts only if it carries an `other` form. */
  has(key: string): boolean;
}

/** `resource` 为 null 表示键里根本没有 `::`，那是前端词库的写法（存在资源 ""）。
 *  它与显式写 `::Key`（要求默认资源）必须分开，否则前者会被 defaultResourceName 劫持。 */
function splitKey(key: string): { resource: string | null; name: string } {
  const index = key.indexOf("::");
  if (index === -1) return { resource: null, name: key };
  return { resource: key.slice(0, index), name: key.slice(index + 2) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPluralForms(value: unknown): PluralForms | undefined {
  return isPlainObject(value) ? (value as PluralForms) : undefined;
}

/** Named args and the count travel in one object so plural templates can use `{count}` alongside `{name}`; the positional shape keeps count at `{0}`. */
function pluralArgs(count: number, args: unknown[]): unknown[] {
  if (args.length === 1 && isPlainObject(args[0])) return [{ ...args[0], count }];
  return [count, ...args];
}

/** A plural table is displayable through `t` via its `other` form; anything else has no count-free rendering. */
function toTemplate(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const other = asPluralForms(value)?.other;
  return typeof other === "string" ? other : undefined;
}

/** Creates a translator. Resolution order: backend (current culture, overrides) → frontend
 *  (current culture) → frontend (culture's primary subtag) → frontend (fallback culture).
 *  An unresolved key calls `onMissing` and comes back as-is.
 *
 *  `::Key` resolves against `defaultResourceName`. A key with no `::` at all stays on the empty
 *  resource, which is where frontend catalogs live. */
export function createTranslator(opts: TranslatorOptions): Translator {
  const interp = opts.interpolate ?? interpolate;
  const selectPlural = opts.selectPluralForm ?? selectPluralForm;
  // 后端 culture 常带子标签（zh-Hans），前端词库常按主标签（zh）建：不落主标签这一层，中文用户会直接看到 fallback 的英文。
  const primarySubtag = opts.culture.split("-")[0];
  const frontendCultures =
    primarySubtag && primarySubtag !== opts.culture
      ? [opts.culture, primarySubtag]
      : [opts.culture];
  const resolve = (key: string): unknown => {
    const { resource: prefix, name } = splitKey(key);
    const resource =
      prefix === null ? "" : prefix === "" ? (opts.defaultResourceName ?? "") : prefix;
    const backendValue = opts.backend?.[resource]?.[name];
    if (backendValue !== undefined) return backendValue;
    for (const culture of frontendCultures) {
      const frontendValue = opts.frontend?.[culture]?.[resource]?.[name];
      if (frontendValue !== undefined) return frontendValue;
    }
    if (opts.fallbackCulture) {
      const frontendFallback = opts.frontend?.[opts.fallbackCulture]?.[resource]?.[name];
      if (frontendFallback !== undefined) return frontendFallback;
    }
    return undefined;
  };

  return {
    t(key, ...args) {
      const template = toTemplate(resolve(key));
      if (template !== undefined) return interp(template, args);
      opts.onMissing?.(key);
      return key;
    },
    plural(key, count, ...args) {
      const value = resolve(key);
      const interpArgs = pluralArgs(count, args);
      if (typeof value === "string") return interp(value, interpArgs);
      const forms = asPluralForms(value);
      if (forms) return interp(selectPlural(count, forms, opts.culture), interpArgs);
      opts.onMissing?.(key);
      return key;
    },
    has(key) {
      return toTemplate(resolve(key)) !== undefined;
    },
  };
}
