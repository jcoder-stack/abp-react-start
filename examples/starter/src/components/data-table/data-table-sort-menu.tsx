import { useLocalization } from "@jcoder/abp-react/react";
import type { Column, RowData } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { resolveColumnLabel } from "@/components/data-table/column-label";
import type { TableFeatures, TableInstance } from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DataTableSortMenuProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  /** 菜单末尾追加自定义项；`items` 输入是完整表实例，非单列。 */
  items?: (table: TableInstance<TData>) => ReactNode;
  /** 覆盖单列标签；缺省走 resolveColumnLabel 的三级阶梯。 */
  label?: (column: Column<TableFeatures, TData, unknown>) => ReactNode;
  className?: string;
}

/** 排序菜单：每次点选**叠加**到现有排序，不替换。已在排序中的列点了是翻方向，不在的追加到末尾。
 * 退出多列态走「清除排序」项。与表头点击的心智模型不同：表头默认替换、按住 shift 才叠加，
 * 菜单里没有 shift 手势可用，所以默认就是叠加。出现哪些列仍由列定义的 `enableSorting` 原生控制。 */
export function DataTableSortMenu<TData extends RowData>(props: DataTableSortMenuProps<TData>) {
  const L = useLocalization();
  const table = props.table.table;
  const columns = table.getAllLeafColumns().filter((c) => c.getCanSort());

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 text-muted-foreground", props.className)}
          aria-label={L("Table:Sort")}
          title={L("Table:Sort")}
        >
          <ArrowUpDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {columns.map((column) => (
          <DropdownMenuItem
            key={column.id}
            // 第二参 multi=true：菜单里点第二列不再把第一列压掉。没有它，菜单会
            // 破坏用户刚用 shift+click 建立的多列排序状态。
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc", true)}
          >
            {props.label?.(column) ?? resolveColumnLabel(table, column.id)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => table.setSorting([])}>
          {L("Table:SortClear")}
        </DropdownMenuItem>
        {props.items?.(table)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface DataTableClearSortButtonProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  className?: string;
}

/** 多列排序的退出口：仅在两列及以上排序时出现，点击一次清空全部排序。
 * 可见性判据留在组件内部，调用方无条件渲染即可。「何时需要退出口」是表现层知识，
 * 不该外泄给组装层。单列排序不给出口：表头三态循环（asc→desc→无）两次点击即可退出，
 * 为它多摆一颗常驻按钮是噪声。 */
export function DataTableClearSortButton<TData extends RowData>(
  props: DataTableClearSortButtonProps<TData>,
) {
  const L = useLocalization();
  const table = props.table.table;
  if (table.state.sorting.length <= 1) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground", props.className)}
      onClick={() => table.setSorting([])}
    >
      {L("Table:SortClear")}
    </Button>
  );
}
