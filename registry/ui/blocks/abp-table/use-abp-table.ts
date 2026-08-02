import { toAbpListParams, toPagedResult } from "@jcoder/abp-react/core";
import { useLocalization, usePermissionChecker } from "@jcoder/abp-react/react";
import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  revalidateLogic,
} from "@tanstack/react-form";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { useBoundComponents } from "@/components/abp/crud/create-bound-components";
import {
  ABP_RESERVED_LIST_PARAM_NAMES,
  type CrudDeleteHook,
  type CrudService,
  type CrudWriteHooks,
  type ListParams,
} from "@/components/abp/crud/crud-service";
import { AbpBulkDeleteView } from "@/components/abp/table/abp-bulk-delete";
import { AbpTableView, type AbpTableViewOwnProps } from "@/components/abp/table/abp-table";
import { RowActionsMenu } from "@/components/abp/table/row-actions-menu";
import { devWarn } from "@/components/data-table/dev-warn";
import type { CellTableInstance, TableColumnDef } from "@/components/data-table/table-core";
import { type UseDataTableOptions, useDataTable } from "@/components/data-table/use-data-table";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { useAppForm } from "@/components/form/form-hook";

/** 留白字段不该变成 `Name=` 空串发给后端，`""` 和 `undefined` 都不进请求。 */
function pruneEmpty(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== "" && v !== undefined));
}

/** 跨字段 zod 校验没给 issue 挂 `path` 时，错误落在 `errorMap.onDynamic` 的 `""` 桶。
 *  走 unknown + 收窄而不是 `state.errorMap` 的具体类型，是为了绕开 TOnDynamic 那串泛型形参。 */
function hasUnroutedCrossFieldError(errorMap: unknown): boolean {
  if (typeof errorMap !== "object" || errorMap === null) return false;
  const onDynamic = (errorMap as { onDynamic?: unknown }).onDynamic;
  if (typeof onDynamic !== "object" || onDynamic === null) return false;
  const bucket = (onDynamic as Record<string, unknown>)[""];
  return Array.isArray(bucket) && bucket.length > 0;
}

/** 空操作删除 hook，顶替只读 service 缺失的 `useDelete`。
 *  这样 `useServiceSource` 每次渲染都无条件调用一个 hook，
 *  而不是 `service.useDelete?.(...)` 那种真正的条件调用。 */
const useNoopDelete: CrudDeleteHook["useDelete"] = () => ({
  mutate: () => {},
  mutateAsync: async () => undefined,
  isPending: false,
});

/** 在 `CrudService` 上补回可选的 create/update/delete 键。`CrudService` 本身不含这三个
 *  （只读 service 上它们不存在），但这里要判断它们在不在才能派生 `can`/`delete`，
 *  `Partial<...>` 让"有"和"没有"两种形状都赋得进来。 */
type AbpTableSourceService<
  TDto extends { id?: string },
  TCreate,
  TUpdate,
  TListParams extends Record<string, unknown>,
> = CrudService<TDto, TCreate, TUpdate, TListParams> &
  Partial<CrudWriteHooks<TCreate, TUpdate>> &
  Partial<CrudDeleteHook>;

export interface AbpTableRowConfig<TDto extends { id?: string }> {
  /** 追加在内置「···」菜单三项之后的自定义菜单项。引用必须稳定（模块级函数或 `useCallback`），
   *  它在操作列的 `useMemo` 依赖里，每渲染换新引用会让整张表的列模型重建。 */
  menu?: (row: TDto, table: CellTableInstance<TDto>) => ReactNode;
  /** 插入内置「···」菜单**左侧**的行内常驻操作。同上，引用必须稳定。 */
  actions?: (row: TDto, table: CellTableInstance<TDto>) => ReactNode;
  /** 覆盖对应内置项的默认出现条件；省略时按 can/onOpen/click 推导。 */
  view?: boolean;
  edit?: boolean;
  delete?: boolean;
  /** 默认：`onOpen` 存在时点行开详情；`false` 关闭；也可给自定义回调。 */
  click?: false | ((row: TDto) => void);
}

