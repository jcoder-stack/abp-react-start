import { useLocalization } from "@jcoder-stack/abp-react/react";
import { ListFilter, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { DataTableUtilityButton } from "@/components/data-table/data-table-utility-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 面板不是原生 `<form>`：它住在表格卡片内部，同卡片里的「新增」等按钮会误触 submit。
 *  Enter 提交改成字段区的键盘监听，只认 INPUT 上未被上游消费、也不在 IME 组字中的 Enter。
 *  `defaultPrevented` 挡掉 combobox 这类「Enter 表示选中」的字段从 Portal 冒泡回来的事件，
 *  `isComposing` 挡掉中文拼音上屏的那次 Enter。 */
function submitOnEnter(onSubmit: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") return;
    if (event.defaultPrevented) return;
    if (event.nativeEvent.isComposing) return;
    if ((event.target as HTMLElement).tagName !== "INPUT") return;
    event.preventDefault();
    onSubmit();
  };
}

export interface DataTableFilterToggleProps {
  expanded: boolean;
  onToggle: () => void;
  /** 面板的 id，展开时挂到 `aria-controls`。与 `DataTableFilterPanel` 的 `panelId` 同值。 */
  panelId: string;
  /** 当前生效的筛选项数。> 0 时图标带一个圆点，面板收起后用户否则不知道还筛着。 */
  activeCount: number;
}

/** 筛选面板的开合钮，放进 `DataTableToolbar` 的 `utilityLeading`。那里不随左区
 *  （搜索框 ⇄ 批量操作）变化，所以面板开着时勾选行，也仍然收得回来。 */
export function DataTableFilterToggle(props: DataTableFilterToggleProps) {
  const L = useLocalization();
  const active = props.activeCount > 0;
  return (
    <DataTableUtilityButton
      label={L("Table:Filter")}
      // 圆点只是"还筛着"的视觉提示，具体筛了什么展开面板即见；读屏另有 sr-only 文本，
      // 不靠颜色/形状单独传达状态。
      dot={active}
      className={cn((props.expanded || active) && "text-primary")}
      aria-expanded={props.expanded}
      aria-controls={props.expanded ? props.panelId : undefined}
      onClick={props.onToggle}
    >
      <ListFilter />
      {active && <span className="sr-only">{L("Table:FilterActive", props.activeCount)}</span>}
    </DataTableUtilityButton>
  );
}

export interface DataTableFilterPanelProps {
  panelId: string;
  onSubmit: () => void;
  onReset: () => void;
  /** 带标签的筛选字段，一个字段一个子节点，铺成响应式网格。字段怎么绑、值怎么变成请求参数
   *  由调用方决定，面板只管排布与提交。 */
  children: ReactNode;
}

/** 筛选面板：字段网格 + 底部「重置 / 查询」按钮行。作为 `DataTable` 的子节点放在工具栏
 *  之后，收起时整块卸载。查询按钮用 secondary，同卡片里的 primary 只留给「新增」。 */
export function DataTableFilterPanel(props: DataTableFilterPanelProps) {
  const L = useLocalization();
  return (
    <fieldset
      id={props.panelId}
      // 不画下边框、改留一段白：边框紧贴表头的 muted 色带会让面板读成表格的一部分，
      // 而它是临时打开的层。留白之后表头色块自然成为表格块的起点。
      className="px-4 pt-4 pb-5"
      onKeyDown={submitOnEnter(props.onSubmit)}
    >
      <legend className="sr-only">{L("Table:Query")}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{props.children}</div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onReset}>
          {L("Table:Reset")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={props.onSubmit}>
          {L("Table:Query")}
        </Button>
      </div>
    </fieldset>
  );
}

export interface DataTableFilterChip {
  key: string;
  /** 字段名，已翻译。 */
  label: ReactNode;
  /** 给人看的已生效值。 */
  value: ReactNode;
  onRemove: () => void;
}

export interface DataTableFilterChipsProps {
  chips: DataTableFilterChip[];
  /** 行尾「全部清除」；缺席不渲染。它清掉的应当正是这一行列出来的全部。 */
  onClearAll?: () => void;
}

/** 已生效筛选条件的摘要行：每个条件一枚可单独移除的标签。面板收起后它是唯一说明「筛了什么」
 *  的地方；面板展开时字段本身就在眼前，调用方应当不渲染它。没有条件时渲染 null。 */
export function DataTableFilterChips(props: DataTableFilterChipsProps) {
  const L = useLocalization();
  if (props.chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-muted-foreground text-sm">
      {L("Table:FilteredBy")}
      {props.chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 text-foreground text-xs"
        >
          {chip.label}
          {L("Table:LabelSeparator")}
          {chip.value}
          <button
            type="button"
            aria-label={L("Table:FilterRemove")}
            className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={chip.onRemove}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {props.onClearAll && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={props.onClearAll}
        >
          {L("Table:ClearAll")}
        </Button>
      )}
    </div>
  );
}
