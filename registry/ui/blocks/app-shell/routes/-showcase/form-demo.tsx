import { useLocalization } from "@jcoder-stack/abp-react/react";
import { revalidateLogic } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/form-hook";
import { SheetForm } from "@/components/form/sheet-form";
import { Button } from "@/components/ui/button";

/** form 展示：侧滑表单 + useAppForm 预绑定字段（label/必填标记/aria-required/内联错误一处内聚），失焦/提交即校验，全本地、不打后端。 */
export function FormDemo() {
  const L = useLocalization();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const formSchema = z.object({
    name: z.string().trim().min(1, L("Form:Required")),
    email: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .pipe(z.email(L("Form:InvalidEmail"))),
    publishDate: z.string(),
  });

  const form = useAppForm({
    defaultValues: { name: "", email: "", publishDate: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: formSchema,
    },
    onSubmit: ({ value }) => {
      setSubmitted(value.name);
      setOpen(false);
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        onClick={() => {
          form.reset();
          setOpen(true);
        }}
      >
        {L("Showcase:FormOpen")}
      </Button>
      {submitted !== null && (
        <span className="text-sm text-muted-foreground">
          {L("Showcase:FormSuccess", submitted)}
        </span>
      )}

      <SheetForm
        mode="create"
        open={open}
        onOpenChange={setOpen}
        title={L("Showcase:FormOpen")}
        onSubmit={() => form.handleSubmit()}
      >
        <form.AppField name="name">
          {(field) => <field.TextField label={L("Showcase:FormNameLabel")} required />}
        </form.AppField>

        <form.AppField name="email">
          {(field) => (
            <field.TextField label={L("Showcase:FormEmailLabel")} type="email" required />
          )}
        </form.AppField>

        <form.AppField name="publishDate">
          {(field) => <field.DateField label={L("Showcase:DatePickerSingle")} />}
        </form.AppField>
      </SheetForm>
    </div>
  );
}
