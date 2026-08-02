import { useLocalization } from "@jcoder-stack/abp-react/react";
import { ListFilter } from "lucide-react";
import { Children, Fragment, isValidElement, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** `Children.toArray` 不拆 fragment（`<>a b</>` 整体算一个子节点），必须先取出
 * fragment 的 `props.children` 再切；非 fragment 的单个子节点按长度 1 处理。 */
export function flattenFields(children: ReactNode): ReactNode[] {
  const inner =
    isValidElement<{ children?: ReactNode }>(children) && children.type === Fragment
      ? children.props.children
      : children;
  return Children.toArray(inner);
}

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

export interface AbpQueryPanelToggleProps {
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
  /** 当前生效的筛选项数。> 0 时图标带一个圆点，面板收起后用户否则不知道还筛着。 */
  activeCount: number;
}

/** 高级筛选面板的开合钮，住在顶部条右区的功能组。那里不随左区（搜索框 ⇄ 批量操作）变化，
 *  所以面板开着时勾选行，也仍然收得回来。不公开导出。 */
export function AbpQueryPanelToggle(props: AbpQueryPanelToggleProps) {
  const L = useLocalization();
  const active = props.activeCount > 0;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "relative",
        props.expanded || active ? "text-primary" : "text-muted-foreground",
      )}
      aria-label={L("Table:Filter")}
      aria-expanded={props.expanded}
      aria-controls={props.expanded ? props.panelId : undefined}
      onClick={props.onToggle}
    >
      <ListFilter />
      {active && (
        // 圆点只是"还筛着"的视觉提示，具体筛了什么展开面板即见；读屏另有 sr-only 文本，
        // 不靠颜色/形状单独传达状态。
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
        />
      )}
      {active && <span className="sr-only">{L("Table:FilterActive", props.activeCount)}</span>}
    </Button>
  );
}

export interface AbpQueryPanelViewProps {
  fields: ReactNode[];
  onSubmit: () => void;
  onReset: () => void;
  panelId: string;
  /** 面板是卡片里最后一段时（报错态没有表格托底）收窄下内边距，底下没有表格要隔开了。 */
  last?: boolean;
}

/** 高级筛选面板：带标签的字段网格 + 底部「重置 / 查询」按钮行，渲染在顶部条与表头之间，
 *  收起时整块从 DOM 卸载。查询按钮用 secondary，同卡片里的 primary 只留给「新增」。
 *  不公开导出。 */
export function AbpQueryPanelView(props: AbpQueryPanelViewProps) {
  const L = useLocalization();
  return (
    <fieldset
      id={props.panelId}
      // 不画下边框、改留一段白：边框紧贴表头的 muted 色带会让面板读成表格的一部分，
      // 而它是临时打开的层。留白之后表头色块自然成为表格块的起点。
      className={cn("px-4 pt-4", props.last ? "pb-4" : "pb-5")}
      onKeyDown={submitOnEnter(props.onSubmit)}
    >
      <legend className="sr-only">{L("Table:Query")}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{props.fields}</div>
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
