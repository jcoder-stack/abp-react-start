import type { SortingState } from "@tanstack/react-table";
import type {
  DataTableListState,
  DataTableListStore,
} from "@/components/data-table/use-data-table-state";

/**
 * 列表位置在 URL 里的形状：`?page=3&size=20&sort=name,-creationTime&q=foo`。
 * 页码从 1 起（给人看的），排序是逗号分隔的列 id，前缀 `-` 表示降序。
 * 等于默认值的键不出现，默认状态就是一条干净的 URL。
 */
export interface ListSearch {
  page?: number;
  size?: number;
  sort?: string;
  q?: string;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * 路由的 `validateSearch`：从原始 search 里取出列表位置的四个键，认不出的值当作没给。
 * 页面还有别的 search 参数时，在自己的 `validateSearch` 里把它的结果展开进去。
 * URL 是用户能随手改的输入，这里不抛错——一个写坏的 `page=abc` 不该让整页进错误边界。
 */
export function parseListSearch(search: Record<string, unknown>): ListSearch {
  const result: ListSearch = {};
  const page = positiveInteger(search.page);
  const size = positiveInteger(search.size);
  if (page !== undefined) result.page = page;
  if (size !== undefined) result.size = size;
  if (typeof search.sort === "string" && search.sort !== "") result.sort = search.sort;
  // 纯数字的搜索词会被路由的 search 解析成 number，按字符串收回来。
  if (typeof search.q === "string" && search.q !== "") result.q = search.q;
  else if (typeof search.q === "number") result.q = String(search.q);
  return result;
}

function parseSort(sort: string): SortingState {
  return sort
    .split(",")
    .filter((part) => part !== "" && part !== "-")
    .map((part) =>
      part.startsWith("-") ? { id: part.slice(1), desc: true } : { id: part, desc: false },
    );
}

/** URL → 列表位置，喂给 `DataTableListStore.value`。缺的键留空，由状态机回落到默认值。 */
export function listStateFromSearch(search: ListSearch): Partial<DataTableListState> {
  const state: Partial<DataTableListState> = {};
  if (search.page !== undefined) state.pageIndex = search.page - 1;
  if (search.size !== undefined) state.pageSize = search.size;
  if (search.sort !== undefined) state.sorting = parseSort(search.sort);
  if (search.q !== undefined) state.filter = search.q;
  return state;
}

/**
 * 列表位置 → URL，在 `DataTableListStore.onChange` 里展开进 `navigate({ search })`。
 * 四个键总是都返回，等于默认值的给 `undefined`：路由据此把它从 URL 里删掉，而不是留着旧值。
 * `defaultPageSize` 要与传给表格的一致，否则默认每页条数会被当成非默认值写进 URL。
 */
export function listStateToSearch(
  state: DataTableListState,
  options: { defaultPageSize?: number } = {},
) {
  const defaultPageSize = options.defaultPageSize ?? 10;
  return {
    page: state.pageIndex > 0 ? state.pageIndex + 1 : undefined,
    size: state.pageSize !== defaultPageSize ? state.pageSize : undefined,
    sort:
      state.sorting.length > 0
        ? state.sorting.map((s) => (s.desc ? `-${s.id}` : s.id)).join(",")
        : undefined,
    q: state.filter !== "" ? state.filter : undefined,
  };
}

/**
 * 把路由的 search 接成 `DataTableListStore`。`setSearch` 收到的是要合并进 URL 的四个键，
 * 页面负责交给路由，这样本文件不依赖任何路由库：
 *
 * @example
 * ```tsx
 * export const Route = createFileRoute("/books/")({ validateSearch: parseListSearch, ... });
 *
 * const search = Route.useSearch();
 * const navigate = Route.useNavigate();
 * const t = useAbpTable(bookService, {
 *   columns,
 *   list: searchListStore(search, (patch) =>
 *     navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
 *   ),
 * });
 * ```
 *
 * 用 `replace` 而不是 push：翻页、排序不该各占一条历史记录，否则「返回」要按很多次才出得去。
 */
export function searchListStore(
  search: ListSearch,
  setSearch: (patch: ReturnType<typeof listStateToSearch>) => unknown,
  options: { defaultPageSize?: number } = {},
): DataTableListStore {
  return {
    value: listStateFromSearch(search),
    onChange: (next) => {
      void setSearch(listStateToSearch(next, options));
    },
  };
}