export interface UseAbpTableOptions<
  TDto extends { id?: string },
  TQueryDefaults extends Record<string, unknown>,
> {
  /** 列定义，见 `useDataTable` 同名 prop 的引用稳定性要求。 */
  columns: TableColumnDef<TDto>[];
  /** 查询表单。`defaults` 只在这里生效（字段上不带 `default`），首帧就用它发请求，
   *  免得先空筛选请求一次、挂载后再请求一次，中间闪一下未筛数据。
   *  省略则不建查询表单，`queryForm` 的 values 退化成空对象。 */
  query?: {
    defaults: TQueryDefaults;
    /** 额外校验器的逃生舱。形状照抄 `AbpFormConfig["validators"]`，别换成
     *  `Parameters<typeof useAppForm>[0]["validators"]`：那是个自引用类型，和 `defaultValues`
     *  塞进同一个 `useAppForm` 调用，会让 `TFormData` 的推断整体塌成 unknown，
     *  `t.queryForm` 的字段名收窄跟着失效。
     *  `onDynamic` 在这里不是保留位，查询表单没走 `abpFormOptions()` 预设，调用方可以自己传。 */
    validators?: {
      onMount?: FormValidateOrFn<TQueryDefaults>;
      onChange?: FormValidateOrFn<TQueryDefaults>;
      onChangeAsync?: FormAsyncValidateOrFn<TQueryDefaults>;
      onBlur?: FormValidateOrFn<TQueryDefaults>;
      onBlurAsync?: FormAsyncValidateOrFn<TQueryDefaults>;
      onDynamic?: FormValidateOrFn<TQueryDefaults>;
      onDynamicAsync?: FormAsyncValidateOrFn<TQueryDefaults>;
    };
  };
  row?: AbpTableRowConfig<TDto>;
  onOpen?: (mode: "create" | "edit" | "view", record?: TDto) => void;
  selectable?: boolean;
  defaultPageSize?: number;
  features?: UseDataTableOptions<TDto>["features"];
  tableOptions?: UseDataTableOptions<TDto>["tableOptions"];
  /** 顶部条「导出」图标的回调插槽；缺席不渲染导出按钮。组件库不内置导出实现。 */
  onExport?: () => void;
}

/**
 * service → source 归一：列表、删除、权限收在这里，create/update 归 `useAbpSheet`。
 * 只读 service 没有 `useDelete`，用 `useNoopDelete` 顶替，调用点才不是条件 hook。
 *
 * `listParams` 收到的已经是合并后的最终请求参数，看不到查询表单的原始键，
 * 所以 ABP 保留名的 devWarn 剔除不在这里做，在 `useAbpTable` 的合并处。
 */
function useServiceSource<
  TDto extends { id?: string },
  TCreate,
  TUpdate,
  TListParams extends Record<string, unknown>,
