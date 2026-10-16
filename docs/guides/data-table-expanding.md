# 表格行展开：树表与折叠详情

> 简体中文版。English edition: [`data-table-expanding.en.md`](data-table-expanding.en.md)

`data-table-expanding` 块给 `data-table` 加上行展开，覆盖两种场景：

- **树表**：数据自带父子层级（组织单元、菜单、权限组），首列按层级缩进，节点可展开收起；
- **折叠详情**：平铺列表，每行可展开，在行下方插入一行通栏内容（订单明细、日志详情）。

它**不在** `jc-abp init` 的默认块里。不用就不装，`DataTable` 本身也不引用 TanStack 的展开特性，没用树表的页面不会把它打进包里。

## 安装

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/data-table-expanding.json
```

装进来 `src/components/data-table-expanding/` 下的 3 个源文件和词条 `data-table-expanding-messages.json`。前置是 `data-table` 块，没装的话会一并装上。

装完把词条合并进 `src/routes/__root.tsx` 的 `messages`：

```ts
import expandingMessages from "@/components/data-table-expanding/data-table-expanding-messages.json";
// …mergeCatalogs(…, expandingMessages, …)
```

## 树表

用 `useExpandingDataTable` 代替 `useDataTable`，通过 `tableOptions.getSubRows` 告诉表子行在哪。首列用 `treeColumn` 包一层：

```tsx
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type { TableColumnDef } from "@/components/data-table/table-core";
import type { ExpandingFeatures } from "@/components/data-table-expanding/expanding-features";
import { DataTableExpandAllButton, treeColumn } from "@/components/data-table-expanding/row-expander";
import { useExpandingDataTable } from "@/components/data-table-expanding/use-expanding-data-table";

const columns: TableColumnDef<OrgUnit, ExpandingFeatures>[] = [
  treeColumn<OrgUnit>({ accessorKey: "displayName", header: "Name" }),
  { accessorKey: "code", header: "Code" },
];
const treeOptions = { getSubRows: (unit: OrgUnit) => unit.children };

function OrgUnitTable({ units }: { units: OrgUnit[] }) {
  const dt = useExpandingDataTable({
    columns,
    data: units,
    getRowId: (unit) => unit.id,
    tableOptions: treeOptions,
  });
  return (
    <DataTable table={dt}>
      <DataTableToolbar table={dt}>
        <DataTableExpandAllButton table={dt} />
      </DataTableToolbar>
    </DataTable>
  );
}
```

- `data` 传根节点数组，子节点挂在各自父节点上。ABP 的组织单元接口返回的是平铺列表，要先按 `parentId` 组装成树。
- 树要一次全量拉下来。表仍然是服务端分页：分页和总条数都只算根节点，展开后当前页会变长。懒加载子节点不在本块范围内。
- 勾选时，勾父节点会连带选中子孙（TanStack 的默认行为）。要关掉的话传 `tableOptions.enableSubRowSelection: false`。

## 折叠详情

可展开的判断交给 `getRowCanExpand`。列数组最前面放 `expandColumn()`，详情内容从 `DataTable` 的 `renderSubRow` 给出：

```tsx
const columns: TableColumnDef<Order, ExpandingFeatures>[] = [
  expandColumn<Order>(),
  { accessorKey: "code", header: "Code" },
  { accessorKey: "total", header: "Total", meta: { align: "right" } },
];
const detailOptions = { getRowCanExpand: () => true };

const dt = useExpandingDataTable({ columns, data, getRowId: (o) => o.id, tableOptions: detailOptions });

<DataTable
  table={dt}
  renderSubRow={(row) => (row.getIsExpanded() ? <OrderLines orderId={row.original.id} /> : null)}
/>;
```

外层的 `<tr><td colSpan>` 由组件提供，`colSpan` 跟随可见列数。`<td>` 没有内边距，留白由详情内容自己决定。详情里如果要发请求，就让详情组件自己用 `useQuery`，展开时才挂载、才发请求。

## 在 `useAbpTable` 里用

`useAbpTable` 的 `features` 直接收 `expandingFeatures`，`t` 的各处类型会随之带上展开 API；`treeColumn`、`expandColumn`、`DataTableExpandAllButton` 照常用，`DataTableExpandAllButton` 直接传 `t`。折叠详情的 `renderSubRow` 传给 `t.Table`。`useAbpTable` 不认识展开特性，翻页时收起的规则要补一行 `useCollapseOnScopeChange(t)`：

```tsx
const t = useAbpTable(orgUnitTreeSource, { columns, features: expandingFeatures, tableOptions: treeOptions });
useCollapseOnScopeChange(t);
```

完整写法和树数据的取法见 [abp-table 指南](abp-table.md)第⑪步。

## 内置行为

- 翻页、改每页条数、排序、换查询条件时会收起全部，和勾选状态的清空规则一致。挂载时通过 `tableOptions.initialState.expanded` 给的初始展开状态会保留。
- 展开按钮带 `aria-expanded`，文案走词条。点击按钮、在按钮上按 Enter 或 Space 都不会触发 `onRowClick`。
- 不可展开的行会渲染一个等宽占位，保证同一层的兄弟节点左对齐。

## 不改源码扩展 `DataTable`

本块完全建立在 `data-table` 公开的扩展点上，没有改它的源码。要追加别的 TanStack 特性，照同样的路子做：

1. 把特性（连同它需要的 row model 槽）写成模块级常量，传给 `useDataTable({ features })`。`dt.table`、`tableOptions` 的类型会随之带上这些特性的 API。
2. 列定义写成 `TableColumnDef<TData, typeof myFeatures>`，cell 里就能用这些特性的行 API。只用基础 API 的旧列定义可以原样传入。
3. 需要在表体里出画面的，用 `DataTable` 的 `renderSubRow`。

要同时用展开和别的特性时，不用 `useExpandingDataTable`，直接这样写：`useDataTable({ features: { ...expandingFeatures, ...myFeatures } })`。翻页时收起展开的规则在 `useExpandingDataTable` 里，这样写时建表后补一行 `useCollapseOnScopeChange(dt)`。
