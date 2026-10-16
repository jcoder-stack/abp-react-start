import { useLocalization } from "@jcoder-stack/abp-react/react";
import { type CellContext, flexRender, type RowData } from "@tanstack/react-table";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import type {
  TableColumnDef,
  TableFeaturesWith,
  TableRowInstance,
} from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ExpandingFeatures } from "./expanding-features";

type ExpandingRow<TData extends RowData> = TableRowInstance<TData, ExpandingFeatures>;

/** 单行的展开/收起钮。不可展开的行渲染等宽占位，同层兄弟节点的内容才能左对齐。
 *
 *  click 与 keydown 都 stopPropagation：行上挂着 `onRowClick` 时，点按钮或在按钮上按
 *  Enter/Space 会冒泡成「打开详情」，跟行操作菜单是同一个处理。 */
export function RowExpandButton<TData extends RowData>(props: { row: ExpandingRow<TData> }) {
  const L = useLocalization();
  const { row } = props;
  if (!row.getCanExpand())
    return <span aria-hidden="true" className="inline-block size-7 shrink-0" />;
  const expanded = row.getIsExpanded();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 text-muted-foreground"
      aria-expanded={expanded}
      aria-label={L(expanded ? "Table:CollapseRow" : "Table:ExpandRow")}
      onClick={(e) => {
        e.stopPropagation();
        row.toggleExpanded();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ChevronRight className={cn("transition-transform", expanded && "rotate-90")} />
    </Button>
  );
}

/** 树表的首列内容：按 `row.depth` 缩进 + 展开钮 + 原内容。缩进走主题的 `--spacing` 刻度，
 *  深度是运行时数据，没法写成静态类。 */
export function TreeCell<TData extends RowData>(props: {
  row: ExpandingRow<TData>;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1"
      style={{ paddingInlineStart: `calc(var(--spacing) * ${props.row.depth * 6})` }}
    >
      <RowExpandButton row={props.row} />
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}

type ExpandingCellContext<TData extends RowData> = CellContext<
  TableFeaturesWith<ExpandingFeatures>,
  TData,
  unknown
>;

/** 把一列包成树表首列：保留原 `cell`（缺省显示单元格值），外面套 `TreeCell`。 */
export function treeColumn<TData extends RowData>(
  def: TableColumnDef<TData, ExpandingFeatures>,
): TableColumnDef<TData, ExpandingFeatures> {
  const inner = def.cell;
  return {
    ...def,
    cell: (ctx: ExpandingCellContext<TData>) => (
      <TreeCell row={ctx.row}>
        {inner === undefined ? (ctx.renderValue() as ReactNode) : flexRender(inner, ctx)}
      </TreeCell>
    ),
  } as TableColumnDef<TData, ExpandingFeatures>;
}

function ExpandColumnHeader() {
  const L = useLocalization();
  return <span className="sr-only">{L("Table:ExpandRow")}</span>;
}

/** 折叠详情用的窄列：每行一个展开钮，不参与排序与列显隐。放在列数组最前。 */
export function expandColumn<TData extends RowData>(): TableColumnDef<TData, ExpandingFeatures> {
  return {
    id: "expand",
    enableSorting: false,
    enableHiding: false,
    meta: { className: "w-10" },
    header: () => <ExpandColumnHeader />,
    cell: ({ row }) => <RowExpandButton row={row} />,
  };
}

/** 工具栏的「全部展开/全部收起」，放进 `DataTableToolbar` 的 children。没有可展开行时不渲染。 */
export function DataTableExpandAllButton<TData extends RowData>(props: {
  table: DataTableInstance<TData, ExpandingFeatures>;
}) {
  const L = useLocalization();
  const table = props.table.table;
  if (!table.getCanSomeRowsExpand()) return null;
  const allExpanded = table.getIsAllRowsExpanded();
  const label = L(allExpanded ? "Table:CollapseAll" : "Table:ExpandAll");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={label}
          onClick={() => table.toggleAllRowsExpanded(!allExpanded)}
        >
          {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
