import { type Localize, useLocalization } from "@jcoder-stack/abp-react/react";
import {
  type RowData,
  Subscribe,
  type TableOptions,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  createElement,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { devWarn } from "@/components/data-table/dev-warn";
import {
  baseFeatureMap,
  features,
  type TableColumnDef,
  type TableFeatures,
  type TableInstance,
} from "@/components/data-table/table-core";
import {
  type DataTableState,
  useDataTableState,
} from "@/components/data-table/use-data-table-state";
import { Checkbox } from "@/components/ui/checkbox";

type SelectionAtom = TableInstance<RowData>["atoms"]["rowSelection"];
type SelectionState = ReturnType<SelectionAtom["get"]>;

/** `Subscribe` 的「单一 source + selector」那条重载对应的 props 形状。
 *  本文件是 .ts（文件名进了 registry 清单），写不了 JSX，只能 createElement；而
 *  createElement 会把重载塌成最后一条（全 store，不收 source），显式给出 props 才选得对。 */
interface SelectionSubscribeProps<TSelected> {
  source: SelectionAtom;
  selector: (state: SelectionState) => TSelected;
  children: (selected: TSelected) => ReactNode;
}

/** 同上，对应「单一 source、无 selector」那条重载：整片选中映射按浅比较驱动重渲染。 */
interface SelectionIdentitySubscribeProps {
  source: SelectionAtom;
  selector?: undefined;
  children: (state: SelectionState) => ReactNode;
}

/** 页内选择列：表头全选（含 indeterminate），行内单选；checked→事件由调用方 handler 消费 `event.target.checked`。
 *
 *  两个复选框都包在 `Subscribe` 里而不是渲染期直接读：宿主的 `useTable` selector 已把
 *  rowSelection 摘出订阅，勾选不再重渲染 DataTable，渲染期读到的是永远停在初始态的快照。
 *  用独立导出的 `Subscribe` 而非 `table.Subscribe`——列的 header/cell 上下文给的是核心
 *  `Table`，`Subscribe` 只挂在 `useTable` 另行 memo 出的返回对象上，这里类型上拿不到。
 *  本文件统一用它（含下方的 `SelectedCount`）：`table.Subscribe` 只是同一组件补了个默认
 *  source，我们每处都显式给 source，同名两份反而只会在阅读时混淆。
 *
 *  cell 这份订阅与 `data-table.tsx` 的 `DataTableRow` 那份在当前组合下是重叠的——整行已被
 *  包在同样的订阅里，删掉这一份测试也全绿。重叠是有意的：本列定义要能独立成立，契约不该是
 *  「只有被 `DataTableRow` 包着才会刷新」，而 `UseDataTableOptions.features` 的 TSDoc 正教着
 *  下游去改 `data-table.tsx` 的表体。代价只是每行多一个订阅。 */
function selectionColumn<TData extends RowData>(L: Localize): TableColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    // 组件注入的列不进 Columns 菜单：藏掉它只会让「已选 N 项」无从取消，且菜单里会出现无标签项
    enableHiding: false,
    meta: { className: "w-10" },
    header: ({ table }) =>
      createElement<SelectionIdentitySubscribeProps>(Subscribe, {
        source: table.atoms.rowSelection,
        // 整片订阅而非投影：全选框的三态还取决于当前页在场哪些行，selector 只拿得到选中映射，
        // 算不出来；三态在回调里现算，那两个 getter 都直接读原子，读到的是最新值。
        // biome-ignore lint/correctness/noChildrenProp: Subscribe 的 children 是 render prop，createElement 的可变子参数只收 ReactNode，塞不进去
        children: () =>
          createElement(Checkbox, {
            checked: table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false,
            onCheckedChange: (value: boolean | "indeterminate") =>
              table.getToggleAllPageRowsSelectedHandler()({ target: { checked: value === true } }),
            "aria-label": L("Table:SelectAll"),
            // 半选只隐藏对勾，保留 indeterminate。对勾表示「全选」，拿它表示「部分」会误导；
            // aria-checked="mixed" 得留着，否则读屏会把「已选 2 行」播报成「未选中」。
            // 选了几行由紧邻上方的批量条给出。
            // tree 块的 TriStateCheckbox 半选画横线，跟这里不一样，别当不一致来「修」：
            // 那边把「部分授予」误读成「全部授予」是授权问题，这里只影响感知，不值得为它加依赖。
            className: "data-[state=indeterminate]:[&_[data-slot=checkbox-indicator]]:opacity-0",
          }),
      }),
    cell: ({ row, table }) =>
      createElement<SelectionSubscribeProps<boolean>>(Subscribe, {
        source: table.atoms.rowSelection,
        selector: (s) => Boolean(s?.[row.id]),
        // biome-ignore lint/correctness/noChildrenProp: 同上
        children: (selected) =>
          createElement(Checkbox, {
            checked: selected,
            onCheckedChange: (value: boolean | "indeterminate") =>
              row.getToggleSelectedHandler()({ target: { checked: value === true } }),
            onClick: (e: MouseEvent) => e.stopPropagation(),
            "aria-label": L("Table:SelectRow"),
          }),
      }),
  };
}

