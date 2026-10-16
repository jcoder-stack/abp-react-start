# Row expanding: tree tables and collapsible details

> English edition. 简体中文版: [`data-table-expanding.md`](data-table-expanding.md)

The `data-table-expanding` block adds row expanding to `data-table`, for two scenarios:

- **Tree table**: the data carries its own hierarchy (organization units, menus, permission groups). The first column is indented by depth and nodes expand and collapse.
- **Collapsible detail**: a flat list where each row can expand to show a full-width row underneath it (order lines, log details).

It is **not** part of the default `jc-abp init` blocks. If you don't install it you don't ship it: `DataTable` itself never references TanStack's expanding feature, so pages without a tree table don't bundle it.

## Install

```bash
npx shadcn@4.13 add node_modules/@jcoder-stack/registry/public/r/data-table-expanding.json
```

This adds three source files and the `data-table-expanding-messages.json` catalog under `src/components/data-table-expanding/`. It depends on the `data-table` block, which gets installed too if it is missing.

Then merge the catalog into `messages` in `src/routes/__root.tsx`:

```ts
import expandingMessages from "@/components/data-table-expanding/data-table-expanding-messages.json";
// …mergeCatalogs(…, expandingMessages, …)
```

## Tree table

Use `useExpandingDataTable` instead of `useDataTable`, point the table at the children with `tableOptions.getSubRows`, and wrap the first column in `treeColumn`:

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

- `data` is the array of root nodes, with each child hanging off its parent. ABP's organization unit API returns a flat list, so build the tree from `parentId` first.
- Load the whole tree in one request. The table still paginates on the server, so paging and the total count only cover root nodes, and expanding makes the current page longer. Lazy-loading children is out of scope for this block.
- Checking a parent also checks its descendants (TanStack's default). Pass `tableOptions.enableSubRowSelection: false` to turn that off.

## Collapsible detail

Let `getRowCanExpand` decide which rows can expand, put `expandColumn()` first in the column array, and return the detail content from `DataTable`'s `renderSubRow`:

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

The component provides the outer `<tr><td colSpan>`, and `colSpan` follows the number of visible columns. The `<td>` has no padding, so the detail content sets its own spacing. If the detail needs data, give it its own `useQuery`: it mounts, and fetches, only when the row is expanded.

## Built-in behavior

- Everything collapses when the page, page size, sorting or query changes, matching the rule that clears row selection. An initial expanded state passed through `tableOptions.initialState.expanded` at mount is kept.
- The expand button carries `aria-expanded` and takes its label from the catalog. Clicking it, or pressing Enter or Space on it, never triggers `onRowClick`.
- Rows that can't expand render a placeholder of the same width, so sibling nodes stay left-aligned.

## Extending `DataTable` without editing its source

This block is built entirely on the extension points `data-table` exposes; it doesn't modify `data-table`'s source. Other TanStack features follow the same path:

1. Put the feature (plus any row-model slot it needs) in a module-level constant and pass it to `useDataTable({ features })`. The types of `dt.table` and `tableOptions` then include that feature's API.
2. Type columns as `TableColumnDef<TData, typeof myFeatures>` to use the feature's row API inside cells. Existing columns that only use the base API can be passed as they are.
3. For anything that has to render in the table body, use `DataTable`'s `renderSubRow`.

To combine expanding with other features, skip `useExpandingDataTable` and call `useDataTable({ features: { ...expandingFeatures, ...myFeatures } })` directly. Note that collapsing on page change lives in `useExpandingDataTable`, so you'll need to handle it yourself in that case.
