import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Pencil, XIcon } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type SheetFormMode = "create" | "edit" | "view";

/**
 * 抽屉宽度档位。SheetForm 与手写的 `SheetContent` 共用这一份，页面里不直接写 `max-w`：
 * 宽度一旦散落在各页，换一次档位就要逐页找。
 *
 * `sm` 是配置类表单的常规宽度；`md` 给字段略多的录入；`lg` 给需要一张小表或明细列表的抽屉；
 * `xl` 留给要并排看表单与预览的页。
 */
export type SheetFormSize = "sm" | "md" | "lg" | "xl";

export const SHEET_SIZE_CLASS: Record<SheetFormSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-5xl",
};

/** `SheetForm` 的命令式出口：让抽屉之外的代码（如 `useAbpSheet`）也走同一道未保存确认，
 *  以及在「保存并继续新建」后把焦点放回第一个字段。 */
export interface SheetFormHandle {
  requestClose: () => void;
  focusFirstField: () => void;
}

export interface SheetFormProps {
  mode: SheetFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 记录标识或状态，例如「刘慈欣 · 2008-01-01」。只放能帮人确认「我在改哪一条」的信息——
   *  写「保存后可继续编辑」这类通用说明不如不写，它占一行而读者只看一次。 */
  subtitle?: string;
  onSubmit?: () => void;
  /** 给了就在新建态的底栏多一个「保存并继续新建」：连续录入时不用每条都重新打开抽屉。 */
  onSubmitAndContinue?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  pending?: boolean;
  /** 记录还在加载（打开前要预取关联数据）。抽屉先滑出、显示骨架，不让点击之后毫无反应。 */
  loading?: boolean;
  /** 表单是否有未保存的改动。为真时，任何关闭动作都先过一道确认。 */
  dirty?: boolean;
  /** 给了就表示这次编辑是从查看态进来的：取消与 Esc 回到查看态（有改动先确认），
   *  只有右上角 × 和点遮罩才关掉整个抽屉。 */
  onBack?: () => void;
  /** 透传给 `SheetContent`，用来在关闭后把焦点还给打开者。 */
  onCloseAutoFocus?: (event: Event) => void;
  /** 抽屉宽度，默认 `sm`。见 `SheetFormSize`。 */
  size?: SheetFormSize;
  /** 标题栏里「编辑」左侧的位置，放「更多」菜单这类与整条记录相关的次要入口。 */
  headerActions?: ReactNode;
  /** 查看态底栏左端，放删除这类危险操作；与 `footerEnd` 都没给时查看态不出底栏。 */
  footerStart?: ReactNode;
  /** 查看态底栏右端，放复制、导出这类其余操作。 */
  footerEnd?: ReactNode;
  ref?: Ref<SheetFormHandle>;
  children: ReactNode;
}

/** 平台修饰键要在挂载后才知道：服务端拿不到 navigator，渲染期读会水合不一致。 */
function useSubmitShortcutLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const platform = navigator.userAgent;
    setLabel(/Mac|iPhone|iPad/.test(platform) ? "⌘↵" : "Ctrl ↵");
  }, []);
  return label;
}

function SheetFormSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card" aria-hidden="true">
      <div className="bg-muted px-3 py-2.5">
        <Skeleton className="h-3 w-14 bg-border" />
      </div>
      {["w-28", "w-36", "w-20", "w-32", "w-24"].map((width) => (
        <div key={width} className="flex h-10 items-center justify-between px-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className={cn("h-3", width)} />
        </div>
      ))}
    </div>
  );
}

