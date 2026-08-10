import type {
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { useCallback, useState } from "react";

export type TableDensity = "comfortable" | "compact";

/**
 * 服务端分页表格的状态机：分页/排序/已提交搜索值/页内行选择；filter 为已提交的搜索值，
 * 输入框即时值与防抖由工具条自己持有（见 DataTableToolbar），状态机只接收提交结果。
 * rowSelection 页内作用域，翻页/排序/提交搜索均清空。
 * 结构化查询参数不归这里管，那是 useAbpTable 的表单实例自己持有的东西。
 */
export function useDataTableState(opts: { defaultPageSize?: number } = {}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: opts.defaultPageSize ?? 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [density, setDensity] = useState<TableDensity>("comfortable");

  const clearSelection = useCallback(() => setRowSelection({}), []);

  const resetPaging = useCallback(() => {
    // 新查询从第一页开始，否则会停留在越界页；页内选择同时作废
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setRowSelection({});
  }, []);

  /** 提交搜索值：写入已提交的 filter 并回到第 1 页。防抖由调用方负责——
   *  输入节奏是输入框自己的事，放进状态机就必须把即时值也留在页面级，
   *  那正是「敲一个字母整表重画」的来源。 */
  const commitSearch = useCallback(
    (value: string) => {
      setFilter(value);
      resetPaging();
    },
    [resetPaging],
  );

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
    commitSearch,
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