>(
  service: AbpTableSourceService<TDto, TCreate, TUpdate, TListParams>,
  listParams: ListParams,
): AbpTableSource<TDto> {
  const L = useLocalization();
  const can = usePermissionChecker();
  const queryClient = useQueryClient();

  const listQuery = service.useList(listParams, {
    query: { placeholderData: keepPreviousData, select: toPagedResult },
  });
  const totalCount = listQuery.data?.totalCount ?? 0;
  const pageCount = Math.max(Math.ceil(totalCount / listParams.MaxResultCount), 1);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: service.listKey() });
  const deleted = () => {
    toast.success(L("Crud:Deleted"));
    void invalidate();
  };
  const deleteFailed = () => toast.error(L("Crud:OperationFailed"));

  const useDeleteHook = service.useDelete ?? useNoopDelete;
  const rawDelete = useDeleteHook({ mutation: { onSuccess: deleted, onError: deleteFailed } });
  // 批量删除另起一个 mutation 实例，不带回调。单条删除的 onSuccess/onError 是逐条触发的，
  // 批量复用它删 N 条就会弹 N 个 toast、发 N 次重取。整批的汇总和失效由 deleteMany 负责。
  const rawBulkDelete = useDeleteHook();

  const bulkMutateAsync = rawBulkDelete.mutateAsync;
  const deleteMany = useCallback(
    async (ids: string[]) => {
      const failed: string[] = [];
      // 顺序而非并发：ABP 的删除常连带关联清理，并发提交容易撞上后端的并发/死锁保护，
      // 把「后端拒绝」误算成「这条删不掉」。
      for (const id of ids) {
        try {
          await bulkMutateAsync({ id });
        } catch {
          failed.push(id);
        }
      }
      await queryClient.invalidateQueries({ queryKey: service.listKey() });
      return { failed };
    },
    [bulkMutateAsync, queryClient, service.listKey],
  );

  // 把 orval 的 {id} 变量形状拆回 mutate(id)/mutateAsync(id)。useMemo 的依赖挂在
  // mutate/mutateAsync/isPending 上，不能挂 rawDelete：useMutation 每渲染都返回新的包装对象，
  // 挂它会让这个 memo 每渲染都失效，连累下面 rowActionsSrc → columns 整条链。deleteMany 同理。
  const deleteMutation = useMemo(
    () => ({
      mutate: (id: string) => rawDelete.mutate({ id }),
      mutateAsync: (id: string) => rawDelete.mutateAsync({ id }),
      isPending: rawDelete.isPending,
      many: deleteMany,
    }),
    [rawDelete.mutate, rawDelete.mutateAsync, rawDelete.isPending, deleteMany],
  );

  const allow = (policy: string | undefined) => (policy === undefined ? true : can(policy));

  return {
    listQuery,
    pageCount,
    totalCount,
    delete: service.useDelete !== undefined ? deleteMutation : undefined,
    can: {
      create: service.useCreate !== undefined && allow(service.resolvedPolicies.create),
      update: service.useUpdate !== undefined && allow(service.resolvedPolicies.update),
      delete: service.useDelete !== undefined && allow(service.resolvedPolicies.delete),
    },
    supportsFilter: service.supportsFilter !== false,
  };
}

/**
 * 一次调用给出页面要用的全部东西：查询表单、归一后的 `AbpTableSource`、TanStack 表实例。
 * 调用方不用再把 `table`/`crud`/`queryForm` 分别接到 `AbpTable` 的多个 props 上。
 *
 * `query.defaults` 只在这里生效，首帧就用它发请求。计算型默认值（比如"最近一周"）要在
 * route loader 里算好再传进来，渲染期调 `new Date()` 会导致水合不一致。
 *
 * 跨字段 zod 校验（比如"起始日期须早于结束"）记得给 issue 一个具体 `path`，例如
 * `.refine(fn, { path: ["MinPublishDate"] })`，它才会落进字段级的内联错误。不带 `path` 的
 * 表单级错误落在 `errorMap.onDynamic` 的 `{"": issue[]}` 里，`FormErrors` 只订阅 `onSubmit`，
 * 渲染不出来，这里也不代为兜底。
 *
 * 第一个参数传 service 或回调都行，但同一次 `useAbpTable` 调用里不能中途换种类。
 * 下面的分叉因此只是类型上的"条件"，运行时 lifetime 稳定，不是条件 hook。
 */
export function useAbpTable<
  TDto extends { id?: string },
  TCreate = unknown,
  TUpdate = unknown,
  TListParams extends Record<string, unknown> = Record<string, unknown>,
  TQueryDefaults extends Record<string, unknown> = Record<string, never>,