/** 三态侧滑表单容器（对标 DrawerForm）。 */
export function SheetForm(props: SheetFormProps) {
  const L = useLocalization();
  const editable = props.mode !== "view";
  const loading = props.loading === true;
  const shortcut = useSubmitShortcutLabel();
  // 确认框通过后要执行的离开动作：关掉抽屉，或退回查看态。
  const [confirming, setConfirming] = useState<(() => void) | null>(null);
  const fields = useRef<HTMLDivElement>(null);
  const escHandled = useRef<KeyboardEvent | null>(null);

  // 所有离开编辑的路径都收敛到这里：Esc、右上角 ×、点遮罩、取消按钮。分散判断迟早漏掉一条，
  // 而「哪一条漏了」只有用户丢了数据才会发现。
  const guard = (leave: () => void) => {
    if (props.dirty === true) {
      setConfirming(() => leave);
      return;
    }
    leave();
  };
  const requestClose = () => guard(() => props.onOpenChange(false));
  const onBack = props.onBack;
  const requestBack = onBack ? () => guard(onBack) : requestClose;
  const focusFirstField = (): boolean => {
    const target = fields.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), button:not(:disabled)",
    );
    target?.focus();
    return target != null;
  };
  // 从查看态点「编辑」：那个按钮随即卸载，焦点会掉回 body；接到第一个字段上，直接就能改。
  const previousMode = useRef(props.mode);
  useEffect(() => {
    const from = previousMode.current;
    previousMode.current = props.mode;
    if (from === "view" && props.mode !== "view") focusFirstField();
  });
  useImperativeHandle(props.ref, () => ({
    requestClose,
    focusFirstField: () => {
      focusFirstField();
    },
  }));

  // 长表单不必滚到底部去点保存；与点按钮走同一条提交（含校验）路径。
  const submitOnShortcut = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || !editable) return;
    event.preventDefault();
    if (props.pending !== true) event.currentTarget.requestSubmit();
  };

  const viewFooter =
    !editable && !loading && (props.footerStart !== undefined || props.footerEnd !== undefined);

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => (next ? props.onOpenChange(true) : requestClose())}
    >
      <SheetContent
        className={cn("flex w-full flex-col gap-0 p-0", SHEET_SIZE_CLASS[props.size ?? "sm"])}
        showCloseButton={false}
        // 关闭钮排在标题栏里、位于字段之前，Radix 默认会把打开时的焦点给它。录入时要的是第一个字段。
        onOpenAutoFocus={(event) => {
          if (editable && focusFirstField()) event.preventDefault();
        }}
        onCloseAutoFocus={props.onCloseAutoFocus}
        // Radix 在 document 捕获阶段先处理 Esc，默认走关闭；这里接管成「退一步」，
        // 从查看态进来的编辑才能按 Esc 回到查看态，而不是整个抽屉被关掉。
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          escHandled.current = event;
          requestBack();
        }}
        // 再兜一层：焦点落在文本框里时 Radix 那条路径可能收不到这个键，而表单一打开就自动聚焦
        // 第一个字段——没有兜底，模态最标准的退出键在实际使用中就不生效。同一次按键只处理一次。
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          if (escHandled.current === event.nativeEvent) return;
          requestBack();
        }}
      >
        {/* 标题栏与内容之间画一条线：内容滚动时从线下穿过，而不是和标题混在一起。
            关闭按钮与「编辑」等操作同排同高，不再单独浮在角上。 */}
        <SheetHeader className="flex-row items-start gap-2 border-b py-4 pr-4 pl-5">
          <div className="min-w-0 flex-1">
            {loading ? (
              <>
                <SheetTitle className="sr-only">{props.title}</SheetTitle>
                <Skeleton className="mt-1 h-5 w-36" />
                <Skeleton className="mt-2 h-3 w-48" />
              </>
            ) : (
              <>
                <SheetTitle className="truncate">{props.title}</SheetTitle>
                {props.subtitle !== undefined && (
                  <SheetDescription className="mt-0.5">{props.subtitle}</SheetDescription>
                )}
              </>
            )}
          </div>
          {!loading && props.headerActions}
          {!editable && !loading && props.canEdit === true && (
            <Button type="button" variant="outline" size="sm" onClick={props.onEdit}>
              <Pencil />
              {L("Form:Edit")}
            </Button>
          )}
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={L("Form:Close")}
            >
              <XIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        {/* form 自身不滚：滚动下移一层，否则底部操作栏会跟着字段一起滚出屏幕。 */}
        <form
          className="flex flex-1 flex-col overflow-hidden"
          onKeyDown={submitOnShortcut}
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit?.();
          }}
        >
          <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
            {loading ? (
              <SheetFormSkeleton />
            ) : editable ? (
              // 录入表单里多数字段必填，所以标出选填的那一两个；查询表单反之，不开这个开关。
              // 有 FormCard 分区时合成一张卡、分区之间画线：窄抽屉里几张带框的卡叠在一起太重。
              <div
                ref={fields}
                data-slot="sheet-form-fields"
                className="flex flex-col gap-5 has-[[data-form-card]]:gap-0 has-[[data-form-card]]:divide-y has-[[data-form-card]]:rounded-lg has-[[data-form-card]]:border has-[[data-form-card]]:bg-card"
              >
                <OptionalMarks>{props.children}</OptionalMarks>
              </div>
            ) : (
              // 查看态借整页表单的容器语汇：一行一个字段、发丝线分隔、值右对齐排成一条竖线。
              // 一条记录于是读起来像「把一行表格竖过来」，而不是一排灰掉的输入框。
              <dl className="divide-y overflow-hidden rounded-lg border bg-card">
                <ReadOnlyFields>{props.children}</ReadOnlyFields>
              </dl>
            )}
          </div>
          {editable && !loading && (
            // 单行右对齐、primary 最右，与整页表单同一套语法；取消用 ghost——它是退路，
            // 不是与保存并列的选项，不该也带一圈边框去争视觉重量。
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button type="button" variant="ghost" onClick={requestBack}>
                {L("Form:Cancel")}
              </Button>
              {props.mode === "create" && props.onSubmitAndContinue && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={props.pending}
                  onClick={props.onSubmitAndContinue}
                >
                  {L("Form:SaveAndNew")}
                </Button>
              )}
              <SubmitButton pending={props.pending}>
                {L("Form:Save")}
                {shortcut !== null && (
                  <kbd className="font-sans text-xs text-primary-foreground/70">{shortcut}</kbd>
                )}
              </SubmitButton>
            </div>
          )}
          {viewFooter && (
            <div className="flex items-center gap-2 border-t px-5 py-3">
              {props.footerStart}
              <div className="ml-auto flex items-center gap-2">{props.footerEnd}</div>
            </div>
          )}
        </form>
      </SheetContent>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
      >
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
                const leave = confirming;
                setConfirming(null);
                leave?.();
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
