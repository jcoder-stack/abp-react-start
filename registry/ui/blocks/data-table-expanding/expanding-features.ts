import { createExpandedRowModel, rowExpandingFeature } from "@tanstack/react-table";

/** 行展开所需的特性映射，传给 `useDataTable({ features })`；`useExpandingDataTable` 已代传。
 *  row model 工厂必须与特性同处一个映射：`tableFeatures()` 按槽位校验前置特性。
 *  模块级常量，满足 `features` 引用稳定的契约。 */
export const expandingFeatures = {
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
};

export type ExpandingFeatures = typeof expandingFeatures;
