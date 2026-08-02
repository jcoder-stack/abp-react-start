import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { RowData } from "@tanstack/react-table";
import { Download, RefreshCw, Rows3 } from "lucide-react";
import type { ReactNode } from "react";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** 顶部条功能图标钮的共同外观：ghost 32px 方钮、静态色比正文更轻，hover 才提亮。 */
const UTILITY_ICON_CLASS = "size-8 text-muted-foreground";

export interface DataTableToolbarProps<TData extends RowData> {
  table: DataTableInstance<TData>;
  /** 是否渲染内建搜索框；缺省 true。传了 `left` 时搜索框让位。 */
  search?: boolean;
  searchPlaceholder?: string;
  /** 左区自定义内容（如内联查询字段）；提供时替代内建搜索框。 */
  left?: ReactNode;
  /** 有选中行时替换整个左区的批量操作内容；缺席则选中时左区维持原样。 */
  bulk?: ReactNode;
  /** 刷新回调；缺席不渲染刷新按钮。`refreshing` 为 true 时图标旋转。 */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 导出插槽；缺席不渲染导出按钮，组件库不内置导出实现。 */
  onExport?: () => void;
  /** 页面级动作（如「新增」），primary 归它；与右侧功能图标组之间以竖线分隔。 */
  actions?: ReactNode;
  /** 功能区最前的散件（如查询面板开合钮），排在刷新之前，与「改表格外观」的那几个分开。 */
  utilityLeading?: ReactNode;
  /** trailing 区：列显隐菜单等散件，并入右侧功能图标组。 */
  children?: ReactNode;
}

/** 表格卡片顶部条：左区三态（自定义内容/搜索框 ⇄ 批量操作），右区恒定
 * （actions │ utilityLeading · 刷新 · 导出 · 密度 · trailing）。Enter 立即提交搜索。 */
export function DataTableToolbar<TData extends RowData>(props: DataTableToolbarProps<TData>) {
  const L = useLocalization();
  const { state } = props.table;
  const showSearch = props.search ?? true;
  const bulkActive = props.bulk !== undefined && props.table.selectedRows.length > 0;

  const left = bulkActive
    ? props.bulk
    : (props.left ??
      (showSearch ? (
        <Input
          className="h-8 w-56"
          value={state.searchInput}
          placeholder={props.searchPlaceholder ?? L("Table:Search")}
          onChange={(e) => state.setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && state.flushSearch()}
        />
      ) : null));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      {left}
      <div className="ml-auto flex items-center gap-2">
        {props.actions}
        {props.actions ? <Separator orientation="vertical" className="mx-1 !h-5" /> : null}
        <div className="flex items-center gap-1">
          {props.utilityLeading}
          {props.onRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={UTILITY_ICON_CLASS}
              aria-label={L("Table:Refresh")}
              onClick={props.onRefresh}
            >
              <RefreshCw className={cn(props.refreshing && "animate-spin")} />
            </Button>
          )}
          {props.onExport && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={UTILITY_ICON_CLASS}
              aria-label={L("Table:Export")}
              onClick={props.onExport}
            >
              <Download />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={UTILITY_ICON_CLASS}
                aria-label={L("Table:Density")}
              >
                <Rows3 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={state.density}
                onValueChange={(value) => {
                  // 收窄而非断言：菜单项之外的值（将来加档位忘了同步这里）宁可无声忽略，
                  // 也不要把非法字符串塞进状态机。
                  if (value === "comfortable" || value === "compact") state.setDensity(value);
                }}
              >
                <DropdownMenuRadioItem value="comfortable">
                  {L("Table:DensityComfortable")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">
                  {L("Table:DensityCompact")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {props.children}
        </div>
      </div>
    </div>
  );
}
