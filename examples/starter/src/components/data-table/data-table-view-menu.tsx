import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { Column, RowData } from "@tanstack/react-table";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { resolveColumnLabel } from "@/components/data-table/column-label";
import { DataTableUtilityButton } from "@/components/data-table/data-table-utility-button";
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
            className="h-7 flex-1 rounded-none max-md:h-11 text-muted-foreground tabular-nums aria-pressed:bg-secondary aria-pressed:font-medium aria-pressed:text-foreground"
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** 视图是否偏离了默认：密度、每页条数、列显隐任一样被改过。 */
export function isViewCustomized<TData extends RowData, TExtra extends ExtraFeatureMap>(
  dt: DataTableInstance<TData, TExtra>,
): boolean {
  const table = asBaseTable(dt.table);
  const initialVisibility = table.initialState.columnVisibility;
  return (
    dt.state.density !== "comfortable" ||
    dt.state.params.pageSize !== dt.state.defaultPageSize ||
    table
      .getAllLeafColumns()
      .some((c) => c.getCanHide() && c.getIsVisible() !== (initialVisibility?.[c.id] ?? true))
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

  const customized = isViewCustomized(props.table);

  return (
    <Popover>
      <DataTableUtilityButton
        label={L("Table:ViewSettings")}
        dot={customized}
        trigger={PopoverTrigger}
        className={props.className}
      >
        <SlidersHorizontal />
      </DataTableUtilityButton>
      <PopoverContent
        align="end" // 窄屏上各行放大到 44px，列一多面板就比视口高；限在可用高度内滚动，底部的恢复默认才够得着。
        className="grid max-h-(--radix-popover-content-available-height) w-60 gap-3 overflow-y-auto p-3 text-sm"
      >
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
              <Label key={column.id} className="h-7 font-normal max-md:h-11">
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
