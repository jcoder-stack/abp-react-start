import { useLocalization } from "@jcoder/abp-react/react";
import { flexRender, type PaginationState, type RowData } from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { DataTableFooter } from "@/components/data-table/data-table-footer";
import type { TableInstance } from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const DEFAULT_SKELETON_ROWS = 5;

function alignClass(align?: "left" | "right" | "center") {
  // 右对齐即数字列（DESIGN.md）：一并给等宽数字，否则 Inter 的比例数字宽窄不一，
  // 同列上下对不齐、跨组件（分页/页码）看着像换了字体。
  if (align === "right") return "text-right tabular-nums";
  if (align === "center") return "text-center";
  return "";
}

function justifyClass(align?: "left" | "right" | "center") {
  if (align === "right") return "justify-end";
  if (align === "center") return "justify-center";
  return "justify-start";
}

export interface DataTableProps<TData extends RowData> {
  /** 由 `useDataTable` 构造的表实例；列/数据/分页/排序/选择全部经它接入。 */
  table: DataTableInstance<TData>;
  /** 无数据可显示、正在首次取数 → 渲染骨架行。 */
  loading?: boolean;
  /** 已有数据在位、正在取新数据 → 表体降透明度。与 `loading` 互斥，react-query 下传
   *  `isFetching && !isPending`。表头不降透明度，排序仍可点，它也是用户定位刚点了什么的锚点。 */
  fetching?: boolean;
  /** 空状态。缺省是 `L("Table:Empty")` 的居中单行。传了只替换 `<td>` 内的内容，外层
   *  `<tr><td colSpan>` 仍由组件提供，不用自己算 colSpan。注意那个 `<td>` 带着
   *  `h-24 text-center text-muted-foreground`，插图 + 标题 + 按钮这类空状态会被强制居中、
   *  标题被染成 muted 色，要退出得自己在内容上加覆盖类。 */
  empty?: ReactNode;
  /** 骨架行数；缺省 5。传 `"pageSize"` 跟随当前 `pagination.pageSize`，
   *  避免 `pageSize=50` 时 5 行骨架突变成 50 行数据的跳变。 */
  skeletonRows?: number | "pageSize";
  /** 行级属性，只开 `className`。事件走 `onRowClick`，万能透传会让调用方覆盖掉
   *  `key`/`data-state` 这些组件自管的东西。收 `row.original` 而不是 `Row`，要判断的是业务
   *  状态而非表格行状态。不需要引用稳定，它不进任何 memo 依赖，只在渲染时调用。
   *
   *  要覆盖悬停态或选中态得自带对应变体，例如
   *  `{ className: "bg-red-50 hover:bg-red-50 data-[state=selected]:bg-red-50" }`。
   *  只给 `bg-red-50` 的话，组件自带的 `hover:bg-muted/50` 和
   *  `data-[state=selected]:bg-row-selected` 修饰符不同，tailwind-merge 不去重，
   *  悬停和选中时又特异性更高，会把你的颜色盖回去。 */
  rowProps?: (row: TData) => { className?: string };
  onRowClick?: (row: TData) => void;
  /** 每页条数选项，缺省 `[10, 20, 50]`。当前 `pagination.pageSize` 总会被并入去重升序，
   *  所以传了 `useDataTable({ defaultPageSize })` 忘了同步这里，触发器也不会空白。
   *  传了 `footer` 则本项不生效。 */
  pageSizes?: number[];
  /** 接管整个页脚区：总条数文字、每页行数下拉、分页器三者全部。缺省渲染内建页脚。
   *  做「加载更多」或无限滚动的调用方本就不要页码和每页行数，拆开接管只会让他们分别关
   *  三个开关；要保留哪部分自己从 ctx 拼，分页动作走 `ctx.table.nextPage()` 这些。
   *  传了它之后 `pageSizes` 不生效，内建的每页行数下拉不再渲染。 */
  footer?: (ctx: {
    table: TableInstance<TData>;
    pagination: PaginationState;
    pageCount: number;
    rowCount?: number;
  }) => ReactNode;
  /** 工具栏等散件，渲染在卡片内部、表格上方，顺序即摆放顺序。 */
  children?: ReactNode;
}

/** 服务端分页的通用表格。实例由 `useDataTable` 构造后传入，本组件只管表现层：
 *  骨架、空态、表头表体和内建页脚。行操作列由调用方当普通 column 传进来。 */