export interface UseDataTableOptions<TData extends RowData> {
  /** 分页/排序/选择状态机；省略则内部自建（纯客户端数据场景，不需要与外部查询参数联动）。 */
  state?: DataTableState;
  /** 列定义，引用必须稳定。`useTable` 每渲染收到新数组会重建列模型，上层所有以 columns
   *  为依赖的 memo 也跟着失效。`header` 里要用 `L()` 就包一层 `useMemo(() => [...], [L])`，
   *  `L` 的引用是稳的，等价于永久 memo。违反时 DEV 期会告警。 */
  columns: TableColumnDef<TData>[];
  data: TData[];
  pageCount?: number;
  rowCount?: number;
  selectable?: boolean;
  getRowId?: (row: TData, index: number) => string;
  /** 追加 TanStack 特性，与基础集加法合并。引用必须稳定，建议用模块级常量：`useTable` 只在
   *  挂载时构造一次表实例，特性在那时注册完，之后再变会被忽略，也不会触发重建。
   *
   *  注册不等于渲染。注册只让特性的状态和 API 可用，`DataTable` 的表现层不会自动跟上：
   *  注册 `columnResizingFeature` 后表头里没有 resize handle，注册 `rowExpandingFeature`
   *  后表体也只有 `row.getVisibleCells()`。要让它有画面就得改 `data-table.tsx`，
   *  这正是 copy-in 分发的用法。 */
  features?: Parameters<typeof tableFeatures>[0];
  /** 透传给 useTable，展开在受管选项之后，同名键调用方赢，接管即自负。
   *  `features` 走专门的 prop，类型层禁止在这里传，免得打破加法合并的不变式。 */
  tableOptions?: Omit<Partial<TableOptions<TableFeatures, TData>>, "features">;
}

export interface DataTableInstance<TData extends RowData> {
  table: TableInstance<TData>;
  state: DataTableState;
  /** 当前选中行，调用时取值。选中态归表所有，页面不再随它重渲染，
   *  渲染期读到的快照会陈旧——只在动作处理函数里调它。 */
  getSelectedRows: () => TData[];
  clearSelection: () => void;
  /** 只保留这些行选中；部分失败时回填用。ids 是 `getRowId` 产出的行 ID。 */
  keepSelected: (ids: string[]) => void;
  /** 订阅选中态并把计数交给 children，用于渲染期显示计数。 */
  SelectedCount: (props: { children: (count: number) => ReactNode }) => ReactNode;
  pageCount: number;
  rowCount?: number;
  selectable: boolean;
}

