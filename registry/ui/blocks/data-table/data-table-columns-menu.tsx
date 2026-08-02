import { useLocalization } from "@jcoder/abp-react/react";
import type { Column, RowData } from "@tanstack/react-table";
import { TableProperties } from "lucide-react";
import type { ReactNode } from "react";
import { resolveColumnLabel } from "@/components/data-table/column-label";
import type { TableFeatures, TableInstance } from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DataTableColumnsMenuProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  /** 菜单末尾追加自定义项；`items` 输入是完整表实例，非单列。 */
  items?: (table: TableInstance<TData>) => ReactNode;
  /** 覆盖单列标签；缺省走 resolveColumnLabel 的三级阶梯。 */
  label?: (column: Column<TableFeatures, TData, unknown>) => ReactNode;
  className?: string;
}

/** 列显隐菜单；出现哪些列由列定义的 `enableHiding` 原生控制，本组件不做二次过滤。 */
export function DataTableColumnsMenu<TData extends RowData>(
  props: DataTableColumnsMenuProps<TData>,
) {
  const L = useLocalization();
  const table = props.table.table;
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 text-muted-foreground", props.className)}
          aria-label={L("Table:Columns")}
          title={L("Table:Columns")}
        >
          <TableProperties />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(value === true)}
          >
            {props.label?.(column) ?? resolveColumnLabel(table, column.id)}
          </DropdownMenuCheckboxItem>
        ))}
        {props.items?.(table)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
