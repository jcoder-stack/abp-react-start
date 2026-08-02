import { useLocalization } from "@jcoder/abp-react/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { devWarn } from "@/components/data-table/dev-warn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface AbpBulkDeleteViewProps<TDto extends { id?: string }> {
  source: AbpTableSource<TDto>;
  selectedRows: TDto[];
  keepSelected: (ids: string[]) => void;
}

/**
 * 装配组件：`t.BulkDelete` 绑定成员的渲染实现：删除按钮 + 二次确认 + 整批成败汇总。
 * 模块级、不公开导出，调用方只应经 `t.BulkDelete` 使用。
 *
 * 删了几条、哪几条失败都由 `source.delete.many` 汇总回来，这里只负责把三种结局翻成一条 toast，
 * 并把失败的 id 交还给选择态。成功的行随列表刷新离场，失败的行留在勾选里供重试。
 */
export function AbpBulkDeleteView<TDto extends { id?: string }>(
  props: AbpBulkDeleteViewProps<TDto>,
) {
  const L = useLocalization();
  const [open, setOpen] = useState(false);
  const many = props.source.delete?.many;

  if (!props.source.can.delete) return null;
  if (many === undefined) {
    devWarn(
      "abp-table:bulk-delete-unsupported",
      "useAbpTable: t.BulkDelete 需要数据源提供 delete.many，当前 source 没有，按钮不渲染。",
    );
    return null;
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 />
          {L("Crud:Delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{L("Crud:DeleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{L("Crud:DeleteConfirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{L("Form:Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              // 无 id 的行进不了删除端点，先剔除，否则会被算进「成功」的分母，
              // 让一次什么都没删的操作报成功。
              const ids = props.selectedRows
                .map((row) => row.id)
                .filter((id): id is string => id !== undefined);
              try {
                const { failed } = await many(ids);
                if (failed.length === 0) toast.success(L("Crud:Deleted"));
                else if (failed.length === ids.length) toast.error(L("Crud:OperationFailed"));
                else
                  toast.warning(
                    L("Crud:BulkDeletePartialFailure", ids.length - failed.length, failed.length),
                  );
                props.keepSelected(failed);
              } finally {
                setOpen(false);
              }
            }}
          >
            {L("Crud:Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
