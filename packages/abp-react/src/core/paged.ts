/** A list page normalized for consumption: a concrete array plus the server-side total. */
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
}

/** Normalize an ABP paged DTO into a `PagedResult<T>` with a concrete array and count, so list
 *  views can share one generic shape. orval generates items/totalCount as optional or nullable. */
export function toPagedResult<T>(
  dto: { items?: T[] | null; totalCount?: number } | null | undefined,
): PagedResult<T> {
  return { items: dto?.items ?? [], totalCount: dto?.totalCount ?? 0 };
}

/** Generic list state (pagination, sorting, filtering). */
export interface ListState {
  pageIndex: number;
  pageSize: number;
  sorting?: { id: string; desc: boolean }[];
  filter?: string;
}

/** ABP list protocol parameters for request payloads. */
export interface AbpListParams {
  SkipCount: number;
  MaxResultCount: number;
  Sorting?: string;
  Filter?: string;
}

/** Convert generic list state to ABP list protocol parameters. Request-side counterpart to
 *  `toPagedResult`. Out-of-range paging is clamped (SkipCount >= 0, MaxResultCount >= 1):
 *  ABP answers a negative skip or a non-positive page size with a 400. */
export function toAbpListParams(state: ListState): AbpListParams {
  const pageSize = Math.max(1, state.pageSize);
  const params: AbpListParams = {
    SkipCount: Math.max(0, state.pageIndex) * pageSize,
    MaxResultCount: pageSize,
  };
  if (state.sorting !== undefined && state.sorting.length > 0) {
    params.Sorting = state.sorting.map((s) => (s.desc ? `${s.id} desc` : s.id)).join(",");
  }
  const filter = state.filter?.trim();
  if (filter) params.Filter = filter;
  return params;
}
