import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Plus } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { AbpBulkBarView } from "@/components/abp/table/abp-bulk-bar";
import {
  AbpQueryPanelToggle,
  AbpQueryPanelView,
  flattenFields,
} from "@/components/abp/table/abp-query-form";
import type { AbpTableRowConfig } from "@/components/abp/table/use-abp-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnsMenu } from "@/components/data-table/data-table-columns-menu";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { FormErrorSummary } from "@/components/form/form-error-summary";
import { Button } from "@/components/ui/button";

/** `t.Table` 的表现层 props：不受管的 `DataTable` 透传项，缺省全部走内建默认。 */
export interface AbpTableViewOwnProps<TDto> {
  empty?: ReactNode;
  skeletonRows?: number | "pageSize";
  rowProps?: (row: TDto) => { className?: string };
  pageSizes?: number[];
  searchPlaceholder?: string;
}

/** `AbpTableView` 消费的实例面：`useDataTable` 全量 + `useAbpTable` 的数据侧接线。
 *  不含五个绑定成员，那些正是靠本组件渲染出来的，反过来要求实例已经带着会是循环依赖。 */
export interface AbpTableViewInstance<TDto extends { id?: string }>
  extends DataTableInstance<TDto> {
  source: AbpTableSource<TDto>;
  rowConfig?: AbpTableRowConfig<TDto>;
  onOpen?: (mode: "create" | "edit" | "view", record?: TDto) => void;
  searchEnabled: boolean;
  submitQuery: () => Promise<void>;
  resetQuery: () => void;
  /** 当前已提交的筛选项数，驱动筛选钮上的"还筛着"圆点。 */
  activeQueryCount: number;
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
}

// 必须导出。`useAbpTable` 的 `Table` 绑定成员把 `AbpTableView<TDto>` 的元素类型带进了自己的
// 推断返回类型，声明发出时要能给这个类型具名（tsconfig.base.json 开着 declaration + composite），
// 不导出会报 TS4058「cannot be named」。
export interface AbpTableViewProps<TDto extends { id?: string }>
  extends AbpTableViewOwnProps<TDto> {
  t: AbpTableViewInstance<TDto>;
  slots: AbpTableViewSlots;
}

/** `t.Table` 的渲染实现：在单张卡片里编排顶部条（搜索框 ⇄ 批量态 + 动作组）、
 *  高级筛选面板和表格。不公开导出，调用方只应经 `t.Table` 用它。 */
export function AbpTableView<TDto extends { id?: string }>(props: AbpTableViewProps<TDto>) {
  const L = useLocalization();
  const { t, slots, empty, skeletonRows, rowProps, pageSizes, searchPlaceholder } = props;

  const [expanded, setExpanded] = useState(false);
  const reactId = useId();
  const panelId = `${reactId}-query-panel`;

  const queryFields = slots.query ? flattenFields(slots.query.children) : [];
  const hasQuery = queryFields.length > 0;

  const toolbar = (
    <DataTableToolbar
      table={t}
      // 面板展开时让出搜索框：面板里是更精确的字段筛选，同屏再摆一个模糊搜索是重复入口。
      search={t.searchEnabled && !expanded}
      searchPlaceholder={searchPlaceholder}
      bulk={
        <AbpBulkBarView
          selectedCount={t.selectedRows.length}
          onClear={() => t.state.clearSelection()}
        >
          {slots.bulkBar}
        </AbpBulkBarView>
      }
      onRefresh={t.source.listQuery.refetch ? () => void t.source.listQuery.refetch?.() : undefined}
      refreshing={t.source.listQuery.isFetching}
      onExport={t.onExport}
      utilityLeading={
        hasQuery ? (
          <AbpQueryPanelToggle
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            panelId={panelId}
            activeCount={t.activeQueryCount}
          />
        ) : undefined
      }
      actions={
        <>
          {t.source.can.create && t.onOpen && (
            <Button type="button" size="sm" onClick={() => t.onOpen?.("create")}>
              <Plus />
              {L("Crud:Create")}
            </Button>
          )}
          {slots.toolbar}
        </>
      }
    >
      <DataTableColumnsMenu table={t} />
    </DataTableToolbar>
  );

  const renderQueryPanel = (last: boolean) =>
    hasQuery && expanded ? (
      <AbpQueryPanelView
        fields={queryFields}
        onSubmit={() => void t.submitQuery()}
        onReset={() => t.resetQuery()}
        panelId={panelId}
        last={last}
      />
    ) : null;

  if (t.source.listQuery.isError) {
    // 查询区和搜索框要留在报错态里。筛选值和搜索词是用户自己输入的，也最容易触发后端 400，
    // 一起吞掉就等于把用户锁死在自己的输入里，只能整页刷新。顶部条跟非报错态共用同一个
    // `toolbar`，报错态没有表格托底，包一层卡片容器撑住外观。
    return (
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-md border bg-card">
          {toolbar}
          {renderQueryPanel(true)}
        </div>
        <FormErrorSummary errors={[L("Crud:OperationFailed")]} />
        {t.source.listQuery.refetch && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => t.source.listQuery.refetch?.()}
          >
            {L("Crud:Retry")}
          </Button>
        )}
      </div>
    );
  }

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
      empty={empty}
      skeletonRows={skeletonRows}
      rowProps={rowProps}
      pageSizes={pageSizes}
      onRowClick={rowClickHandler}
    >
      {toolbar}
      {renderQueryPanel(false)}
    </DataTable>
  );
}
