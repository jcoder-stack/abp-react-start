import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { CellTableInstance } from "@/components/data-table/table-core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RowActionsMenuSource {
  can: { update: boolean; delete: boolean };
  /** 只读数据源（无删除能力）时这个键不存在；删除项即使 `show.delete` 为真也不会渲染。 */
  delete?: { mutate: (id: string) => void };
}

/** `renderRowActions` 收到的内置行操作零件。公理：三个成员一律「元素 | undefined」，undefined
 * 当且仅当该能力未启用（`rowMenu.view`/`edit`/`delete` 判定为 false，或无权限/无 `onOpen`）。
 * 所以 `builtins.x ?? 兜底` 永远可用，不会有「渲染成 null 的元素」把兜底短路掉。 */
export interface RowActionBuiltins {
  view?: ReactNode;
  edit?: ReactNode;
  delete?: ReactNode;
}

export interface RowActionsMenuProps<TDto extends { id?: string }> {
  record: TDto;
  table: CellTableInstance<TDto>;
  onOpen?: (mode: "create" | "edit" | "view", record?: TDto) => void;
  source: RowActionsMenuSource;
  rowActions?: (row: TDto, table: CellTableInstance<TDto>) => ReactNode;
  show: { view: boolean; edit: boolean; delete: boolean };
  items?: (row: TDto, table: CellTableInstance<TDto>) => ReactNode;
  render?: (row: TDto, builtins: RowActionBuiltins, table: CellTableInstance<TDto>) => ReactNode;
}

/** 行操作合并为 `···` 菜单；删除确认用受控 AlertDialog，脱出 DropdownMenu 之外。
 *  二者嵌套时 DropdownMenu 卸载会连带把内嵌 AlertDialogContent 一并卸掉。 */
export function RowActionsMenu<TDto extends { id?: string }>(props: RowActionsMenuProps<TDto>) {
  const L = useLocalization();
  const { record, table, onOpen, source, rowActions, show } = props;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const viewItem = show.view ? (
    <DropdownMenuItem key="view" onClick={() => onOpen?.("view", record)}>
      <Eye />
      {L("Table:View")}
    </DropdownMenuItem>
  ) : undefined;
  const editItem = show.edit ? (
    <DropdownMenuItem key="edit" onClick={() => onOpen?.("edit", record)}>
      <Pencil />
      {L("Form:Edit")}
    </DropdownMenuItem>
  ) : undefined;
  // 无删除能力（source.delete undefined）时不渲染删除项。即使 show.delete 因调用方失误传了
  // true，也不会露出一个点了什么都不发生的按钮。
  const deleteItem =
    show.delete && source.delete ? (
      <DropdownMenuItem
        key="delete"
        variant="destructive"
        onSelect={(e) => {
          e.preventDefault();
          setConfirmOpen(true);
        }}
      >
        <Trash2 />
        {L("Crud:Delete")}
      </DropdownMenuItem>
    ) : undefined;

  const extraItems = props.render ? undefined : props.items?.(record, table);
  const hasMenu = Boolean(viewItem || editItem || deleteItem || extraItems);

  const menuContent = props.render ? (
    props.render(record, { view: viewItem, edit: editItem, delete: deleteItem }, table)
  ) : hasMenu ? (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={L("Table:Actions")}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {viewItem}
        {editItem}
        {deleteItem}
        {extraItems}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 仅拦截冒泡以防触发行点击详情，非交互元素
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {rowActions?.(record, table)}
      {menuContent && (
        <span className="opacity-0 focus-within:opacity-100 group-hover:opacity-100">
          {menuContent}
        </span>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Crud:DeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{L("Crud:DeleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Form:Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => record.id && source.delete?.mutate(record.id)}>
              {L("Crud:Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
