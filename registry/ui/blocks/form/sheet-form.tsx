import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type SheetFormMode = "create" | "edit" | "view";

export interface SheetFormProps {
  mode: SheetFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  pending?: boolean;
  children: ReactNode;
}

/** 三态侧滑表单容器（对标 DrawerForm）。 */
export function SheetForm(props: SheetFormProps) {
  const L = useLocalization();
  const editable = props.mode !== "view";
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between gap-2 pr-12">
          <SheetTitle>{props.title}</SheetTitle>
          {!editable && props.canEdit === true && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={L("Form:Edit")}
              onClick={props.onEdit}
            >
              <Pencil />
            </Button>
          )}
        </SheetHeader>
        <form
          className="flex flex-1 flex-col overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit?.();
          }}
        >
          <div className="flex-1 space-y-4 px-4 py-2">{props.children}</div>
          {editable && (
            <SheetFooter>
              <SubmitButton pending={props.pending} />
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                {L("Form:Cancel")}
              </Button>
            </SheetFooter>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