/** 建 TanStack 表实例：合成勾选列、注册特性、绑定状态机、剪枝离场行的选中态。 */
export function useDataTable<TData extends RowData>(
  opts: UseDataTableOptions<TData>,
): DataTableInstance<TData> {
  const L = useLocalization();
  // hooks 必须无条件调用：外部没给 state 也要建内部状态机，只是外部给了就不用
  const internalState = useDataTableState();
  const state = opts.state ?? internalState;

  const columns = useMemo(
    () => (opts.selectable ? [selectionColumn<TData>(L), ...opts.columns] : opts.columns),
    [opts.selectable, opts.columns, L],
  );
  const tableFeatureSet = useMemo(
    () => (opts.features ? tableFeatures({ ...baseFeatureMap, ...opts.features }) : features),
    [opts.features],
  );
  // 引用比较：features 的契约本就是「必须引用稳定」，引用变本身即误用，无需比较内容。
  const mountedFeatures = useRef(opts.features);
  useEffect(() => {
    if (mountedFeatures.current !== opts.features) {
      devWarn(
        "data-table:features-changed",
        "data-table: features prop 在挂载后改变了引用，新值已被忽略。useTable 只在挂载时构造" +
          "表实例、特性注册在构造时完成，挂载后的变更不会触发重建。请把它提成模块级常量。",
      );
    }
  }, [opts.features]);
  const prevColumns = useRef(opts.columns);
  const columnsChurn = useRef(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    columnsChurn.current = prevColumns.current === opts.columns ? 0 : columnsChurn.current + 1;
    prevColumns.current = opts.columns;
    if (columnsChurn.current >= 3) {
      devWarn(
        "data-table:columns-churn",
        "data-table: columns 每次渲染都是新数组，表实例的列模型与上层所有以 columns 为依赖的 " +
          "memo 会全部失效。用 useMemo(() => [...], [L]) 包住——useLocalization 的 L 引用稳定，" +
          "等价于永久 memo。",
      );
    }
  });
  const table = useTable(
    {
      features: tableFeatureSet,
      data: opts.data,
      columns,
      pageCount: opts.pageCount ?? 1,
      onPaginationChange: state.onPaginationChange,
      onSortingChange: state.onSortingChange,
      enableRowSelection: opts.selectable ?? false,
      manualPagination: true,
      manualSorting: true,
      getRowId: opts.getRowId,
      ...opts.tableOptions,
      // 一层合并而非整体覆盖：tableOptions.state 只能按键覆盖/追加受管切片，
      // 不会把 pagination/sorting 整体挤掉造成组件渲染与表状态失步。
      // rowSelection 刻意缺席：那一片归表自己所有，见下方的 SelectedCount / getSelectedRows。
      state: {
        pagination: state.pagination,
        sorting: state.sorting,
        ...opts.tableOptions?.state,
      },
    },
    // 省略 selector 等于订阅全部切片，勾一个复选框就要重渲染整张表，成本随行数放大。
    // 摘掉 rowSelection 之后它由表头/行内/SelectedCount 各自定点订阅，宿主不再为它重渲染。
    // 用排除法而非列举需要的切片：features 是加法合并的，调用方追加特性带来的切片
    // （如 columnFilteringFeature 的 columnFilters）不在列举里就永远不触发重渲染，
    // 他们的筛选 UI 会静默失灵。返回新对象不会每渲染都重渲染——结果走浅比较。
    (tableState) => {
      const { rowSelection: _rowSelection, ...rest } = tableState;
      return rest;
    },
  );

  // 全部取自表实例但绕开 table 本身：useTable 每渲染都返回一份新的表对象（options 是渲染期
  // 新建的），拿 table 当依赖等于没 memo；而这些方法与原子建表时就定下，引用恒定。
  const { getSelectedRowModel, resetRowSelection, setRowSelection } = table;
  const rowSelectionAtom = table.atoms.rowSelection;

  // 翻页/排序/换查询语境会换一批在场行，页内选择随之作废。这条不变式原先在状态机里，
  // 但那里拿不到表实例；所有权交给表之后只能在这里承接。
  // scopeEpoch 不可省：搜索与查询面板提交都走 resetPaging，用户本来就在第 1 页时
  // 分页与排序可以一起纹丝不动，只比这两样会让选中态跨查询语境残留。
  const { pageIndex, pageSize } = state.pagination;
  const scopeKey = `${pageIndex}:${pageSize}:${state.scopeEpoch}:${state.sorting.map((s) => `${s.id}:${s.desc}`).join(",")}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    // 挂载帧不算「翻页/排序变了」：不跳过就会在首次 effect 里清一次选择，把挂载前经
    // keepSelected 回填的结果立刻抹掉。用「上次作用域」而非「是不是首帧」记这件事，
    // 顺带扛住依赖抖动——resetRowSelection 每次写入的都是新对象，多跑一次就再触发一次
    // 渲染，真被无谓地重跑就是死循环。
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    resetRowSelection();
  }, [scopeKey, resetRowSelection]);

  // 行离场（删除后 refetch、外部 invalidate）时剔除对应的选中 id。选中数有两个口径：
  // 批量条显隐看 state 键数，内容看在场行数，不剪枝就会分裂出「已选 0 项」的幽灵批量条。
  // 剪枝只看当前 data，跟 keepPreviousData 天然兼容，fetching 期间旧行还在场，不会误清。
  useEffect(() => {
    // 从原子读而非从渲染期快照读：上面那条清空 effect 先跑，翻页同时换数据时快照已经过期。
    // table.atoms 的键是必需的（Atoms<TFeatures> 用了 -?），rowSelectionFeature 已在
    // baseFeatureMap 里注册，所以这里不需要可选链；?? {} 只兜住切片值本身的 undefined。
    const current = rowSelectionAtom.get() ?? {};
    const selected = Object.keys(current);
    if (selected.length === 0) return;
    const present = new Set(
      opts.data.map((row, index) => opts.getRowId?.(row, index) ?? String(index)),
    );
    if (selected.every((id) => present.has(id))) return;
    setRowSelection(Object.fromEntries(Object.entries(current).filter(([id]) => present.has(id))));
  }, [opts.data, opts.getRowId, rowSelectionAtom, setRowSelection]);

  const getSelectedRows = useCallback(
    () => getSelectedRowModel().rows.map((r) => r.original),
    [getSelectedRowModel],
  );
  const clearSelection = useCallback(() => resetRowSelection(), [resetRowSelection]);
  const keepSelected = useCallback(
    (ids: string[]) => setRowSelection(Object.fromEntries(ids.map((id) => [id, true]))),
    [setRowSelection],
  );

  /** 订阅选中态并把计数交给 children。用它而不是在渲染期读快照——
   *  所有权在表里之后，页面不再因选中变化重渲染，快照会陈旧。
   *  组件身份必须稳定，否则每渲染都是一个新组件类型，React 会把它整棵子树卸载重挂
   *  （工具条要把搜索框放进它的 children，重挂就丢焦点和已输入内容）。 */
  const SelectedCount = useMemo(
    () =>
      function SelectedCount(p: { children: (count: number) => ReactNode }) {
        return createElement<SelectionSubscribeProps<number>>(Subscribe, {
          source: rowSelectionAtom,
          selector: (s) => Object.keys(s ?? {}).length,
          // biome-ignore lint/correctness/noChildrenProp: Subscribe 的 children 是 render prop（收计数返回节点），createElement 的可变子参数只收 ReactNode，塞不进去
          children: p.children,
        });
      },
    [rowSelectionAtom],
  );

  return {
    table,
    state,
    getSelectedRows,
    clearSelection,
    keepSelected,
    SelectedCount,
    pageCount: opts.pageCount ?? 1,
    rowCount: opts.rowCount,
    selectable: opts.selectable ?? false,
  };
}