export function DataTable<TData extends RowData>(props: DataTableProps<TData>) {
  const L = useLocalization();
  const tableId = useId();
  const { table: dt } = props;
  const table = dt.table;
  const skeletonCount =
    props.skeletonRows === "pageSize"
      ? dt.state.pagination.pageSize
      : (props.skeletonRows ?? DEFAULT_SKELETON_ROWS);

  const footerContent = props.footer ? (
    props.footer({
      table,
      pagination: dt.state.pagination,
      pageCount: dt.pageCount,
      rowCount: dt.rowCount,
    })
  ) : (
    <DataTableFooter
      table={table}
      pagination={dt.state.pagination}
      pageCount={dt.pageCount}
      rowCount={dt.rowCount}
      pageSizes={props.pageSizes}
    />
  );

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      {props.children}
      <Table
        className={cn(dt.state.density === "compact" && "[&_td]:py-1")}
        aria-busy={props.loading || props.fetching ? true : undefined}
      >
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const showSortIndex =
                  table.state.sorting.length > 1 && Boolean(header.column.getIsSorted());
                const sortPriorityId = `${tableId}-sortpri-${header.id}`;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : header.column.getCanSort()
                            ? "none"
                            : undefined
                    }
                    className={cn(
                      // label-caps：正字距的大写小字把表头标记为"分类"而非内容，
                      // 是这套系统里唯一用正字距的地方（DESIGN.md Typography）。
                      "bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                      alignClass(header.column.columnDef.meta?.align),
                      header.column.columnDef.meta?.className,
                    )}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-describedby={showSortIndex ? sortPriorityId : undefined}
                        className={cn(
                          "inline-flex w-full items-center gap-1.5 select-none hover:text-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          justifyClass(header.column.columnDef.meta?.align),
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <ChevronUp className="size-3 text-primary" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ChevronDown className="size-3 text-primary" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-50" />
                        )}
                        {showSortIndex && (
                          // 优先级本就不可用 ARIA 表达（aria-sort 只有方向），裸数字留在可访问名里
                          // 会污染读屏播报与语音控制的匹配目标（按钮会变成「Name1」而非「Name」）。
                          <span
                            aria-hidden="true"
                            className="text-2xs font-normal tabular-nums text-muted-foreground"
                          >
                            {header.column.getSortIndex() + 1}
                          </span>
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                    {showSortIndex && (
                      // 描述得放 button 外面，进 button 会并入可访问名、污染语音控制的匹配目标，
                      // 而 aria-describedby 只影响描述不影响名称。但 th 自己也是 "name from
                      // content" 的角色，不加 aria-hidden 这段文字照样会并进表头的可访问名。
                      // aria-hidden 把它逐出常规内容遍历，aria-describedby 的直接引用不受影响，
                      // 读屏仍读得到。
                      <span id={sortPriorityId} aria-hidden="true" className="sr-only">
                        {L("Table:SortPriority", header.column.getSortIndex() + 1)}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody
          className={cn(
            // delay-100 吃掉快请求的闪烁，100ms 内返回的几乎看不出变化，且不用 JS 定时器。
            // 没加 pointer-events-none：它只挡鼠标不挡键盘，两类用户会拿到不同能力；
            // keepPreviousData 期间在位的又正是上一次的有效数据，点它并不危险（行操作打的是
            // id，行真没了服务端会 404）。「正在刷新」靠降透明度 + aria-busy 表达，不禁用交互。
            props.fetching && "opacity-60 transition-opacity duration-150 delay-100",
          )}
        >
          {props.loading ? (
            Array.from({ length: skeletonCount }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 骨架占位行数固定且从不重排
              <TableRow key={`skeleton-${i}`}>
                <TableCell colSpan={table.getVisibleLeafColumns().length}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="h-24 text-center text-muted-foreground"
              >
                {props.empty ?? L("Table:Empty")}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={cn(
                  "group hover:bg-muted/50 data-[state=selected]:bg-row-selected",
                  props.onRowClick &&
                    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  props.rowProps?.(row.original)?.className,
                )}
                tabIndex={props.onRowClick ? 0 : undefined}
                onClick={() => props.onRowClick?.(row.original)}
                onKeyDown={
                  props.onRowClick &&
                  ((e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      // 两个都要 preventDefault。Space 默认滚动页面；Enter 会在本次按键继续合成
                      // 一次 click，落到激活后新获得焦点的元素上（详情抽屉里的「编辑」按钮），
                      // 键盘激活就越过详情态直接进了编辑态。
                      // 行操作菜单已在自己的 onKeyDown 里 stopPropagation，不会误触发行激活。
                      e.preventDefault();
                      props.onRowClick?.(row.original);
                    }
                  })
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      alignClass(cell.column.columnDef.meta?.align),
                      cell.column.columnDef.meta?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {/* footer 返回 falsy（无限滚动这类不要页脚的接管）时连外壳一起不渲染，
          否则卡片底部会留一条 1px 上边框加一段空白。 */}
      {footerContent ? <div className="border-t px-3 py-2">{footerContent}</div> : null}
    </div>
  );
}
