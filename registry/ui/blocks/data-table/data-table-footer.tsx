import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { PaginationState, RowData } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { TableInstance } from "@/components/data-table/table-core";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

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

/** 内建页脚：总条数 + 分页器。每页条数是视图设置，在 `DataTableViewMenu` 里。
 *  与表体正交，单独成文件降低 fork 进入成本。 */
export function DataTableFooter<TData extends RowData>(props: {
  table: TableInstance<TData>;
  pagination: PaginationState;
  pageCount: number;
  rowCount?: number;
}): ReactNode {
  const L = useLocalization();
  const { table } = props;
  const canPrev = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();
  const pageItems = getPageItems(props.pagination.pageIndex, props.pageCount);

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
                      // 当前页用中性填充，不用主色实心：它说的是「你在第几页」，不是「点这里」。
                      // 主色在一屏里只该有一处，那一处留给唯一的主按钮。
                      item === props.pagination.pageIndex &&
                        "border-input bg-secondary font-medium text-foreground hover:bg-secondary",
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
