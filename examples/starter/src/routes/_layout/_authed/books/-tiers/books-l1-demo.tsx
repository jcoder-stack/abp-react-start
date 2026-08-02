import { toPagedResult } from "@jcoder-stack/abp-react/core";
import { useLocalization } from "@jcoder-stack/abp-react/react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import {
  getGetApiAppBookQueryKey,
  useDeleteApiAppBookId,
  useGetApiAppBook,
} from "@/routes/_layout/_authed/books/-book-api";
import type { AbpSwaggerBooksBookDto } from "@/routes/_layout/_authed/books/-book-models";

/** L1 参考实现：向 `useAbpTable` 传入 source 回调而非 service 描述符，刻意不经
 * `createCrudService`。数据源不走标准 service 描述符（非 ABP 后端、测试替身、带缓存包装层）
 * 时的接线范本。指南「选层指南」L1 行引用的就是本文件。 */
export function BooksL1Demo() {
  const L = useLocalization();
  const queryClient = useQueryClient();
  const deleteBook = useDeleteApiAppBookId({
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetApiAppBookQueryKey() }),
    },
  });

  const columns = useMemo<TableColumnDef<AbpSwaggerBooksBookDto>[]>(
    () => [
      { accessorKey: "name", header: () => L("App::BookName") },
      { accessorKey: "authorName", header: () => L("App::BookAuthor"), enableSorting: false },
      {
        accessorKey: "publishDate",
        header: () => L("App::BookPublishDate"),
        cell: ({ getValue }) => ((getValue() as string | undefined) ?? "").slice(0, 10),
      },
    ],
    [L],
  );

  const t = useAbpTable<AbpSwaggerBooksBookDto>(
    (params) => {
      // source 回调本身跨渲染只有这一种 lifetime 稳定的形态（不会中途切换成别的数据源），
      // 这里调用 hook 不是真正意义上"有时调用、有时不调用"的条件 hook，同 use-abp-table.ts
      // 的 useServiceSource 分支先例。
      // biome-ignore lint/correctness/useHookAtTopLevel: 见上，分支 lifetime 稳定
      const listQuery = useGetApiAppBook(params, {
        query: { placeholderData: keepPreviousData, select: toPagedResult },
      });
      const totalCount = listQuery.data?.totalCount ?? 0;
      return {
        listQuery: {
          data: listQuery.data,
          isPending: listQuery.isPending,
          isFetching: listQuery.isFetching,
          isError: listQuery.isError,
          refetch: () => void listQuery.refetch(),
        },
        pageCount: Math.max(Math.ceil(totalCount / params.MaxResultCount), 1),
        totalCount,
        delete: { mutate: (id: string) => deleteBook.mutate({ id }) },
        can: { create: false, update: false, delete: true },
        // book 列表端点没有 ABP Filter 参数，搜索框不该出现
        supportsFilter: false,
      };
    },
    { columns },
  );

  return <t.Table />;
}
