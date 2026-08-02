import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 400;
/** 一次最多渲染的候选数。cmdk 没有虚拟滚动，超长列表（如 500+ 时区）全量挂载会产生数百 ms 长任务。 */
const MAX_RENDERED_OPTIONS = 100;

export interface ComboboxOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface UseComboboxOptionsResult {
  options: ComboboxOption[];
  /** 因渲染上限被截断的条目数；>0 时 UI 应提示“继续输入以缩小范围”。 */
  truncatedCount: number;
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
}

/**
 * 静态模式：`options` 本地按 `search` 过滤（label 为 string 时不区分大小写包含，否则不过滤）。
 * 远程模式（传了 `loadOptions`）：`search` 变化防抖 400ms 后调用 `loadOptions`，
 * 结果与 `options`（若给了，视为常驻的"种子"条目，如已选值的已知 label）按 value 去重合并。
 * 种子条目始终在列表中可见，不受当前搜索词过滤，用于回显选中态与做 label 缓存。
 */
export function useComboboxOptions(opts: {
  options?: ComboboxOption[];
  loadOptions?: (search: string) => Promise<ComboboxOption[]>;
}): UseComboboxOptionsResult {
  const { options: staticOptions, loadOptions } = opts;
  const hasLoadOptions = loadOptions !== undefined;
  const loadOptionsRef = useRef(loadOptions);
  loadOptionsRef.current = loadOptions;

  const [search, setSearch] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!hasLoadOptions) return;
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      setLoading(true);
      loadOptionsRef.current?.(search).then((result) => {
        if (requestId.current === id) {
          setRemoteOptions(result);
          setLoading(false);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search, hasLoadOptions]);

  const { options, truncatedCount } = useMemo(() => {
    let full: ComboboxOption[];
    if (hasLoadOptions) {
      if (!staticOptions || staticOptions.length === 0) {
        full = remoteOptions;
      } else {
        const merged = new Map<string, ComboboxOption>();
        for (const option of staticOptions) merged.set(option.value, option);
        for (const option of remoteOptions) merged.set(option.value, option);
        full = [...merged.values()];
      }
    } else if (!staticOptions) {
      full = [];
    } else {
      const query = search.trim().toLowerCase();
      full = query
        ? staticOptions.filter((option) =>
            typeof option.label === "string" ? option.label.toLowerCase().includes(query) : true,
          )
        : staticOptions;
    }
    if (full.length <= MAX_RENDERED_OPTIONS) return { options: full, truncatedCount: 0 };
    return {
      options: full.slice(0, MAX_RENDERED_OPTIONS),
      truncatedCount: full.length - MAX_RENDERED_OPTIONS,
    };
  }, [hasLoadOptions, staticOptions, remoteOptions, search]);

  return { options, truncatedCount, loading, search, setSearch };
}
