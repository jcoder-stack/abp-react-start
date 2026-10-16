import type { RowData } from "@tanstack/react-table";
import { useEffect, useRef } from "react";
import {
  type DataTableInstance,
  type UseDataTableOptions,
  useDataTable,
} from "@/components/data-table/use-data-table";
import { type ExpandingFeatures, expandingFeatures } from "./expanding-features";

export type UseExpandingDataTableOptions<TData extends RowData> = Omit<
  UseDataTableOptions<TData, ExpandingFeatures>,
  "features"
>;

/** 带行展开的 `useDataTable`。树表传 `tableOptions.getSubRows`，折叠详情传
 *  `tableOptions.getRowCanExpand: () => true` 并配 `DataTable` 的 `renderSubRow`。
 *
 *  翻页、改每页条数、排序、换查询语境时收起全部：换了一批在场行，旧的展开态（尤其是
 *  「全部展开」的 `true`）不该带进新的一页。规则与核心对勾选态的清空一致。
 *  还要追加别的特性时不用本 hook，直接 `useDataTable({ features: { ...expandingFeatures, ... } })`。 */
export function useExpandingDataTable<TData extends RowData>(
  opts: UseExpandingDataTableOptions<TData>,
): DataTableInstance<TData, ExpandingFeatures> {
  const dt = useDataTable<TData, ExpandingFeatures>({ ...opts, features: expandingFeatures });

  const { pageIndex, pageSize } = dt.state.pagination;
  const scopeKey = `${pageIndex}:${pageSize}:${dt.state.scopeEpoch}:${dt.state.sorting.map((s) => `${s.id}:${s.desc}`).join(",")}`;
  const lastScope = useRef(scopeKey);
  const { resetExpanded } = dt.table;
  useEffect(() => {
    // 用「上次作用域」而非「是不是首帧」：挂载时经 tableOptions.initialState 给的展开态要留住。
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    resetExpanded();
  }, [scopeKey, resetExpanded]);

  return dt;
}
