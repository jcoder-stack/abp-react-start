import { useLocalization } from "@jcoder-stack/abp-react/react";
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
  /** 确认时才取选中行：选中态归表所有，渲染期读到的快照会陈旧。 */
  getSelectedRows: () => TDto[];
  keepSelected: (ids: string[]) => void;
  /** 同 `row.canDelete`：返回 false 的选中行不发删除请求，计入跳过。 */
  canDelete?: (row: TDto) => boolean;
}

/** 选中行拆成要删的 id 与跳过的行数。无 id 的行进不了删除端点，既不删也不算跳过——
 *  否则会被算进「成功」的分母，让一次什么都没删的操作报成功。 */
export function partitionDeletable<TDto extends { id?: string }>(
  rows: TDto[],
  canDelete?: (row: TDto) => boolean,
): { ids: string[]; skipped: number } {
  const ids: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.id === undefined) continue;
    if (canDelete?.(row) ?? true) ids.push(row.id);
    else skipped++;
  }
  return { ids, skipped };
}

export interface BulkDeleteNotice {
  kind: "success" | "warning" | "error";
  key: string;
  args: number[];
  /** 失败条目的后端理由，逐行一条。只说「N 项失败」用户不知道该去解除哪条引用。 */
  description?: string;
}

/** 整批结局翻成一条提示。有跳过就不能报纯成功：用户勾了 N 条，只删掉一部分却看到「已删除」会以为全删了。 */
export function bulkDeleteNotice(
  requested: number,
  failed: number,
  skipped: number,
  reasons: readonly string[] = [],
): BulkDeleteNotice {
  const notice = bulkDeleteOutcome(requested, failed, skipped);
  return failed > 0 && reasons.length > 0 ? { ...notice, description: reasons.join("\n") } : notice;
}

function bulkDeleteOutcome(requested: number, failed: number, skipped: number): BulkDeleteNotice {
  const deleted = requested - failed;
  if (requested === 0 && skipped > 0)
    return { kind: "error", key: "Crud:BulkDeleteNoneDeletable", args: [skipped] };
  if (skipped > 0)
    return {
      kind: deleted === 0 ? "error" : "warning",
      key: "Crud:BulkDeleteSkipped",
      args: [deleted, failed, skipped],
    };
  if (failed === 0) return { kind: "success", key: "Crud:Deleted", args: [] };
  if (deleted === 0) return { kind: "error", key: "Crud:OperationFailed", args: [] };
  return { kind: "warning", key: "Crud:BulkDeletePartialFailure", args: [deleted, failed] };
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
              const { ids, skipped } = partitionDeletable(props.getSelectedRows(), props.canDelete);
              try {
                const { failed, reasons } = ids.length > 0 ? await many(ids) : { failed: [] };
                const notice = bulkDeleteNotice(ids.length, failed.length, skipped, reasons);
                const message = L(notice.key, ...notice.args);
                if (notice.description === undefined) toast[notice.kind](message);
                else
                  toast[notice.kind](message, {
                    description: <span className="whitespace-pre-line">{notice.description}</span>,
                  });
                // 跳过的行不留在勾选里：它们重试也删不掉，留着只会让下一次批量删除再报一遍跳过
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
