import type { PaginationState, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useState } from "react";

export type TableDensity = "comfortable" | "compact";

/**
 * 服务端分页表格的状态机：分页/排序/已提交搜索值；filter 为已提交的搜索值，
 * 输入框即时值与防抖由工具条自己持有（见 DataTableToolbar），状态机只接收提交结果。
 * 行选择不在这里——所有权在表实例上（`table.atoms.rowSelection`），经 `useDataTable` 暴露。
 * 结构化查询参数不归这里管，那是 useAbpTable 的表单实例自己持有的东西。
 */
export function useDataTableState(opts: { defaultPageSize?: number } = {}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: opts.defaultPageSize ?? 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const [density, setDensity] = useState<TableDensity>("comfortable");

  // 「当前这一页的语境」的版本号。resetPaging 每次都递增，哪怕 pageIndex 写回同值：
  // 用户本来就在第 1 页时分页/排序/搜索三者可以一起纹丝不动（查询面板提交只改结构化参数），
  // 光比这三样看不出语境换过，页内选择就会跨语境残留。选中态归表所有，清空动作在
  // useDataTable 里按这个版本号触发（见那边的 scopeKey effect）。
  const [scopeEpoch, setScopeEpoch] = useState(0);

  const resetPaging = useCallback(() => {
    // 新查询从第一页开始，否则会停留在越界页
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setScopeEpoch((n) => n + 1);
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
  }, []);
  const onSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting(updater);
  }, []);

  return {
    params: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize, sorting, filter },
    pagination,
    sorting,
    scopeEpoch,
    commitSearch,
    resetPaging,
    onPaginationChange,
    onSortingChange,
    density,
    setDensity,
  };
}

export type DataTableState = ReturnType<typeof useDataTableState>;
