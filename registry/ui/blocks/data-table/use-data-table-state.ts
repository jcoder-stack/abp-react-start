import {
  functionalUpdate,
  type PaginationState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

export type TableDensity = "comfortable" | "compact";

/** 列表的「位置」：翻到哪一页、每页几条、怎么排、搜的什么。这四样决定了请求参数，
 *  也正是从详情页返回、刷新、分享链接时该原样恢复的东西。 */
export interface DataTableListState {
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  filter: string;
}

/**
 * 把列表位置交给外部持有（典型是 URL search params）。给了它，状态机不再自己存这四样：
 * 读 `value`，变更时把完整的下一状态交给 `onChange`，由持有方写回并触发重渲染。
 *
 * `value` 缺的键回落到默认值（第 1 页、默认每页条数、无排序、空搜索），所以一条干净的 URL
 * 就是默认状态。两个成员都不需要引用稳定。
 */
export interface DataTableListStore {
  value: Partial<DataTableListState>;
  onChange: (next: DataTableListState) => void;
}

/** 跟着人走、不跟着链接走的视图偏好。 */
export interface DataTablePreferences {
  density?: TableDensity;
  pageSize?: number;
  /** 列 id → 是否可见；只记用户动过的列。 */
  columnVisibility?: Record<string, boolean>;
}

/**
 * 视图偏好的存取适配器，形状即 `useSyncExternalStore` 的契约：`get` 在两次变更之间必须返回
 * 同一个引用，`set` 之后通知订阅者。内建实现见 `localStoragePreferences`；要存到别处
 * （如 ABP 的用户设置）照这个形状自己实现。实例引用必须稳定。
 */
export interface DataTablePreferenceStore {
  subscribe: (onChange: () => void) => () => void;
  get: () => DataTablePreferences;
  set: (next: DataTablePreferences) => void;
}

export interface UseDataTableStateOptions {
  defaultPageSize?: number;
  /** 搜索框的初始值（深链预填），只在挂载时播种一次。给了 `list` 时不生效，搜索值以它为准。 */
  initialFilter?: string;
  list?: DataTableListStore;
  preferences?: DataTablePreferenceStore;
}

const NO_PREFERENCES: DataTablePreferences = {};
const NO_SORTING: SortingState = [];
const subscribeToNothing = () => () => {};
const getNoPreferences = () => NO_PREFERENCES;

function sameSorting(a: SortingState, b: SortingState): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i]?.id && s.desc === b[i]?.desc);
}

function sameListState(a: DataTableListState, b: DataTableListState): boolean {
  return (
    a.pageIndex === b.pageIndex &&
    a.pageSize === b.pageSize &&
    a.filter === b.filter &&
    sameSorting(a.sorting, b.sorting)
  );
}

/**
 * 服务端分页表格的状态机：分页/排序/已提交搜索值；filter 为已提交的搜索值，
 * 输入框即时值与防抖由工具条自己持有（见 DataTableToolbar），状态机只接收提交结果。
 * 行选择不在这里——所有权在表实例上（`table.atoms.rowSelection`），经 `useDataTable` 暴露。
 * 结构化查询参数不归这里管，那是 useAbpTable 的表单实例自己持有的东西。
 *
 * 缺省全部存在组件内，卸载即丢。`list` 把列表位置交给外部持有，`preferences` 把密度、
 * 每页条数和列显隐存下来；两者独立，按页选用。
 */
