import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
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

/** 查看态底栏左端的删除。成功/失败提示与列表失效由传进来的 `remove`（`t.source.delete.mutate`）
 *  负责，这里只管二次确认，确认后关掉抽屉：留着它就是在看一条正在被删掉的记录。 */
export function BookDeleteButton(props: {
  id: string;
  remove: (id: string) => void;
  onDeleted: () => void;
}) {
  const L = useLocalization();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
        {L("Crud:Delete")}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Crud:DeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{L("App::BookDeleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Form:Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                props.remove(props.id);
                props.onDeleted();
              }}
            >
              {L("Crud:Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
