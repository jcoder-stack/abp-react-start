import { useLocalization } from "@jcoder-stack/abp-react/react";
import { CircleAlert, Plus, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { AbpBulkBarView } from "@/components/abp/table/abp-bulk-bar";
import {
  AbpQueryPanelToggle,
  AbpQueryPanelView,
  flattenFields,
} from "@/components/abp/table/abp-query-form";
import type { AbpTableRowConfig, QuerySummaryItem } from "@/components/abp/table/use-abp-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableViewMenu, isViewCustomized } from "@/components/data-table/data-table-view-menu";
import type {
  ExtraFeatureMap,
  NoExtraFeatures,
  TableRowInstance,
} from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";

/** `t.Table` 的表现层 props：不受管的 `DataTable` 透传项，缺省全部走内建默认。 */
export interface AbpTableViewOwnProps<
  TDto extends { id?: string },
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> {
  empty?: ReactNode;
  skeletonRows?: number | "pageSize";
  rowProps?: (row: TDto) => { className?: string };
  /** 行后追加的通栏内容，语义同 `DataTable` 的同名 prop。行展开的折叠详情用它，
   *  配 `useAbpTable({ features: expandingFeatures })` 后 `row.getIsExpanded()` 在类型上可见。 */
  renderSubRow?: (row: TableRowInstance<TDto, TExtra>) => ReactNode;
  pageSizes?: number[];
  searchPlaceholder?: string;
}

/** `AbpTableView` 消费的实例面：`useDataTable` 全量 + `useAbpTable` 的数据侧接线。
 *  不含五个绑定成员，那些正是靠本组件渲染出来的，反过来要求实例已经带着会是循环依赖。 */
export interface AbpTableViewInstance<
  TDto extends { id?: string },
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> extends DataTableInstance<TDto, TExtra> {
  source: AbpTableSource<TDto>;
  rowConfig?: AbpTableRowConfig<TDto, TExtra>;
  onOpen?: (mode: "create" | "edit" | "view", record?: TDto) => void;
  searchEnabled: boolean;
  submitQuery: () => Promise<void>;
  resetQuery: () => void;
  /** 当前已提交的筛选项数，驱动筛选钮上的"还筛着"圆点。 */
  activeQueryCount: number;
  /** 「全部匹配」标记：为真时批量动作处理的是全部匹配行，不只是当前页勾选的。 */
  allMatching: boolean;
  selectAllMatching: () => void;
  canSelectAllMatching: boolean;
  /** 筛选摘要行的条目：声明了摘要、且已提交值偏离默认的查询字段。 */
  querySummary: QuerySummaryItem[];
  resetQueryField: (key: string) => void;
  /** 查询表单回默认值并清掉搜索关键字，随即重新取数。 */
  clearFilters: () => void;
  /** 当前筛选是否偏离了默认状态；为 false 时 `clearFilters` 不会改变结果。 */
  canClearFilters: boolean;
  onExport?: () => void;
}

export interface AbpTableViewSlots {
  /** `t.QueryForm` 捕获的 props：高级筛选的字段 children，整体渲染进筛选面板
   * （顶部条右区的筛选钮开合它）。缺席则不出现筛选钮。 */
  query?: { children: ReactNode };
  /** `t.Toolbar` 的内容，追加在内建「新建」按钮右侧。 */
  toolbar?: ReactNode;
  /** `t.BulkBar` 的内容，经顶部条批量态渲染；仅有选中行时出现。 */
  bulkBar?: ReactNode;
  /** `t.Utility` 的内容，并入顶部条右侧的功能图标组，排在视图设置之前。 */
  utility?: ReactNode;
}

// 必须导出。`useAbpTable` 的 `Table` 绑定成员把 `AbpTableView<TDto>` 的元素类型带进了自己的
// 推断返回类型，声明发出时要能给这个类型具名（tsconfig.base.json 开着 declaration + composite），
// 不导出会报 TS4058「cannot be named」。
export interface AbpTableViewProps<
  TDto extends { id?: string },
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> extends AbpTableViewOwnProps<TDto, TExtra> {
  t: AbpTableViewInstance<TDto, TExtra>;
  slots: AbpTableViewSlots;
}

/** `t.Table` 的渲染实现：在单张卡片里编排顶部条（搜索框 ⇄ 批量态 + 动作组）、
 *  高级筛选面板和表格。不公开导出，调用方只应经 `t.Table` 用它。 */
export function AbpTableView<
  TDto extends { id?: string },
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
>(props: AbpTableViewProps<TDto, TExtra>) {
  const L = useLocalization();
  const { t, slots, empty, skeletonRows, rowProps, renderSubRow, pageSizes, searchPlaceholder } =
    props;

  const [expanded, setExpanded] = useState(false);
  // 面板展开会让出搜索框，但展开那一刻已有关键字在生效时不能让：藏起来它仍在筛选，
  // 用户既看不到也清不掉。按展开瞬间锁定而不是实时跟随，否则在面板开着时把关键字删空，
  // 输入框会在自己手底下消失。
  const [searchKept, setSearchKept] = useState(false);
  const reactId = useId();
  const panelId = `${reactId}-query-panel`;

  const queryFields = slots.query ? flattenFields(slots.query.children) : [];
  const hasQuery = queryFields.length > 0;

  const toolbar = (
    <DataTableToolbar
      table={t}
      // 面板展开时让出搜索框：面板里是更精确的字段筛选，同屏再摆一个模糊搜索是重复入口。
      search={t.searchEnabled && (!expanded || searchKept)}
      searchPlaceholder={searchPlaceholder}
      // 这里再订阅一次是刻意的：顶部条那层 SelectedCount 只负责「左区该显示什么」，
      // 计数是批量条自己的数据。把数字从顶部条传下来会让「计数从哪来」重新耦合进
      // DataTableToolbar 的 props，而这一层的立意正是谁要计数谁自己订阅。
      bulk={
        <t.SelectedCount>
          {(count) => (
            <AbpBulkBarView selectedCount={count} onClear={t.clearSelection}>
              {slots.bulkBar}
            </AbpBulkBarView>
          )}
        </t.SelectedCount>
      }
      onRefresh={t.source.listQuery.refetch ? () => void t.source.listQuery.refetch?.() : undefined}
      refreshing={t.source.listQuery.isFetching}
      onExport={t.onExport}
      attention={t.activeQueryCount > 0 || isViewCustomized(t)}
      utilityLeading={
        hasQuery ? (
          <AbpQueryPanelToggle
            expanded={expanded}
            onToggle={() => {
              setSearchKept(t.state.params.filter !== "");
              setExpanded((value) => !value);
            }}
            panelId={panelId}
            activeCount={t.activeQueryCount}
          />
        ) : undefined
      }
      actions={
        <>
          {t.source.can.create && t.onOpen && (
            // 窄屏缩成只剩图标的 44px 方钮；文字留给读屏，名字不变。
            <Button
              type="button"
              size="sm"
              className="max-md:size-11 max-md:px-0"
              onClick={() => t.onOpen?.("create")}
            >
              <Plus />
              <span className="max-md:sr-only">{L("Crud:Create")}</span>
            </Button>
          )}
          {slots.toolbar}
        </>
      }
    >
      {slots.utility}
      <DataTableViewMenu table={t} pageSizes={pageSizes} />
    </DataTableToolbar>
  );

  const queryPanel =
    hasQuery && expanded ? (
      <AbpQueryPanelView
        fields={queryFields}
        onSubmit={() => void t.submitQuery()}
        onReset={() => t.resetQuery()}
        panelId={panelId}
      />
    ) : null;

  const { isError, refetch } = t.source.listQuery;
  const hasData = t.source.listQuery.data !== undefined;
  const retryButton = refetch ? (
    <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
      {L("Crud:Retry")}
    </Button>
  ) : null;

  // 首次取数就失败：表体换成报错，工具栏、查询面板和表头都留着。筛选值和搜索词是用户自己
  // 输入的，也最容易触发后端 400，一起吞掉等于把用户锁死在自己的输入里。
  const errorBody =
    isError && !hasData ? (
      <div role="alert" className="flex flex-col items-center gap-3 py-6">
        <p className="text-destructive">{L("Crud:OperationFailed")}</p>
        {retryButton}
      </div>
    ) : undefined;

  // 刷新失败但旧数据还在：旧数据仍是上一次的有效结果，留在原位并变淡，加一条提示。
  const staleBanner =
    isError && hasData ? (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm"
      >
        {/* 颜色挂在文字上而不是容器上：outline 按钮不自带前景色，会把容器的红继承过去。 */}
        <span className="inline-flex items-center gap-2 text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          {L("Table:RefreshFailed")}
        </span>
        {retryButton}
      </div>
    ) : null;

  const pageRowCount = t.source.listQuery.data?.items?.length ?? 0;
  const matchingCount = t.source.totalCount;
  const linkButtonClass = "h-auto p-0";
  // 跨页全选分两步：先是页内全选，再由用户明确点一下扩到全部匹配。直接把「全选」做成全部匹配，
  // 用户会在不知情时对没看过的行执行批量动作。
  const selectionStrip = t.allMatching ? (
    <div className="flex flex-wrap items-center gap-2 border-b bg-row-selected px-4 py-2 text-sm">
      {L("Table:AllMatchingSelected", matchingCount)}
      <Button
        type="button"
        variant="link"
        size="sm"
        className={linkButtonClass}
        onClick={t.clearSelection}
      >
        {L("Table:ClearSelection")}
      </Button>
    </div>
  ) : t.canSelectAllMatching && matchingCount > pageRowCount ? (
    <t.SelectedCount>
      {(count) =>
        // 这里的 count 在未进入「全部匹配」时就是页内选中数。
        pageRowCount > 0 && count === pageRowCount ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-row-selected px-4 py-2 text-sm">
            {L("Table:PageSelected", count)}
            <Button
              type="button"
              variant="link"
              size="sm"
              className={linkButtonClass}
              onClick={t.selectAllMatching}
            >
              {L("Table:SelectAllMatching", matchingCount)}
            </Button>
          </div>
        ) : null
      }
    </t.SelectedCount>
  ) : null;

  const keyword = t.state.params.filter;
  const summaryChip = (key: string, label: ReactNode, value: ReactNode, onRemove: () => void) => (
    <span
      key={key}
      className="inline-flex h-6 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 text-foreground text-xs"
    >
      {label}
      {L("Table:LabelSeparator")}
      {value}
      <button
        type="button"
        aria-label={L("Table:FilterRemove")}
        className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  );
  // 面板展开时字段本身就在眼前，摘要是重复信息；收起后它是唯一说明「筛了什么」的地方。
  // 有摘要行时把关键字也列进去，这样行尾的「全部清除」清掉的正是这一行列出来的全部。
  const summaryStrip =
    !expanded && t.querySummary.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-muted-foreground text-sm">
        {L("Table:FilteredBy")}
        {keyword !== "" &&
          summaryChip("keyword", L("Table:FilterKeyword"), keyword, () => t.state.commitSearch(""))}
        {t.querySummary.map((item) =>
          summaryChip(item.key, item.label, item.value, () => t.resetQueryField(item.key)),
        )}
        <Button
          type="button"
          variant="link"
          size="sm"
          className={linkButtonClass}
          onClick={t.clearFilters}
        >
          {L("Table:ClearAll")}
        </Button>
      </div>
    ) : null;

  const filtered = t.activeQueryCount > 0 || t.state.params.filter !== "";
  const filteredEmpty = filtered ? (
    <div className="flex flex-col items-center gap-3 py-6">
      <p>{L("Table:EmptyFiltered")}</p>
      {t.canClearFilters && (
        <Button type="button" variant="outline" size="sm" onClick={t.clearFilters}>
          {L("Table:ClearFilters")}
        </Button>
      )}
    </div>
  ) : undefined;

  // 默认 onOpen 存在时点行开详情；false 关闭；也可给自定义回调。
  const click = t.rowConfig?.click;
  const rowClickHandler =
    click === false
      ? undefined
      : (click ?? (t.onOpen ? (row: TDto) => t.onOpen?.("view", row) : undefined));

  return (
    <DataTable
      table={t}
      loading={t.source.listQuery.isPending}
      fetching={t.source.listQuery.isFetching && !t.source.listQuery.isPending}
      // 调用方给了空状态就整个听它的；没给时，筛选中的空表换一句话并给出清除出口，
      // 「本来就没数据」与「被筛没了」是两种处境。
      empty={empty ?? filteredEmpty}
      error={errorBody}
      skeletonRows={skeletonRows}
      rowProps={rowProps}
      renderSubRow={renderSubRow}
      stale={isError && hasData}
      onRowClick={rowClickHandler}
    >
      {toolbar}
      {staleBanner}
      {selectionStrip}
      {summaryStrip}
      {queryPanel}
    </DataTable>
  );
}
