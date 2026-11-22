import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { Column, RowData } from "@tanstack/react-table";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { resolveColumnLabel } from "@/components/data-table/column-label";
import {
  asBaseTable,
  type ExtraFeatureMap,
  type NoExtraFeatures,
  type TableFeatures,
} from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import type { TableDensity } from "@/components/data-table/use-data-table-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZES = [10, 20, 50];
const DENSITIES: { value: TableDensity; label: string }[] = [
  { value: "comfortable", label: "Table:DensityComfortable" },
  { value: "compact", label: "Table:DensityCompact" },
];

export interface DataTableViewMenuProps<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> {
  table: DataTableInstance<TData, TExtra>;
  /** 每页条数选项，缺省 `[10, 20, 50]`。当前值与默认值总会被并入去重升序，所以传了
   *  `defaultPageSize` 忘了同步这里，也不会出现「哪一档都没选中」。 */
  pageSizes?: number[];
  /** 覆盖单列标签；缺省走 resolveColumnLabel 的三级阶梯。 */
  label?: (column: Column<TableFeatures, TData, unknown>) => ReactNode;
  className?: string;
}

function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-muted-foreground text-xs">{props.label}</legend>
      <div className="flex divide-x overflow-hidden rounded-md border">
        {props.options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={option.value === props.value}
            className="h-7 flex-1 rounded-none text-muted-foreground tabular-nums aria-pressed:bg-secondary aria-pressed:font-medium aria-pressed:text-foreground"
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** 视图设置：密度、每页条数、显示哪些列，三样「改表格外观、不改数据」的设置合在一个入口。
 *  偏离默认时触发钮带圆点，面板底部给「恢复默认视图」——偏好会被记住，得有一步回得去。
 *  出现哪些列由列定义的 `enableHiding` 原生控制，本组件不做二次过滤。 */
export function DataTableViewMenu<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
>(props: DataTableViewMenuProps<TData, TExtra>) {
  const L = useLocalization();
  const { state } = props.table;
  const table = asBaseTable(props.table.table);
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());

  const pageSize = state.params.pageSize;
  const sizeOptions = [
    ...new Set([...(props.pageSizes ?? DEFAULT_PAGE_SIZES), state.defaultPageSize, pageSize]),
  ].sort((a, b) => a - b);

  const initialVisibility = table.initialState.columnVisibility;
  const customized =
    state.density !== "comfortable" ||
    pageSize !== state.defaultPageSize ||
    columns.some((c) => c.getIsVisible() !== (initialVisibility?.[c.id] ?? true));

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("relative size-8 text-muted-foreground", props.className)}
              aria-label={L("Table:ViewSettings")}
            >
              <SlidersHorizontal />
              {customized && (
                <span
                  data-slot="view-customized"
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
                />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{L("Table:ViewSettings")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="grid w-60 gap-3 p-3 text-sm">
        <Segmented
          label={L("Table:Density")}
          value={state.density}
          options={DENSITIES.map((d) => ({ value: d.value, label: L(d.label) }))}
          onChange={state.setDensity}
        />
        <Segmented
          label={L("Table:RowsPerPage")}
          value={pageSize}
          options={sizeOptions.map((size) => ({ value: size, label: size }))}
          onChange={(size) => table.setPagination({ pageIndex: 0, pageSize: size })}
        />
        {columns.length > 0 && (
          <fieldset className="grid">
            <legend className="mb-1.5 text-muted-foreground text-xs">
              {L("Table:ViewColumns")}
            </legend>
            {columns.map((column) => (
              <Label key={column.id} className="h-7 font-normal">
                <Checkbox
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(value === true)}
                />
                {props.label?.(column) ?? resolveColumnLabel(table, column.id)}
              </Label>
            ))}
          </fieldset>
        )}
        {customized && (
          <div className="border-t pt-2">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                table.resetColumnVisibility();
                state.resetViewDefaults();
              }}
            >
              {L("Table:ViewReset")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
