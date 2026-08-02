import type { PagedResult } from "@jcoder/abp-react/core";

/**
 * `useAbpTable` 的数据源契约。不绑定 `CrudService`，非 ABP 后端或测试替身满足这个形状就能接。
 *
 * `delete` 可选：只读 service 上这个键不存在，而不是值为 undefined。所以
 * `source.delete?.mutate(id)` 是安全的，不会得到一个点了没反应的删除按钮。
 *
 * `can` 要求 hook 存在且 ABP 策略通过，缺一就隐藏入口。
 */
export interface AbpTableSource<TDto> {
  listQuery: {
    data?: PagedResult<TDto>;
    isPending: boolean;
    isFetching: boolean;
    isError: boolean;
    /** 同参数重试出口。瞬时错误（网络抖动、500）下缓存键没变，点「查询」不会重发，只有它能恢复。
     *  react-query 数据源天然有；自实现的可以不给，不给就不渲染重试按钮。 */
    refetch?: () => void;
  };
  pageCount: number;
  totalCount: number;
  delete?: {
    mutate: (id: string) => void;
    /** 整批删除：逐条删、汇总失败 id、结束后失效一次列表。别逐条 toast 或逐条失效，
     *  删 N 条会变成 N 个提示和 N 次重取；提示由 `t.BulkDelete` 按整批结果给一条。
     *  不提供则 `t.BulkDelete` 不渲染，DEV 下告警。 */
    many?: (ids: string[]) => Promise<{ failed: string[] }>;
  };
  can: { create: boolean; update: boolean; delete: boolean };
  supportsFilter: boolean;
}
