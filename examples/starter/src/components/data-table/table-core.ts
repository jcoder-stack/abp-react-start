import {
  type ColumnDef,
  columnVisibilityFeature,
  createColumnHelper,
  type ReactTable,
  type Row,
  type RowData,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  type Table,
  type TableState,
  tableFeatures,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

/** 列 `meta` 的形状。经 `baseFeatureMap` 的 `columnMeta` 槽按表声明，不走全局 `declare module`：
 *  本文件是 copy-in 分发的，全局增广会污染下游项目的类型空间，下游再增广同一接口即冲突。 */
export interface TableColumnMeta {
  align?: "left" | "right" | "center";
  className?: string;
  label?: ReactNode;
}

/** 基础特性映射；供 DataTable 与调用方追加特性时做加法合并。
 *
 *  `columnMeta` 必须挂在这里而不是 `tableFeatures()` 调用处：`useDataTable` 用
 *  `tableFeatures({ ...baseFeatureMap, ...opts.features })` 做加法合并，槽写在调用处的话，
 *  调用方一传 `features` 就把它挤掉了。挂在 map 上则天然幸存，并顺带给下游一个扩展点——
 *  传 `columnMeta: {} as TableColumnMeta & { mine: X }` 即可加自己的键。 */
export const baseFeatureMap = {
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  // 幻影值：运行时被剥离，只有类型参与推断。
  columnMeta: {} as TableColumnMeta,
};

/** 全表共用的 v9 特性集；少注册一个对应方法即编译期消失。 */
export const features = tableFeatures(baseFeatureMap);

export type TableFeatures = typeof features;

/** 下游经 `useDataTable({ features })` 追加的特性映射。 */
export type ExtraFeatureMap = Parameters<typeof tableFeatures>[0];

/** 没有追加特性。用作各类型别名第二参数的缺省值，现有的单参数写法因此不受影响。 */
export type NoExtraFeatures = Record<never, never>;

/** 基础特性并上追加特性后的完整特性集。 */
export type TableFeaturesWith<TExtra extends ExtraFeatureMap = NoExtraFeatures> =
  typeof baseFeatureMap & TExtra;

/** `useDataTable` 让宿主订阅的状态投影。少了 `rowSelection`：那一片由表头、行、`SelectedCount`
 * 各自定点订阅，宿主不为勾选重渲染，所以 `table.state` 里也读不到它——要读走
 * `table.atoms.rowSelection.get()`（快照）或 `Subscribe`（订阅）。 */
export type HostTableState<TExtra extends ExtraFeatureMap = NoExtraFeatures> = Omit<
  TableState<TableFeaturesWith<TExtra>>,
  "rowSelection"
>;

/** DataTable 内部构造的表实例类型。`useDataTable()` 的调用方在自己的组件作用域里直接拿到它
 * （`dt.table`）；`DataTable` 的 `footer` 回调另外单独给一份。传了 `TExtra` 时，追加特性的
 * API（如 `rowExpandingFeature` 的 `toggleAllRowsExpanded`）在类型上可见。 */
export type TableInstance<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> = ReactTable<TableFeaturesWith<TExtra>, TData, HostTableState<TExtra>>;

/** 列 `cell` 上下文给出的表对象类型，比 `TableInstance` 窄。`ReactTable` 是
 * `Omit<Table, "store"> & { store, state, Subscribe, FlexRender }`，而 `state`/`Subscribe`/
 * `FlexRender` 只挂在 `useTable()` 另行 memo 出的返回对象上，cell 上下文永远拿不到。故行内插槽
 * （`AbpTableRowConfig` 的 `actions`/`menu`，喂给 `RowActionsMenu` 的 `rowActions`/`items` 属性）
 * 一律用这个类型，宁可少承诺也不给说谎的类型；
 * 要读当前状态走 `table.atoms.<slice>.get()`（快照），要订阅用从 `@tanstack/react-table`
 * 直接导入的 `Subscribe` 配 `source={table.atoms.<slice>}`——`table.state` / `table.Subscribe`
 * 只挂在 `useTable()` 的返回对象上，这里没有；`table.store` 在 v9 已废弃，勿用。要完整
 * 实例走调用方自己持有的 `dt.table` 或 `DataTable` 的 `footer` 回调。 */
export type CellTableInstance<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> = Table<TableFeaturesWith<TExtra>, TData>;

/** 绑定好特性集的行类型；`DataTable` 的行级插槽收这个。 */
export type TableRowInstance<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> = Row<TableFeaturesWith<TExtra>, TData>;

/** 绑定好 TFeatures 的列定义别名，消费方只写这个，不感知泛型。追加了特性的表传第二参数，
 *  列的 cell 里才点得出那些特性的行 API。 */
export type TableColumnDef<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> = ColumnDef<TableFeaturesWith<TExtra>, TData, unknown>;

export const createTableColumnHelper = <
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
>() => createColumnHelper<TableFeaturesWith<TExtra>, TData>();

/** 把追加了特性的表收窄回基础特性集，供内置组件消费。
 *
 *  v9 的 `Table`/`Row` 泛型是 `in out`（不变）的，`Base & Extra` 的表赋不给按 `Base` 定型的
 *  组件；而把组件改成对特性集泛型又不行——成员类型由特性映射展开，泛型下推迟求值，组件内部
 *  一个基础 API 都点不出来。运行时追加特性只多不少，基础 API 必然都在，所以集中在这一处断言，
 *  不让强转散落到各组件。 */
export function asBaseTable<TData extends RowData, TExtra extends ExtraFeatureMap>(
  table: TableInstance<TData, TExtra>,
): TableInstance<TData> {
  return table as unknown as TableInstance<TData>;
}
