import { type Localize, useLocalization } from "@jcoder/abp-react/react";
import {
  type RowData,
  type RowSelectionState,
  type TableOptions,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { createElement, type MouseEvent, useEffect, useMemo, useRef } from "react";
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

/** 共享的空选择态。写成 `?? {}` 每渲染都新建对象，TanStack 按身份比对会当成受控 state 变了，
 *  在「未受控 rowSelection + 其它受控 prop 变化」的组合下自持重渲染。 */
const EMPTY_ROW_SELECTION: RowSelectionState = {};

/** 页内选择列：表头全选（含 indeterminate），行内单选；checked→事件由调用方 handler 消费 `event.target.checked`。 */
function selectionColumn<TData extends RowData>(L: Localize): TableColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    // 组件注入的列不进 Columns 菜单：藏掉它只会让「已选 N 项」无从取消，且菜单里会出现无标签项
    enableHiding: false,
    meta: { className: "w-10" },
    header: ({ table }) =>
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
    cell: ({ row }) =>
      createElement(Checkbox, {
        checked: row.getIsSelected(),
        onCheckedChange: (value: boolean | "indeterminate") =>
          row.getToggleSelectedHandler()({ target: { checked: value === true } }),
        onClick: (e: MouseEvent) => e.stopPropagation(),
        "aria-label": L("Table:SelectRow"),
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
  selectedRows: TData[];
  /** 只保留这些行选中；部分失败时回填用。ids 是 `getRowId` 产出的行 ID。 */
  keepSelected: (ids: string[]) => void;
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
  const table = useTable({
    features: tableFeatureSet,
    data: opts.data,
    columns,
    pageCount: opts.pageCount ?? 1,
    onPaginationChange: state.onPaginationChange,
    onSortingChange: state.onSortingChange,
    onRowSelectionChange: state.onRowSelectionChange,
    enableRowSelection: opts.selectable ?? false,
    manualPagination: true,
    manualSorting: true,
    getRowId: opts.getRowId,
    ...opts.tableOptions,
    // 一层合并而非整体覆盖：tableOptions.state 只能按键覆盖/追加受管切片，
    // 不会把 pagination/sorting/rowSelection 整体挤掉造成组件渲染与表状态失步。
    state: {
      pagination: state.pagination,
      sorting: state.sorting,
      rowSelection: state.rowSelection ?? EMPTY_ROW_SELECTION,
      ...opts.tableOptions?.state,
    },
  });

  // 行离场（删除后 refetch、外部 invalidate）时剔除对应的选中 id。选中数有两个口径：
  // 批量条显隐看 state 键数，内容看在场行数，不剪枝就会分裂出「已选 0 项」的幽灵批量条。
  // 剪枝只看当前 data，跟 keepPreviousData 天然兼容，fetching 期间旧行还在场，不会误清。
  const { data, getRowId } = opts;
  const { rowSelection, onRowSelectionChange } = state;
  useEffect(() => {
    const selected = Object.keys(rowSelection);
    if (selected.length === 0) return;
    const present = new Set(data.map((row, index) => getRowId?.(row, index) ?? String(index)));
    if (selected.every((id) => present.has(id))) return;
    onRowSelectionChange(
      Object.fromEntries(Object.entries(rowSelection).filter(([id]) => present.has(id))),
    );
  }, [data, rowSelection, onRowSelectionChange, getRowId]);

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  return {
    table,
    state,
    selectedRows,
    keepSelected: state.keepSelected,
    pageCount: opts.pageCount ?? 1,
    rowCount: opts.rowCount,
    selectable: opts.selectable ?? false,
  };
}
