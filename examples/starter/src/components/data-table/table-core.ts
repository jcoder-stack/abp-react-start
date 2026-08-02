import {
  type ColumnDef,
  columnVisibilityFeature,
  createColumnHelper,
  type ReactTable,
  type RowData,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  type Table,
  tableFeatures,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

/** 基础特性映射；供 DataTable 与调用方追加特性时做加法合并。 */
export const baseFeatureMap = {
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
};

/** 全表共用的 v9 特性集；少注册一个对应方法即编译期消失。 */
export const features = tableFeatures(baseFeatureMap);

export type TableFeatures = typeof features;

/** DataTable 内部构造的表实例类型（按基础特性定型）。`useDataTable()` 的调用方在自己的组件
 * 作用域里直接拿到它（`dt.table`）；`DataTable` 的 `footer` 回调另外单独给一份。 */
export type TableInstance<TData extends RowData> = ReactTable<TableFeatures, TData>;

/** 列 `cell` 上下文给出的表对象类型，比 `TableInstance` 窄。`ReactTable` 是
 * `Omit<Table, "store"> & { store, state, Subscribe, FlexRender }`，而 `state`/`Subscribe`/
 * `FlexRender` 只挂在 `useTable()` 另行 memo 出的返回对象上，cell 上下文永远拿不到。故行内插槽
 * （`AbpTableRowConfig` 的 `actions`/`menu`，喂给 `RowActionsMenu` 的 `rowActions`/`items` 属性）
 * 一律用这个类型，宁可少承诺也不给说谎的类型；要读当前状态走 `table.store`（本类型含），要完整
 * 实例走调用方自己持有的 `dt.table` 或 `DataTable` 的 `footer` 回调。 */
export type CellTableInstance<TData extends RowData> = Table<TableFeatures, TData>;

/** 绑定好 TFeatures 的列定义别名，消费方只写这个，不感知泛型。 */
export type TableColumnDef<TData extends RowData> = ColumnDef<TableFeatures, TData, unknown>;

export const createTableColumnHelper = <TData extends RowData>() =>
  createColumnHelper<TableFeatures, TData>();

declare module "@tanstack/react-table" {
  interface ColumnMeta<TFeatures, TData, TValue> {
    align?: "left" | "right" | "center";
    className?: string;
    label?: ReactNode;
  }
}
