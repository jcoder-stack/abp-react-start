import { useLocalization } from "@jcoder-stack/abp-react/react";
import {
  flexRender,
  type PaginationState,
  type Row,
  type RowData,
  Subscribe,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Fragment, type ReactNode, useId } from "react";
import { DataTableFooter } from "@/components/data-table/data-table-footer";
import {
  asBaseTable,
  type ExtraFeatureMap,
  type NoExtraFeatures,
  type TableFeatures,
  type TableInstance,
  type TableRowInstance,
} from "@/components/data-table/table-core";
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

/** 骨架条的宽度轮换：同一列上下等宽、相邻列不等宽，读起来像一张表而不是一摞横条。 */
const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3"] as const;

function alignClass(align?: "left" | "right" | "center") {
  // 右对齐即数字列（DESIGN.md「Tables」）：一并给等宽数字，否则 Inter 的比例数字宽窄不一，
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

/** 固定单元格的共同部分。底色必须不透明，否则滚过去的列会透上来；而行的悬停色和表头色都是
 *  半透明的，所以拆成两层：单元格自己铺 `bg-card`，状态色画在 `::before` 上叠在它之上、
 *  内容之下（sticky 自成层叠上下文，`-z-10` 出不去）。 */
const STICKY_CELL = "sticky z-10 bg-card before:absolute before:inset-0 before:-z-10";
/** 固定区右缘的分隔线。画在 `::after` 上：表格是 border-collapse，单元格自己的边框不跟着 sticky 走。 */
const STICKY_EDGE = "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border";
/** 主列紧贴勾选列之后。勾选列声明的是 `w-10`，但自动布局的表格会把它压到内容宽度，
 *  所以固定时用 `min-w-10` 钉死，否则两者之间会露出一条缝，滚过去的列从缝里透出来。 */
const STICKY_SELECT = "left-0 min-w-10";
const STICKY_AFTER_SELECT = "left-10";

interface DataTableRowProps<TData extends RowData>
  extends Pick<DataTableProps<TData>, "rowProps" | "onRowClick"> {
  row: Row<TableFeatures, TData>;
  selectionAtom: TableInstance<TData>["atoms"]["rowSelection"];
  stickyClassOf: (columnId: string) => string | undefined;
}

/** 表体的一行。整行包在自己那一行的选中订阅里：`data-state` 是 `<TableRow>` 上的属性，
 *  而宿主的 `useTable` selector 已把 rowSelection 摘出去、不再因勾选重渲染，只有把整行
 *  放进订阅，选中底色才跟得上。刻意不加 `React.memo`：订阅本就没有比较面，加了反而把
 *  `rowProps` / `onRowClick` 的「不需要引用稳定」契约拖下水。
 *
 *  这份订阅与选择列 cell 里那份（见 `use-data-table.ts` 的 `selectionColumn`）在当前组合下
 *  是重叠的——本组件把整行连同各 cell 一起包住，删掉任意一份，测试都还全绿。重叠是有意的，
 *  两份都不能删：本组件负责 `<tr>` 的 `data-state`，是列定义碰不到的；`selectionColumn`
 *  则要能独立成立，它的契约不该是「只有被 DataTableRow 包着才会刷新」——`UseDataTableOptions`
 *  的 `features` TSDoc 正教着下游改本文件的表体。 */
function DataTableRow<TData extends RowData>(props: DataTableRowProps<TData>) {
  const { row, selectionAtom, rowProps, onRowClick, stickyClassOf } = props;
  return (
    <Subscribe source={selectionAtom} selector={(s) => Boolean(s?.[row.id])}>
      {(selected) => (
        <TableRow
          data-state={selected ? "selected" : undefined}
          className={cn(
            "group hover:bg-muted/50 data-[state=selected]:bg-row-selected",
            onRowClick &&
              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            rowProps?.(row.original)?.className,
          )}
          tabIndex={onRowClick ? 0 : undefined}
          onClick={() => onRowClick?.(row.original)}
          onKeyDown={
            onRowClick &&
            ((e) => {
              if (e.key === "Enter" || e.key === " ") {
                // 两个都要 preventDefault。Space 默认滚动页面；Enter 会在本次按键继续合成
                // 一次 click，落到激活后新获得焦点的元素上（详情抽屉里的「编辑」按钮），
                // 键盘激活就越过详情态直接进了编辑态。
                // 行操作菜单已在自己的 onKeyDown 里 stopPropagation，不会误触发行激活。
                e.preventDefault();
                onRowClick(row.original);
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
                stickyClassOf(cell.column.id) &&
                  cn(
                    stickyClassOf(cell.column.id),
                    "group-hover:before:bg-muted/50 group-data-[state=selected]:before:bg-row-selected",
                  ),
              )}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      )}
    </Subscribe>
  );
}

export interface DataTableProps<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> {
  /** 由 `useDataTable` 构造的表实例；列/数据/分页/排序/选择全部经它接入。 */
  table: DataTableInstance<TData, TExtra>;
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
  /** 首次取数失败、没有任何数据可显示时的表体内容。给了它，表体整块换成这段内容（外层
   *  `<tr><td colSpan>` 由组件提供），表头留在原位，页脚不渲染——出错时总数和页数都不可信。
   *  已有数据在位的刷新失败不该走这里：那时旧数据仍有效，调用方应保留表体，另行提示。 */
  error?: ReactNode;
  /** 骨架行数；缺省 5。后台里不满一页的小表很常见，跟随每页条数会让它们从十行骨架塌成
   *  两三行数据。通常能填满一页的大表传 `"pageSize"`，跟随当前 `pagination.pageSize`。 */
  skeletonRows?: number | "pageSize";
  /** 行级属性，只开 `className`。事件走 `onRowClick`，万能透传会让调用方覆盖掉
   *  `key`/`data-state` 这些组件自管的东西。收 `row.original` 而不是 `Row`，要判断的是业务
   *  状态而非表格行状态。不需要引用稳定，它不进任何 memo 依赖，只在渲染时调用。
   *
   *  要覆盖悬停态或选中态得自带对应变体，例如
   *  `{ className: "bg-red-50 hover:bg-red-50 data-[state=selected]:bg-red-50" }`。
   *  只给 `bg-red-50` 的话，组件自带的 `hover:bg-muted/50` 和
   *  `data-[state=selected]:bg-row-selected` 修饰符不同，`cn` 不去重，
   *  悬停和选中时又特异性更高，会把你的颜色盖回去。 */
  rowProps?: (row: TData) => { className?: string };
  onRowClick?: (row: TData) => void;
  /** 行后追加一行通栏内容（折叠详情、行内子表），返回 `null`/`undefined`/`false` 即不追加。外层
   *  `<tr><td colSpan>` 由组件提供，colSpan 跟随可见列数。收 `Row` 而不是 `row.original`：
   *  要据以判断的是 `row.getIsExpanded()` 这类表格行状态，追加了 `rowExpandingFeature` 时
   *  它在类型上可见。与 `rowProps` 一样不需要引用稳定。
   *
   *  通栏行不吃 `onRowClick`、没有悬停底色，也不参与选中；`<td>` 无内边距，留白由内容自定。 */
  renderSubRow?: (row: TableRowInstance<TData, TExtra>) => ReactNode;
  /** 每页条数选项，缺省 `[10, 20, 50]`。当前 `pagination.pageSize` 总会被并入去重升序，
   *  所以传了 `useDataTable({ defaultPageSize })` 忘了同步这里，触发器也不会空白。
   *  传了 `footer` 则本项不生效。 */
  pageSizes?: number[];
  /** 接管整个页脚区：总条数文字、每页行数下拉、分页器三者全部。缺省渲染内建页脚。
   *  做「加载更多」或无限滚动的调用方本就不要页码和每页行数，拆开接管只会让他们分别关
   *  三个开关；要保留哪部分自己从 ctx 拼，分页动作走 `ctx.table.nextPage()` 这些。
   *  传了它之后 `pageSizes` 不生效，内建的每页行数下拉不再渲染。 */
  footer?: (ctx: {
    table: TableInstance<TData, TExtra>;
    pagination: PaginationState;
    pageCount: number;
    rowCount?: number;
  }) => ReactNode;
  /** 工具栏等散件，渲染在卡片内部、表格上方，顺序即摆放顺序。 */
  children?: ReactNode;
}

/** 服务端分页的通用表格。实例由 `useDataTable` 构造后传入，本组件只管表现层：
 *  骨架、空态、报错态、表头表体和内建页脚。行操作列由调用方当普通 column 传进来。 */
export function DataTable<TData extends RowData, TExtra extends ExtraFeatureMap = NoExtraFeatures>(
  props: DataTableProps<TData, TExtra>,
) {
  const L = useLocalization();
  const tableId = useId();
  const { table: dt } = props;
  const table = asBaseTable(dt.table);
  const skeletonCount =
    props.skeletonRows === "pageSize"
      ? dt.state.pagination.pageSize
      : (props.skeletonRows ?? DEFAULT_SKELETON_ROWS);
  const hasError = props.error != null && props.error !== false;

  const visibleColumns = table.getVisibleLeafColumns();
  const stickyColumnId = visibleColumns.find((column) => column.columnDef.meta?.sticky)?.id;
  const hasSelectColumn = visibleColumns.some((column) => column.id === "select");
  // 有固定主列时勾选列一起固定：它在主列左边，不固定就会从主列底下滑走，行也就没法勾了。
  const stickyClassOf = (columnId: string) => {
    if (stickyColumnId === undefined) return undefined;
    if (columnId === "select") return cn(STICKY_CELL, STICKY_SELECT);
    if (columnId === stickyColumnId) {
      return cn(STICKY_CELL, STICKY_EDGE, hasSelectColumn ? STICKY_AFTER_SELECT : "left-0");
    }
    return undefined;
  };

  const footerContent = props.footer ? (
    props.footer({
      table: dt.table,
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
        // 行高是声明出来的，不是内容撑出来的：此前两档都靠单元格内距，于是同一档里
        // "有行尾菜单的行"比"纯文本行"高 12px，密度实际由那个按钮决定。
        className={cn(dt.state.density === "compact" ? "[&_td]:h-8" : "[&_td]:h-10")}
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
                      // 是这套系统里唯一用正字距的地方（DESIGN.md「Typography」）。
                      "bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                      alignClass(header.column.columnDef.meta?.align),
                      header.column.columnDef.meta?.className,
                      stickyClassOf(header.column.id) &&
                        cn(stickyClassOf(header.column.id), "before:bg-muted/50"),
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
          {hasError ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="h-24 text-center"
              >
                {props.error}
              </TableCell>
            </TableRow>
          ) : props.loading ? (
            Array.from({ length: skeletonCount }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 骨架占位行数固定且从不重排
              <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                {table.getVisibleLeafColumns().map((column, columnIndex) => {
                  const meta = column.columnDef.meta;
                  return (
                    // 每列一格而不是整行一条：列宽在骨架期就由表头和 meta.className 定下，
                    // 数据到达时列不横向跳动。
                    <TableCell
                      key={column.id}
                      className={cn(
                        alignClass(meta?.align),
                        meta?.className,
                        stickyClassOf(column.id),
                      )}
                    >
                      <Skeleton
                        className={cn(
                          // 没有取值器的是展示列（勾选框、行操作），内容本就是个小图标位。
                          column.accessorFn
                            ? ["h-4", SKELETON_WIDTHS[columnIndex % SKELETON_WIDTHS.length]]
                            : "size-4",
                          meta?.align === "right" && "ml-auto",
                          meta?.align === "center" && "mx-auto",
                        )}
                      />
                    </TableCell>
                  );
                })}
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
            table.getRowModel().rows.map((row) => {
              // 行对象运行时就是带着追加特性的那一个，这里只是把类型放宽回调用方声明的特性集。
              const subRow = props.renderSubRow?.(
                row as unknown as TableRowInstance<TData, TExtra>,
              );
              return (
                <Fragment key={row.id}>
                  <DataTableRow
                    row={row}
                    selectionAtom={table.atoms.rowSelection}
                    rowProps={props.rowProps}
                    onRowClick={props.onRowClick}
                    stickyClassOf={stickyClassOf}
                  />
                  {subRow != null && subRow !== false && (
                    <TableRow data-slot="data-table-sub-row" className="hover:bg-transparent">
                      <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
                        {subRow}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
      {/* footer 返回 falsy（无限滚动这类不要页脚的接管）时连外壳一起不渲染，
          否则卡片底部会留一条 1px 上边框加一段空白。 */}
      {footerContent && !hasError ? (
        <div className="border-t px-4 py-2">{footerContent}</div>
      ) : null}
    </div>
  );
}
