import type { HeaderContext, RowData } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { CellTableInstance, TableFeatures } from "@/components/data-table/table-core";

/** 列标签解析阶梯：meta.label → 表头 flexRender 结果（与表头逐字一致）→ 隐藏列兜底直调
 * header 渲染器 → column.id。
 *
 * 契约：列隐藏后 `getHeaderGroups()`（进而 `getFlatHeaders()`）不会给出该列的表头对象，v9
 * 引擎在 `getVisibleLeafColumns()` 就把它筛掉了。兜底分支不含真实 `header`，只拼一个
 * `{ table, column }` 上下文调用 `columnDef.header`；若你的 header 渲染器读取上下文里的
 * `header` 字段，请改设 `meta.label` 显式指定菜单文案。 */
export function resolveColumnLabel<TData extends RowData>(
  table: CellTableInstance<TData>,
  columnId: string,
): ReactNode {
  const column = table.getAllLeafColumns().find((c) => c.id === columnId);
  const metaLabel = column?.columnDef.meta?.label;
  if (metaLabel !== undefined) return metaLabel;
  const header = table.getFlatHeaders().find((h) => h.column.id === columnId);
  if (header && !header.isPlaceholder) {
    return flexRender(header.column.columnDef.header, header.getContext());
  }
  if (!column) return columnId;
  const rawHeader = column.columnDef.header;
  if (typeof rawHeader === "string") return rawHeader;
  if (typeof rawHeader === "function") {
    // 隐藏列没有 Header 实例可用；用真实 table/column 拼一个残缺上下文喂给渲染器，仅本文件内断言。
    const context = { table, column } as HeaderContext<TableFeatures, TData, unknown>;
    return rawHeader(context);
  }
  return columnId;
}