export function useDataTableState(opts: UseDataTableStateOptions = {}) {
  const defaultPageSize = opts.defaultPageSize ?? 10;
  const preferenceStore = opts.preferences;
  // 服务端快照恒为空：SSR 读不到本机偏好。水合时 React 先按空偏好对上服务端 HTML，再在
  // 副作用之前同步重渲染一次换成真实偏好，取数（在副作用里发起）因此只会按最终的每页条数发一次。
  const preferences = useSyncExternalStore(
    preferenceStore?.subscribe ?? subscribeToNothing,
    preferenceStore?.get ?? getNoPreferences,
    getNoPreferences,
  );

  const [local, setLocal] = useState<DataTableListState>(() => ({
    pageIndex: 0,
    pageSize: defaultPageSize,
    sorting: NO_SORTING,
    filter: opts.initialFilter ?? "",
  }));
  const [localDensity, setLocalDensity] = useState<TableDensity>("comfortable");

  // 「当前这一页的语境」的版本号。resetPaging 每次都递增，哪怕 pageIndex 写回同值：
  // 用户本来就在第 1 页时分页/排序/搜索三者可以一起纹丝不动（查询面板提交只改结构化参数），
  // 光比这三样看不出语境换过，页内选择就会跨语境残留。选中态归表所有，清空动作在
  // useDataTable 里按这个版本号触发（见那边的 scopeKey effect）。
  const [scopeEpoch, setScopeEpoch] = useState(0);

  const held: Partial<DataTableListState> = opts.list ? opts.list.value : local;
  // 外部持有时链接里的每页条数优先于个人偏好：分享出去的「第 3 页」得是同一个第 3 页。
  const pageSize = opts.list
    ? (held.pageSize ?? preferences.pageSize ?? defaultPageSize)
    : (preferences.pageSize ?? local.pageSize);
  const pageIndex = held.pageIndex ?? 0;
  const filter = held.filter ?? "";

  // 外部持有方每次渲染解析出的都是新数组；内容没变就沿用旧引用，免得表实例把它当成排序变了。
  const sortingRef = useRef<SortingState>(NO_SORTING);
  const heldSorting = held.sorting ?? NO_SORTING;
  if (!sameSorting(sortingRef.current, heldSorting)) sortingRef.current = heldSorting;
  const sorting = sortingRef.current;

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex, pageSize }),
    [pageIndex, pageSize],
  );

  // 变更函数全部经 ref 读「此刻的值」和外部适配器：它们的引用因此恒定（进了下游的 effect
  // 依赖），而同一个事件处理里连着两次变更（提交搜索 = 写搜索值 + 回第 1 页）也能叠加，
  // 不会后一次拿着旧值把前一次盖掉。
  const currentRef = useRef<DataTableListState>({ pageIndex, pageSize, sorting, filter });
  currentRef.current = { pageIndex, pageSize, sorting, filter };
  const listRef = useRef(opts.list);
  listRef.current = opts.list;

  const update = useCallback(
    (change: (previous: DataTableListState) => DataTableListState) => {
      const previous = currentRef.current;
      const next = change(previous);
      if (sameListState(previous, next)) return;
      currentRef.current = next;
      if (listRef.current) listRef.current.onChange(next);
      else setLocal(next);
      if (preferenceStore && next.pageSize !== previous.pageSize) {
        preferenceStore.set({ ...preferenceStore.get(), pageSize: next.pageSize });
      }
    },
    [preferenceStore],
  );

  const resetPaging = useCallback(() => {
    // 新查询从第一页开始，否则会停留在越界页
    update((previous) => ({ ...previous, pageIndex: 0 }));
    setScopeEpoch((n) => n + 1);
  }, [update]);

  /** 提交搜索值：写入已提交的 filter 并回到第 1 页。防抖由调用方负责——
   *  输入节奏是输入框自己的事，放进状态机就必须把即时值也留在页面级，
   *  那正是「敲一个字母整表重画」的来源。 */
  const commitSearch = useCallback(
    (value: string) => {
      update((previous) => ({ ...previous, filter: value, pageIndex: 0 }));
      setScopeEpoch((n) => n + 1);
    },
    [update],
  );

  const onPaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      update((previous) => ({
        ...previous,
        ...functionalUpdate(updater, {
          pageIndex: previous.pageIndex,
          pageSize: previous.pageSize,
        }),
      }));
    },
    [update],
  );
  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      update((previous) => ({ ...previous, sorting: functionalUpdate(updater, previous.sorting) }));
    },
    [update],
  );

  const setDensity = useCallback(
    (density: TableDensity) => {
      if (preferenceStore) preferenceStore.set({ ...preferenceStore.get(), density });
      else setLocalDensity(density);
    },
    [preferenceStore],
  );

  /** 只在接了偏好存储时有值；没接时列显隐留给表实例自管，这里不插手。 */
  const setColumnVisibility = useMemo(
    () =>
      preferenceStore
        ? (columnVisibility: Record<string, boolean>) =>
            preferenceStore.set({ ...preferenceStore.get(), columnVisibility })
        : undefined,
    [preferenceStore],
  );

  return {
    params: { pageIndex, pageSize, sorting, filter },
    pagination,
    sorting,
    scopeEpoch,
    commitSearch,
    resetPaging,
    onPaginationChange,
    onSortingChange,
    density: preferences.density ?? localDensity,
    setDensity,
    /** 已存下来的列显隐；用户没动过任何列时为 undefined。 */
    columnVisibility: preferences.columnVisibility,
    setColumnVisibility,
  };
}

export type DataTableState = ReturnType<typeof useDataTableState>;
