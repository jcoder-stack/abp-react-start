import { toAbpListParams } from "@jcoder/abp-react/core";
import { useLocalization } from "@jcoder/abp-react/react";
import { keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { useGetApiAppBook } from "@/routes/_layout/_authed/books/-book-api";
import type { AbpSwaggerBooksBookDto } from "@/routes/_layout/_authed/books/-book-models";

/** L2 参考实现：ABP 装配层之下的通用表，裸 orval hook + `useDataTableState`/`useDataTable`
 * 状态机 + 受控 `DataTable`，分页/排序/加载态全部显式接线。非 ABP 数据源的表照此写。 */
export function BooksL2Demo() {
  const L = useLocalization();
  const state = useDataTableState();

  const listQuery = useGetApiAppBook(toAbpListParams(state.params), {
    query: { placeholderData: keepPreviousData },
  });
  const items = listQuery.data?.items ?? [];
  const totalCount = listQuery.data?.totalCount ?? 0;

  const columns = useMemo<TableColumnDef<AbpSwaggerBooksBookDto>[]>(
    () => [
      { accessorKey: "name", header: () => L("App::BookName") },
      { accessorKey: "authorName", header: () => L("App::BookAuthor"), enableSorting: false },
      {
        accessorKey: "price",
        header: () => L("App::BookPrice"),
        meta: { align: "right" },
        cell: ({ getValue }) => {
          const value = getValue() as number | undefined;
          return typeof value === "number" ? value.toFixed(2) : "";
        },
      },
    ],
    [L],
  );

  const dt = useDataTable({
    state,
    columns,
    data: items,
    pageCount: Math.max(Math.ceil(totalCount / state.pagination.pageSize), 1),
    rowCount: totalCount,
  });

  return (
    <DataTable
      table={dt}
      loading={listQuery.isPending}
      fetching={listQuery.isFetching && !listQuery.isPending}
    />
  );
}
