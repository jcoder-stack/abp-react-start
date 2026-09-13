import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { PaginationState, RowData } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import type { TableInstance } from "@/components/data-table/table-core";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZES = [10, 20, 50];
const PAGE_WINDOW_THRESHOLD = 7;

/**
 * 0-based 页码窗口：总页 ≤7 全显；否则**恒定 7 个槽位**，首页与末页占两端，中间五槽随当前页滑动。
 *
 * 槽位数必须恒定：数量随当前页变化时，翻一页整排页码就会左右平移，按钮跑到光标底下换了张脸，
 * 连点下一页看起来像在闪烁。宁可多显示一个省略号，也不让已经画出来的页码挪位置。
 */
export function getPageItems(pageIndex: number, pageCount: number): (number | "ellipsis")[] {
  const totalPages = Math.max(pageCount, 1);
  if (totalPages <= PAGE_WINDOW_THRESHOLD) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const last = totalPages - 1;
  const current = Math.min(Math.max(pageIndex, 0), last);

  if (current <= 3) return [0, 1, 2, 3, 4, "ellipsis", last];
  if (current >= last - 3) return [0, "ellipsis", last - 4, last - 3, last - 2, last - 1, last];
  return [0, "ellipsis", current - 1, current, current + 1, "ellipsis", last];
}

/** 内建页脚：总条数 + 每页行数下拉 + 分页器。与表体正交，单独成文件降低 fork 进入成本。 */
export function DataTableFooter<TData extends RowData>(props: {
  table: TableInstance<TData>;
  pagination: PaginationState;
  pageCount: number;
  rowCount?: number;
  pageSizes?: number[];
}): ReactNode {
  const L = useLocalization();
  const { table } = props;
  const canPrev = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();
  const pageItems = getPageItems(props.pagination.pageIndex, props.pageCount);

  const sizeOptions = useMemo(() => {
    const merged = new Set([...(props.pageSizes ?? DEFAULT_PAGE_SIZES), props.pagination.pageSize]);
    return [...merged].sort((a, b) => a - b);
  }, [props.pageSizes, props.pagination.pageSize]);

  const prevItem = (
    <PaginationItem>
      <PaginationLink
        size="icon"
        className={cn("size-8", !canPrev && "pointer-events-none opacity-50")}
        aria-label={L("Table:Previous")}
        aria-disabled={!canPrev}
        href={canPrev ? "#" : undefined}
        onClick={(e) => {
          e.preventDefault();
          if (canPrev) table.previousPage();
        }}
      >
        <ChevronLeft />
      </PaginationLink>
    </PaginationItem>
  );

  const nextItem = (
    <PaginationItem>
      <PaginationLink
        size="icon"
        className={cn("size-8", !canNext && "pointer-events-none opacity-50")}
        aria-label={L("Table:Next")}
        aria-disabled={!canNext}
        href={canNext ? "#" : undefined}
        onClick={(e) => {
          e.preventDefault();
          if (canNext) table.nextPage();
        }}
      >
        <ChevronRight />
      </PaginationLink>
    </PaginationItem>
  );

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
        {props.rowCount !== undefined && props.rowCount > 0 && (
          <span>{L("Table:Total", props.rowCount)}</span>
        )}
        <span>{L("Table:RowsPerPage")}</span>
        <Select
          value={String(props.pagination.pageSize)}
          onValueChange={(v: string) => table.setPagination({ pageIndex: 0, pageSize: Number(v) })}
        >
          <SelectTrigger size="sm" className="tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="tabular-nums">
            {sizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm tabular-nums text-muted-foreground md:hidden">
          {L("Table:PageOf", props.pagination.pageIndex + 1, Math.max(props.pageCount, 1))}
        </span>
        <Pagination className="mx-0 w-auto md:hidden">
          <PaginationContent>
            {prevItem}
            {nextItem}
          </PaginationContent>
        </Pagination>
        <Pagination className="mx-0 hidden w-auto md:flex">
          <PaginationContent>
            {prevItem}
            {pageItems.map((item, i) =>
              item === "ellipsis" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: 省略号在窗口内位置固定，不参与重排
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    size="icon"
                    className={cn(
                      "size-8 tabular-nums",
                      item === props.pagination.pageIndex &&
                        "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground dark:border-primary dark:bg-primary dark:hover:bg-primary-hover",
                    )}
                    isActive={item === props.pagination.pageIndex}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      table.setPageIndex(item);
                    }}
                  >
                    {item + 1}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            {nextItem}
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
