import { columnOrderingFeature, rowExpandingFeature } from "@tanstack/react-table";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";
import { DataTable } from "@/components/data-table/data-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { useDataTable } from "@/components/data-table/use-data-table";

/**
 * 类型契约：下游经 `features` 追加的特性，在 `dt.table`、`tableOptions`、列定义与
 * `DataTable` 的 `renderSubRow` 里都要类型可见，不改块源码、不强转就能用；没追加时
 * 对应 API 必须不存在。本文件由 `vitest --typecheck` 静态检查、从不执行。
 */

interface Row {
  id: string;
  children?: Row[];
}

const expanding = { rowExpandingFeature };
const ordering = { columnOrderingFeature };
const baseColumns: TableColumnDef<Row>[] = [{ accessorKey: "id" }];

test("追加的特性 API 在实例与 tableOptions 上可见", () => {
  const dt = useDataTable({
    columns: baseColumns,
    data: [] as Row[],
    features: expanding,
    tableOptions: { getSubRows: (r) => r.children, getRowCanExpand: () => true },
  });
  expectTypeOf(dt.table.toggleAllRowsExpanded).toBeFunction();
  expectTypeOf<
    ReturnType<typeof dt.table.getRowModel>["rows"][number]["getIsExpanded"]
  >().returns.toBeBoolean();
});

test("没追加时这些 API 不存在", () => {
  const dt = useDataTable({ columns: baseColumns, data: [] as Row[] });
  // @ts-expect-error 未注册 rowExpandingFeature
  dt.table.toggleAllRowsExpanded();
  useDataTable({
    columns: baseColumns,
    data: [] as Row[],
    // @ts-expect-error 未注册 rowExpandingFeature，没有这个选项
    tableOptions: { getRowCanExpand: () => true },
  });
});

test("按追加特性定型的列定义能在 cell 里点出行 API", () => {
  const columns: TableColumnDef<Row, typeof expanding>[] = [
    { id: "x", cell: ({ row }) => String(row.getIsExpanded()) },
  ];
  useDataTable({ columns, data: [] as Row[], features: expanding });
});

test("扩展后的实例可直接交给 DataTable，renderSubRow 拿到带追加 API 的行", () => {
  const dt = useDataTable({ columns: baseColumns, data: [] as Row[], features: expanding });
  createElement(DataTable<Row, typeof expanding>, {
    table: dt,
    renderSubRow: (row) => (row.getIsExpanded() ? "detail" : null),
  });
  // 推断形态同样成立，调用方不必写类型参数
  DataTable({ table: dt, renderSubRow: (row) => (row.getIsExpanded() ? "detail" : null) });
});

test("特性集不匹配的列定义被拒", () => {
  const orderingColumns: TableColumnDef<Row, typeof ordering>[] = [{ accessorKey: "id" }];
  // @ts-expect-error 列按 ordering 定型，表追加的是 expanding
  useDataTable({ columns: orderingColumns, data: [] as Row[], features: expanding });
});
