import type { columnOrderingFeature } from "@tanstack/react-table";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { AbpTableView } from "@/components/abp/table/abp-table";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import {
  type ExpandingFeatures,
  expandingFeatures,
} from "../../../registry/ui/blocks/data-table-expanding/expanding-features";
import {
  DataTableExpandAllButton,
  expandColumn,
  treeColumn,
} from "../../../registry/ui/blocks/data-table-expanding/row-expander";
import { useCollapseOnScopeChange } from "../../../registry/ui/blocks/data-table-expanding/use-expanding-data-table";

/**
 * 类型契约：`useAbpTable` 经 `features` 追加的特性（以 `data-table-expanding` 块的
 * `expandingFeatures` 为例）在 `t.table`、`tableOptions`、列定义、`row.menu`/`row.actions` 的表对象
 * 与 `t.Table` 的 `renderSubRow` 里都要类型可见，不改块源码、不强转就能用；没追加时对应 API
 * 必须不存在。展开块是按需块、不在 starter 里，这里直接引 registry 源码。
 * 本文件由 `vitest --typecheck` 静态检查、从不执行。
 */

interface Unit {
  id: string;
  name: string;
  children?: Unit[];
}

function source(): AbpTableSource<Unit> {
  return {
    listQuery: { data: undefined, isPending: false, isFetching: false, isError: false },
    pageCount: 1,
    totalCount: 0,
    can: { create: false, update: false, delete: false },
    supportsFilter: true,
  };
}

const baseColumns: TableColumnDef<Unit>[] = [{ accessorKey: "name" }];
const treeColumns: TableColumnDef<Unit, ExpandingFeatures>[] = [
  treeColumn<Unit>({ accessorKey: "name" }),
];
const detailColumns: TableColumnDef<Unit, ExpandingFeatures>[] = [
  expandColumn<Unit>(),
  { accessorKey: "name", cell: ({ row }) => String(row.getIsExpanded()) },
];

test("树表：expandingFeatures 推断出 TExtra，t.table 与 tableOptions 带展开 API", () => {
  const t = useAbpTable((_params) => source(), {
    columns: treeColumns,
    features: expandingFeatures,
    tableOptions: { getSubRows: (u) => u.children },
  });
  expectTypeOf(t.table.toggleAllRowsExpanded).toBeFunction();
  expectTypeOf<
    ReturnType<typeof t.table.getRowModel>["rows"][number]["getIsExpanded"]
  >().returns.toBeBoolean();
  // 块的散件直接收 t，不必取 t.table 或强转
  useCollapseOnScopeChange(t);
  createElement(DataTableExpandAllButton<Unit>, { table: t });
});

test("只用基础 API 的旧列定义原样传入", () => {
  useAbpTable((_params) => source(), { columns: baseColumns, features: expandingFeatures });
});

test("折叠详情：t.Table 的 renderSubRow 拿到带展开 API 的行", () => {
  const t = useAbpTable((_params) => source(), {
    columns: detailColumns,
    features: expandingFeatures,
    tableOptions: { getRowCanExpand: () => true },
  });
  createElement(t.Table, {
    renderSubRow: (row) => (row.getIsExpanded() ? row.original.name : null),
  });
});

test("row.menu / row.actions 的表对象带追加特性 API", () => {
  useAbpTable((_params) => source(), {
    columns: baseColumns,
    features: expandingFeatures,
    row: {
      menu: (_row, table) => String(table.getIsAllRowsExpanded()),
      actions: (_row, table) => String(table.getCanSomeRowsExpand()),
    },
  });
});

test("AbpTableView 直接收扩展后的实例", () => {
  const t = useAbpTable((_params) => source(), {
    columns: baseColumns,
    features: expandingFeatures,
  });
  createElement(AbpTableView<Unit, ExpandingFeatures>, {
    t,
    slots: {},
    renderSubRow: (row) => (row.getIsExpanded() ? "detail" : null),
  });
});

test("没追加时展开 API 不存在", () => {
  const t = useAbpTable((_params) => source(), { columns: baseColumns });
  // @ts-expect-error 未注册 rowExpandingFeature
  t.table.toggleAllRowsExpanded();
  useAbpTable((_params) => source(), {
    columns: baseColumns,
    // @ts-expect-error 未注册 rowExpandingFeature，没有这个选项
    tableOptions: { getRowCanExpand: () => true },
  });
  useAbpTable((_params) => source(), {
    columns: baseColumns,
    // @ts-expect-error 未注册 rowExpandingFeature，表对象上没有展开 API
    row: { menu: (_row, table) => String(table.getIsAllRowsExpanded()) },
  });
  createElement(t.Table, {
    // @ts-expect-error 未注册 rowExpandingFeature，行上没有 getIsExpanded
    renderSubRow: (row) => (row.getIsExpanded() ? "detail" : null),
  });
  // @ts-expect-error 没有展开特性的实例交不给展开块
  useCollapseOnScopeChange(t);
});

test("特性集不匹配的列定义被拒", () => {
  const orderingColumns: TableColumnDef<
    Unit,
    { columnOrderingFeature: typeof columnOrderingFeature }
  >[] = [{ accessorKey: "name" }];
  // @ts-expect-error 列按 ordering 定型，表追加的是 expanding
  useAbpTable((_params) => source(), { columns: orderingColumns, features: expandingFeatures });
});
