import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";
import { OptionalMarks, ReadOnlyFields } from "@/components/form/form-hook";
import { SubmitButton } from "@/components/form/submit-button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type SheetFormMode = "create" | "edit" | "view";

export interface SheetFormProps {
  mode: SheetFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 记录标识或状态，例如「刘慈欣 · 2008-01-01」。只放能帮人确认「我在改哪一条」的信息——
   *  写「保存后可继续编辑」这类通用说明不如不写，它占一行而读者只看一次。 */
  subtitle?: string;
  onSubmit?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  pending?: boolean;
  /** 表单是否有未保存的改动。为真时，任何关闭动作都先过一道确认。 */
  dirty?: boolean;
  children: ReactNode;
}

/** 三态侧滑表单容器（对标 DrawerForm）。 */
export function SheetForm(props: SheetFormProps) {
  const L = useLocalization();
  const editable = props.mode !== "view";
  const [confirming, setConfirming] = useState(false);

  // 所有关闭路径都收敛到这里：Esc、右上角 ×、点遮罩、取消按钮。分散判断迟早漏掉一条，
  // 而「哪一条漏了」只有用户丢了数据才会发现。
  const requestClose = () => {
    if (props.dirty === true) {
      setConfirming(true);
      return;
    }
    props.onOpenChange(false);
  };

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => (next ? props.onOpenChange(true) : requestClose())}
    >
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        // Esc 自己兜一层，不依赖 Radix 的默认路径：焦点落在文本框里时浏览器会先消费掉这个键
        // （事件到达 document 时已 defaultPrevented），而表单一打开就自动聚焦第一个字段——
        // 于是模态最标准的退出键在实际使用中从来没生效过。
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          requestClose();
        }}
      >
        <SheetHeader className="gap-0 px-5 pt-5 pb-4 pr-12">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="truncate">{props.title}</SheetTitle>
            {!editable && props.canEdit === true && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={props.onEdit}
                className="shrink-0"
              >
                <Pencil />
                {L("Form:Edit")}
              </Button>
            )}
          </div>
          {props.subtitle !== undefined && (
            <SheetDescription className="mt-1">{props.subtitle}</SheetDescription>
          )}
        </SheetHeader>
        {/* form 自身不滚：滚动下移一层，否则底部操作栏会跟着字段一起滚出屏幕。 */}
        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit?.();
          }}
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
            {editable ? (
              // 录入表单里多数字段必填，所以标出选填的那一两个；查询表单反之，不开这个开关。
              <OptionalMarks>{props.children}</OptionalMarks>
            ) : (
              // 查看态借整页表单的容器语汇：一行一个字段、发丝线分隔、值右对齐排成一条竖线。
              // 一条记录于是读起来像「把一行表格竖过来」，而不是一排灰掉的输入框。
              <dl className="divide-y rounded-lg border bg-card">
                <ReadOnlyFields>{props.children}</ReadOnlyFields>
              </dl>
            )}
          </div>
          {editable && (
            // 单行右对齐、primary 最右，与整页表单同一套语法；取消用 ghost——它是退路，
            // 不是与保存并列的选项，不该也带一圈边框去争视觉重量。
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button type="button" variant="ghost" onClick={requestClose}>
                {L("Form:Cancel")}
              </Button>
              <SubmitButton pending={props.pending} />
            </div>
          )}
        </form>
      </SheetContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Form:DiscardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{L("Form:DiscardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Form:KeepEditing")}</AlertDialogCancel>
            {/* 丢弃已填内容是不可逆的，而红色在这套系统里正是留给不可逆动作的。 */}
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                props.onOpenChange(false);
              }}
            >
              {L("Form:Discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
