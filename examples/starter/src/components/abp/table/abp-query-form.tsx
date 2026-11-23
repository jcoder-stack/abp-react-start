import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  DataTableFilterPanel,
  DataTableFilterToggle,
  type DataTableFilterToggleProps,
} from "@/components/data-table/data-table-filter";

/** `Children.toArray` 不拆 fragment（`<>a b</>` 整体算一个子节点），必须先取出
 * fragment 的 `props.children` 再切；非 fragment 的单个子节点按长度 1 处理。 */
export function flattenFields(children: ReactNode): ReactNode[] {
  const inner =
    isValidElement<{ children?: ReactNode }>(children) && children.type === Fragment
      ? children.props.children
      : children;
  return Children.toArray(inner);
}

/** @deprecated 用 data-table 块的 `DataTableFilterToggle`，props 相同。下一个大版本删除。 */
export const AbpQueryPanelToggle = DataTableFilterToggle;
/** @deprecated 用 `DataTableFilterToggleProps`。 */
export type AbpQueryPanelToggleProps = DataTableFilterToggleProps;

/** @deprecated 用 `DataTableFilterPanelProps`；字段改作 children 传入。 */
export interface AbpQueryPanelViewProps {
  fields: ReactNode[];
  onSubmit: () => void;
  onReset: () => void;
  panelId: string;
}

/** @deprecated 用 data-table 块的 `DataTableFilterPanel`，字段改作 children 传入。下一个大版本删除。 */
export function AbpQueryPanelView({ fields, ...props }: AbpQueryPanelViewProps) {
  return <DataTableFilterPanel {...props}>{fields}</DataTableFilterPanel>;
}
