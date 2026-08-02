import { useLocalization } from "@jcoder/abp-react/react";
import { useMemo } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/abp/table/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface BlockRow {
  name: string;
  files: number;
  status: "stable" | "beta";
}

// 拿脚手架自己的 block 当示例数据：块名是专有名词（照写），文件数演示排序，状态演示词条化枚举。
const BLOCKS: BlockRow[] = [
  { name: "app-shell", files: 8, status: "stable" },
  { name: "abp-layout", files: 6, status: "stable" },
  { name: "abp-login", files: 5, status: "stable" },
  { name: "data-table", files: 4, status: "stable" },
  { name: "abp-table", files: 6, status: "stable" },
  { name: "form", files: 8, status: "stable" },
  { name: "tree", files: 3, status: "stable" },
  { name: "combobox", files: 4, status: "beta" },
  { name: "admin-pages", files: 12, status: "stable" },
  { name: "abp-permission-sheet", files: 3, status: "beta" },
  { name: "showcase", files: 6, status: "beta" },
  { name: "menu", files: 1, status: "stable" },
];

/** data-table 展示：DataTable 是服务端分页语义（manualSorting/manualPagination），过滤/排序/切片都由外部算，这里用本地数组模拟一个「服务端」。 */
export function DataTableDemo() {
  const L = useLocalization();
  const state = useDataTableState();
  const filter = state.params.filter.trim().toLowerCase();

  const rows = useMemo(() => {
    const matched = BLOCKS.filter((r) => r.name.toLowerCase().includes(filter));
    const sort = state.params.sorting[0];
    if (sort?.id === "files") {
      matched.sort((a, b) => (sort.desc ? b.files - a.files : a.files - b.files));
    }
    return matched;
  }, [filter, state.params.sorting]);

  const start = state.params.pageIndex * state.params.pageSize;
  const page = rows.slice(start, start + state.params.pageSize);
  const pageCount = Math.max(Math.ceil(rows.length / state.params.pageSize), 1);

  const columns = useMemo<TableColumnDef<BlockRow>[]>(
    () => [
      { accessorKey: "name", header: () => L("Showcase:ColBlock"), enableSorting: false },
      { accessorKey: "files", header: () => L("Showcase:ColFiles") },
      {
        accessorKey: "status",
        header: () => L("Showcase:ColStatus"),
        enableSorting: false,
        cell: ({ getValue }) => {
          const stable = getValue() === "stable";
          return (
            <StatusBadge status={stable ? "success" : "info"}>
              {stable ? L("Showcase:StatusStable") : L("Showcase:StatusBeta")}
            </StatusBadge>
          );
        },
      },
    ],
    [L],
  );

  const dt = useDataTable({
    state,
    columns,
    data: page,
    pageCount,
    rowCount: rows.length,
    selectable: true,
    getRowId: (row) => row.name,
  });

  const bulk = (
    <div className="flex min-h-8 flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">{L("Table:NSelected", dt.selectedRows.length)}</span>
      <Separator orientation="vertical" className="!h-4" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => toast.success(L("Showcase:BulkExport", dt.selectedRows.length))}
      >
        {L("Showcase:BulkExport", dt.selectedRows.length)}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => state.clearSelection()}>
        {L("Table:Clear")}
      </Button>
    </div>
  );

  return (
    <DataTable table={dt}>
      <DataTableToolbar table={dt} searchPlaceholder={L("Showcase:SearchBlocks")} bulk={bulk} />
    </DataTable>
  );
}
