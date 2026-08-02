import type {
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useEffect, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 400;

export type TableDensity = "comfortable" | "compact";

/**
 * 服务端分页表格的状态机：分页/排序/防抖搜索/页内行选择；filter 为已提交的搜索值，
 * searchInput 为输入框即时值。rowSelection 页内作用域，翻页/排序/提交搜索均清空。
 * 结构化查询参数不归这里管，那是 useAbpTable 的表单实例自己持有的东西。
 */
export function useDataTableState(opts: { defaultPageSize?: number } = {}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: opts.defaultPageSize ?? 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearSelection = useCallback(() => setRowSelection({}), []);

  const resetPaging = useCallback(() => {
    // 新查询从第一页开始，否则会停留在越界页；页内选择同时作废
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setRowSelection({});
  }, []);

  const commit = useCallback(
    (value: string) => {
      setFilter(value);
      resetPaging();
    },
    [resetPaging],
  );

  const setSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS);
    },
    [commit],
  );

  const flushSearch = useCallback(() => {
    clearTimeout(timer.current);
    commit(searchInput);
  }, [commit, searchInput]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
    setPagination(updater);
    setRowSelection({});
  }, []);
  const onSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting(updater);
    setRowSelection({});
  }, []);
  const onRowSelectionChange = useCallback<OnChangeFn<RowSelectionState>>((updater) => {
    setRowSelection(updater);
  }, []);

  /** 只保留指定行选中；批量操作部分失败回填用。ids 为 getRowId 产出的行 ID。 */
  const keepSelected = useCallback((ids: string[]) => {
    setRowSelection(Object.fromEntries(ids.map((id) => [id, true])));
  }, []);

  return {
    params: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize, sorting, filter },
    pagination,
    sorting,
    searchInput,
    setSearch,
    flushSearch,
    resetPaging,
    onPaginationChange,
    onSortingChange,
    rowSelection,
    onRowSelectionChange,
    selectedCount: Object.keys(rowSelection).length,
    clearSelection,
    keepSelected,
    density,
    setDensity,
  };
}

export type DataTableState = ReturnType<typeof useDataTableState>;
