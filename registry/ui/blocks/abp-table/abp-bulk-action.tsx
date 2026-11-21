import { useLocalization } from "@jcoder-stack/abp-react/react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { abpErrorMessage } from "@/components/abp/crud/abp-form-errors";
import { type BulkNoticeKeys, bulkNotice } from "@/components/abp/table/abp-bulk-delete";
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
import { cn } from "@/lib/utils";

const BULK_ACTION_KEYS: BulkNoticeKeys = {
  done: "Crud:BulkDone",
  partialFailure: "Crud:BulkPartialFailure",
  skipped: "Crud:BulkSkipped",
  noneApplicable: "Crud:BulkNoneApplicable",
};

/** `t.BulkAction` 的 props。 */
export interface AbpBulkActionProps<TDto extends { id?: string }> {
  /** 按钮文字，已翻译。 */
  label: ReactNode;
  icon?: ReactNode;
  /** 对一行执行动作，失败就抛错（或返回 rejected promise）。逐行顺序调用，不并发：
   *  ABP 的写操作常连带关联更新，并发提交容易撞上后端的并发保护，被误算成「这条办不了」。
   *  不要在里面弹提示或失效列表，整批结束后这里统一给一条提示并重取一次。 */
  run: (row: TDto) => Promise<unknown>;
  /** 返回 false 的选中行不执行，计入「跳过」（如对已启用的行点「启用」）。 */
  canRun?: (row: TDto) => boolean;
  /** 给了就先弹确认框；不给则点击即执行。不可撤销的动作必须给。 */
  confirm?: { title: ReactNode; description?: ReactNode };
  /** 危险动作：按钮用 destructive 色。 */
  destructive?: boolean;
}

export interface AbpBulkActionViewProps<TDto extends { id?: string }>
  extends AbpBulkActionProps<TDto> {
  /** 执行时才取选中行：选中态归表所有，渲染期读到的快照会陈旧。 */
  getSelectedRows: () => TDto[];
  keepSelected: (ids: string[]) => void;
  /** 整批结束后重取列表。 */
  refetch?: () => void;
}

/**
 * 装配组件：`t.BulkAction` 绑定成员的渲染实现。把批量删除那套「逐条执行、汇总成一条提示、
 * 失败的行留在勾选里供重试」的反馈开放给任意批量动作（启用、停用、归档…）。
 * 不公开导出，调用方只应经 `t.BulkAction` 使用。
 */
export function AbpBulkActionView<TDto extends { id?: string }>(
  props: AbpBulkActionViewProps<TDto>,
) {
  const L = useLocalization();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  const execute = async () => {
    setRunning(true);
    try {
      const failed: string[] = [];
      const reasons = new Set<string>();
      let requested = 0;
      let skipped = 0;
      for (const row of props.getSelectedRows()) {
        // 无 id 的行失败后没法留在勾选里供重试，与判定为不适用的行一样计入跳过。
        if (row.id === undefined || !(props.canRun?.(row) ?? true)) {
          skipped++;
          continue;
        }
        requested++;
        try {
          await props.run(row);
        } catch (error) {
          failed.push(row.id);
          const reason = abpErrorMessage(error);
          if (reason !== undefined) reasons.add(reason);
        }
      }
      const notice = bulkNotice(BULK_ACTION_KEYS, requested, failed.length, skipped, [...reasons]);
      const message = L(notice.key, ...notice.args);
      if (notice.description === undefined) toast[notice.kind](message);
      else
        toast[notice.kind](message, {
          description: <span className="whitespace-pre-line">{notice.description}</span>,
        });
      props.keepSelected(failed);
      if (requested > failed.length) props.refetch?.();
    } finally {
      setRunning(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={running}
        className={cn(props.destructive && "text-destructive hover:text-destructive")}
        onClick={() => (props.confirm ? setConfirming(true) : void execute())}
      >
        {props.icon}
        {props.label}
      </Button>
      {props.confirm && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{props.confirm.title}</AlertDialogTitle>
              {props.confirm.description && (
                <AlertDialogDescription>{props.confirm.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{L("Form:Cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void execute()}>{props.label}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