>(
  source:
    | AbpTableSourceService<TDto, TCreate, TUpdate, TListParams>
    | ((params: ListParams) => AbpTableSource<TDto>),
  opts: UseAbpTableOptions<TDto, TQueryDefaults>,
) {
  const L = useLocalization();
  const state = useDataTableState({ defaultPageSize: opts.defaultPageSize });

  const queryDefaults: TQueryDefaults = opts.query?.defaults ?? ({} as TQueryDefaults);
  const [params, setParams] = useState<Record<string, unknown>>(() => pruneEmpty(queryDefaults));

  const queryForm = useAppForm({
    defaultValues: queryDefaults,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: opts.query?.validators,
    onSubmit: ({ value }) => {
      setParams(pruneEmpty(value as Record<string, unknown>));
      // 筛选变化必回第 1 页并清选择，这条不变式只在 useDataTableState.resetPaging 里实现。
      state.resetPaging();
    },
  });

  // 4 个 ABP 分页协议字段归表格状态机独占：查询表单里的同名键无条件剔除，不管当前有没有值。
  // 按值剔除会变成"随排序/搜索状态时灵时不灵"的间歇故障，比一直不工作更难查。
  // 也只有这里同时看得到查询表单的原始键和 toAbpListParams 的输出，useServiceSource 分不清。
  const reserved = Object.keys(params).filter((key) => ABP_RESERVED_LIST_PARAM_NAMES.has(key));
  if (reserved.length > 0) {
    devWarn(
      `use-abp-table:reserved-param:${reserved.join(",")}`,
      `useAbpTable: 查询表单里的 ${reserved.join("、")} 属 ABP 分页协议保留名，已被剔除。` +
        "分页/排序/搜索归表格状态机独占，请走各自的内建控件，不要用查询表单字段传。",
    );
  }
  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !ABP_RESERVED_LIST_PARAM_NAMES.has(key)),
  );
  const listParams: ListParams = { ...safeParams, ...toAbpListParams(state.params) };

  // source 的种类跨渲染不变，分支 lifetime 稳定，不是条件 hook。见函数 TSDoc。
  const src =
    typeof source === "function"
      ? source(listParams)
      : // biome-ignore lint/correctness/useHookAtTopLevel: 见上，source 的种类跨渲染不变，分支 lifetime 稳定
        useServiceSource(source, listParams);

  // 检查收进自己的包装函数，不改写表单实例的 handleSubmit，那依赖 TanStack Form 未承诺的
  // 「实例引用跨渲染稳定」。AbpTable 内建的「查询」按钮走这里。
  const queryFormRef = useRef(queryForm);
  queryFormRef.current = queryForm;
  const submitQuery = useCallback(async () => {
    await queryFormRef.current.handleSubmit();
    if (hasUnroutedCrossFieldError(queryFormRef.current.state.errorMap)) {
      devWarn(
        "use-abp-table:cross-field-error-no-path",
        "useAbpTable: 查询表单的跨字段校验错误没有挂 path，落在 errorMap.onDynamic 的空字符串桶里，" +
          "现有 FormErrors 只订阅 onSubmit 渲染不出来——给 .refine 的 issue 加一个具体字段的 path。",
      );
    }
  }, []);

  // 重置后要立即重新发请求，所以收进 hook 而不是把 reset() 丢给调用方。
  // 后者只要忘了跟一句 handleSubmit()，字段看着回到默认值，请求参数却纹丝不动。
  const resetQuery = useCallback(() => {
    queryFormRef.current.reset();
    void submitQuery();
  }, [submitQuery]);

  // 只读出口，导出「全部匹配行」这类需求要拿当前已提交的完整请求参数。
  // 返回的是提交结果的快照而不是表单草稿，「表单是唯一取值源」的不变式不破。
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const listStateRef = useRef(state.params);
  listStateRef.current = state.params;
  const getListParams = useCallback(
    () => ({ ...paramsRef.current, ...toAbpListParams(listStateRef.current) }),
    [],
  );

  const row: AbpTableRowConfig<TDto> = opts.row ?? {};
  const showView = row.view ?? (row.click === false && opts.onOpen !== undefined);
  const showEdit = row.edit ?? (src.can.update && opts.onOpen !== undefined);
  // source.delete 缺席时强制不显示删除项。自定义 source 把 can.delete 手误置成 true，
  // 也不会渲染出一个点了没反应的删除按钮。
  const showDelete = src.delete === undefined ? false : (row.delete ?? src.can.delete);

  // 窄化 src 的引用面并单独 memo，只随 can.update/can.delete/delete 变，
  // 免得每渲染新建的 source 字面量让 columns 跟着重算（同 deleteMutation 那处）。
  // `delete` 直接透传 `src.delete`，两边形状本就一致，不用再包一层。
  const rowActionsSrc = useMemo(
    () => ({
      can: { update: src.can.update, delete: src.can.delete },
      delete: src.delete,
    }),
    [src.can.update, src.can.delete, src.delete],
  );

  const finalColumns = useMemo<TableColumnDef<TDto>[]>(() => {
    if (
      !showView &&
      !showEdit &&
      !showDelete &&
      row.actions === undefined &&
      row.menu === undefined
    ) {
      return opts.columns;
    }
    return [
      ...opts.columns,
      {
        id: "actions",
        header: () => L("Table:Actions"),
        enableSorting: false,
        // 同理：藏掉操作列等于让行操作入口消失，不该出现在 Columns 菜单里
        enableHiding: false,
        cell: ({ row: cellRow, table: rowTable }) =>
          // 显式实例化泛型组件（TS 4.7 instantiation expression）。不钉死的话 createElement 会让
          // RowActionsMenu 重新推断自己的 TDto，跟外层的撞车：onOpen 的回调参数在逆变位，
          // 两个推断路径不同的 TDto 在那里对不上，报 "assignable to constraint 但不是 TDto 本身"。
          createElement(RowActionsMenu<TDto>, {
            record: cellRow.original,
            table: rowTable,
            onOpen: opts.onOpen,
            source: rowActionsSrc,
            rowActions: row.actions,
            show: { view: showView, edit: showEdit, delete: showDelete },
            items: row.menu,
          }),
      },
    ];
  }, [
    opts.columns,
    opts.onOpen,
    row.actions,
    row.menu,
    showView,
    showEdit,
    showDelete,
    rowActionsSrc,
    L,
  ]);

  // 末页被删空后 totalCount 和 pageCount 都缩了，但没人钳制 pageIndex，用户会停在一个
  // 「暂无数据」的越界空页上。setter 在 useDataTableState、pageCount 在 source，只在本 hook
  // 汇合，钳制只能放这里。三个取数状态的门控缺一不可：isPending/isFetching 在途时 totalCount
  // 还是旧值，isError 时它退化成 0、pageCount 恒 1，不门控就会把用户从报错的第 N 页拽回第 1 页。
  const { pageIndex } = state.pagination;
  const { isPending, isFetching, isError } = src.listQuery;
  useEffect(() => {
    if (isPending || isFetching || isError) return;
    if (pageIndex >= src.pageCount) {
      state.onPaginationChange((p) => ({ ...p, pageIndex: Math.max(src.pageCount - 1, 0) }));
    }
  }, [isPending, isFetching, isError, pageIndex, src.pageCount, state.onPaginationChange]);

  const dt = useDataTable({
    state,
    columns: finalColumns,
    data: src.listQuery.data?.items ?? [],
    pageCount: src.pageCount,
    rowCount: src.totalCount,
    selectable: opts.selectable,
    getRowId: (r, i) => r.id ?? String(i),
    features: opts.features,
    tableOptions: opts.tableOptions,
  });

  const instanceWithoutComponents = {
    ...dt,
    source: src,
    queryForm,
    submitQuery,
    resetQuery,
    getListParams,
    rowConfig: opts.row,
    onOpen: opts.onOpen,
    searchEnabled: src.supportsFilter,
    // 已提交的筛选项数，不是表单草稿。驱动筛选钮上的"还筛着"圆点，面板收起后唯一的状态提示。
    activeQueryCount: Object.keys(safeParams).length,
    onExport: opts.onExport,
  };

  // 绑定成员挂载。五个成员的身份跨渲染稳定（见 useBoundComponents），接线值经 read() 读活。
  // Toolbar/BulkBar 只是透传 Fragment，真正的容器由 AbpTableView 在对应槽位包裹，
  // 扫描（这里）和摆放（AbpTableView）解耦。
  const bound = useBoundComponents({ self: instanceWithoutComponents }, (read) => {
    /** 标记组件，自身渲染 null，只把字段 children 交给 t.Table 的槽位扫描。
     *  筛选面板的真实渲染由 AbpTableView 编排，这里就地渲染不到那个位置。 */
    const QueryForm = (_p: { children: ReactNode }) => null;
    const Toolbar = (p: { children: ReactNode }) => createElement(Fragment, null, p.children);
    const BulkBar = (p: { children: ReactNode }) => createElement(Fragment, null, p.children);
    // 内建批量删除。删除 mutation 和列表失效都在 source 上，页面再写一遍就是把同一份样板
    // 抄进每个 CRUD 页。摆在 t.BulkBar 里用。
    const BulkDelete = () =>
      createElement(AbpBulkDeleteView<TDto>, {
        source: read().self.source,
        selectedRows: read().self.selectedRows,
        keepSelected: read().self.keepSelected,
      });
    const Table = (p: AbpTableViewOwnProps<TDto> & { children?: ReactNode }) => {
      // 槽位扫描靠引用相等识别自家绑定成员（组件身份在 useBoundComponents 内跨渲染不变，
      // child.type 的比较因此稳定）。未知的直接子元素只 devWarn 不渲染，
      // t.Table 不是通用容器，只认这三种。
      const slots: { query?: { children: ReactNode }; toolbar?: ReactNode; bulkBar?: ReactNode } =
        {};
      Children.forEach(p.children, (child) => {
        if (!isValidElement(child)) return;
        if (child.type === QueryForm) slots.query = child.props as { children: ReactNode };
        else if (child.type === Toolbar) slots.toolbar = child;
        else if (child.type === BulkBar) slots.bulkBar = child;
        else
          devWarn(
            "abp-table:unknown-child",
            "useAbpTable: t.Table 只认 t.QueryForm/t.Toolbar/t.BulkBar 直接子元素，其余直接子元素会被忽略。",
          );
      });
      const { empty, skeletonRows, rowProps, pageSizes, searchPlaceholder } = p;
      return createElement(AbpTableView<TDto>, {
        t: read().self,
        slots,
        empty,
        skeletonRows,
        rowProps,
        pageSizes,
        searchPlaceholder,
      });
    };
    return { Table, QueryForm, Toolbar, BulkBar, BulkDelete };
  });

  return { ...instanceWithoutComponents, ...bound };
}

/** `useAbpTable` 的完整返回类型：`DataTableInstance` 全成员 + 数据侧接线 + 五个绑定成员。
 *  派生自 hook 自身的返回类型而不是手写，省得手拼 TanStack Form 那十几个校验器泛型形参。
 *
 *  `abp-table.tsx` 的 `AbpTableViewInstance` 不是它的扩展，是更窄的另一个类型，不含绑定成员。
 *  那些成员正是靠 `AbpTableView` 渲染出来的，反过来要求它消费的实例已经带着，会是循环依赖。 */
export type AbpTableInstance<
  TDto extends { id?: string },
  TQueryDefaults extends Record<string, unknown> = Record<string, never>,
> = ReturnType<typeof useAbpTable<TDto, unknown, unknown, Record<string, unknown>, TQueryDefaults>>;
