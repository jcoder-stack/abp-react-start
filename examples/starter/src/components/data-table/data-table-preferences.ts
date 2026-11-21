import type {
  DataTablePreferenceStore,
  DataTablePreferences,
} from "@/components/data-table/use-data-table-state";

const EMPTY: DataTablePreferences = {};
const stores = new Map<string, DataTablePreferenceStore>();

/** 存储里的内容不可信：可能是旧版本写的、别的代码写的，或被手改过。逐键收窄，认不出的丢掉。 */
function parse(raw: string | null): DataTablePreferences {
  if (raw === null) return EMPTY;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (typeof value !== "object" || value === null) return EMPTY;
  const { density, pageSize, columnVisibility } = value as Record<string, unknown>;
  const result: DataTablePreferences = {};
  if (density === "comfortable" || density === "compact") result.density = density;
  if (typeof pageSize === "number" && Number.isInteger(pageSize) && pageSize > 0) {
    result.pageSize = pageSize;
  }
  if (typeof columnVisibility === "object" && columnVisibility !== null) {
    result.columnVisibility = Object.fromEntries(
      Object.entries(columnVisibility).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  }
  return result;
}

/**
 * 把表格的视图偏好（密度、每页条数、列显隐）存进 `localStorage`，键为 `data-table:<key>`。
 * `key` 按表取名并保持稳定（如 `"identity-users"`）：改名等于丢掉所有用户已存的偏好，
 * 两张表共用一个名字则会互相覆盖。
 *
 * 同名多次调用返回同一个实例，可以直接写在渲染里。存储不可用（隐私模式、被禁用）时退化为
 * 只在本次会话内记住，不抛错。其他标签页的修改经 `storage` 事件同步过来。
 */
export function localStoragePreferences(key: string): DataTablePreferenceStore {
  const existing = stores.get(key);
  if (existing) return existing;

  const storageKey = `data-table:${key}`;
  const listeners = new Set<() => void>();
  // `undefined` 表示还没读过，与「读过、没有值」的 null 区分开。
  let raw: string | null | undefined;
  let value = EMPTY;
  let storageFailed = false;

  const store: DataTablePreferenceStore = {
    subscribe(onChange) {
      listeners.add(onChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    get() {
      if (storageFailed) return value;
      let current: string | null;
      try {
        current = window.localStorage.getItem(storageKey);
      } catch {
        storageFailed = true;
        return value;
      }
      // 只在原文变了时重新解析：useSyncExternalStore 要求快照在两次变更之间引用不变。
      if (current !== raw) {
        raw = current;
        value = parse(current);
      }
      return value;
    },
    set(next) {
      value = next;
      raw = JSON.stringify(next);
      try {
        window.localStorage.setItem(storageKey, raw);
      } catch {
        storageFailed = true;
      }
      for (const listener of listeners) listener();
    },
  };
  stores.set(key, store);
  return store;
}
