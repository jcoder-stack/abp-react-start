import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { RowData } from "@tanstack/react-table";
import { Download, EllipsisVertical, RefreshCw, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DataTableUtilityButton,
  UtilityMenuContext,
} from "@/components/data-table/data-table-utility-button";
import type { ExtraFeatureMap, NoExtraFeatures } from "@/components/data-table/table-core";
import type { DataTableInstance } from "@/components/data-table/use-data-table";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 400;

export interface DataTableToolbarProps<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
> {
  table: DataTableInstance<TData, TExtra>;
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
  /** 窄屏功能钮收进「更多」后，里面有东西不在默认状态（筛选生效、视图改过）时传 true，
   *  「更多」钮上给一个圆点——否则收起来就看不出还筛着。 */
  attention?: boolean;
  /** trailing 区：视图设置（`DataTableViewMenu`）等散件，并入右侧功能图标组。 */
  children?: ReactNode;
}

/** 表格卡片顶部条：左区三态（自定义内容/搜索框 ⇄ 批量操作），右区恒定
 * （actions │ utilityLeading · 刷新 · 导出 · trailing）。Enter 立即提交搜索。
 * 窄屏（`md` 以下）不折行：右区功能钮收进「更多」面板，trailing 里的钮用
 * `DataTableUtilityButton` 写就会跟着改画成菜单行。 */
export function DataTableToolbar<
  TData extends RowData,
  TExtra extends ExtraFeatureMap = NoExtraFeatures,
>(props: DataTableToolbarProps<TData, TExtra>) {
  const L = useLocalization();
  const { state, SelectedCount } = props.table;
  const showSearch = props.search ?? true;

  // 即时值持有在组件本体而非条件子树：批量态会把整个左区换成 props.bulk，
  // 若把这份 state 放进搜索框所在的三元分支，批量态一进一出输入内容就丢了。
  // 以已提交的搜索值起步：深链预填时输入框要显示它，而不是空着却在筛选。
  const [searchInput, setSearchInput] = useState(state.params.filter);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const committedFilter = state.params.filter;
  // 本工具条自己提交过的最新值。已提交值与它不同，说明是外部改的（空态的「清除筛选」等），
  // 输入框要跟上；相同则是自己那次提交的回声，此时用户可能已经又敲了几个字，不能回写。
  const ownCommit = useRef(committedFilter);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (committedFilter === ownCommit.current) return;
    ownCommit.current = committedFilter;
    clearTimeout(timer.current);
    setSearchInput(committedFilter);
  }, [committedFilter]);

  const commitSearch = (value: string) => {
    ownCommit.current = value;
    state.commitSearch(value);
  };

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitSearch(value), SEARCH_DEBOUNCE_MS);
  };

  const [moreOpen, setMoreOpen] = useState(false);
  const utilityMenu = useMemo(() => ({ close: () => setMoreOpen(false) }), []);

  const flushSearch = () => {
    clearTimeout(timer.current);
    commitSearch(searchInput);
  };

  const idle =
    props.left ??
    (showSearch ? (
      <InputGroup className="h-8 w-56 max-md:h-11 max-md:w-auto max-md:min-w-0 max-md:flex-1">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={searchInput}
          placeholder={props.searchPlaceholder ?? L("Table:Search")}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && flushSearch()}
        />
        {searchInput !== "" && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={L("Table:SearchClear")}
              // 清空是一次明确的提交，不走防抖：点了却要等 400ms 才见结果，会被当成没点上。
              onClick={() => {
                clearTimeout(timer.current);
                setSearchInput("");
                commitSearch("");
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    ) : null);

  // 只有在给了 bulk 内容时才订阅选中态：没有批量内容的表，左区恒定，多挂一个订阅者没有意义。
  const left =
    props.bulk === undefined ? (
      idle
    ) : (
      <SelectedCount>{(count) => (count > 0 ? props.bulk : idle)}</SelectedCount>
    );

  const utilities = (
    <>
      {props.utilityLeading}
      {props.onRefresh && (
        <DataTableUtilityButton label={L("Table:Refresh")} onClick={props.onRefresh}>
          <RefreshCw className={cn(props.refreshing && "animate-spin")} />
        </DataTableUtilityButton>
      )}
      {props.onExport && (
        <DataTableUtilityButton label={L("Table:Export")} onClick={props.onExport}>
          <Download />
        </DataTableUtilityButton>
      )}
      {props.children}
    </>
  );
  const hasUtilities = Boolean(
    props.utilityLeading || props.onRefresh || props.onExport || props.children,
  );

  return (
    // 窄屏不折行：折成两行的工具栏把表格往下推一整行，而表格才是这一屏的正事。
    // 改成搜索框吃掉剩余宽度、功能钮收进「更多」，点击区一并放到 44px。
    <div className="flex items-center gap-2 border-b px-4 py-2 max-md:px-3 md:flex-wrap">
      {left}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {props.actions}
        {props.actions ? (
          <Separator orientation="vertical" className="mx-1 !h-5 max-md:hidden" />
        ) : null}
        <div className="flex items-center gap-1 max-md:hidden">{utilities}</div>
        {hasUtilities && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-11 text-muted-foreground md:hidden"
                aria-label={L("Table:More")}
              >
                <EllipsisVertical />
                {props.attention && (
                  <span
                    aria-hidden="true"
                    className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-primary"
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="grid w-48 p-1">
              <UtilityMenuContext value={utilityMenu}>{utilities}</UtilityMenuContext>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
