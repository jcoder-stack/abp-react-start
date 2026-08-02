import { useLocalization } from "@jcoder-stack/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { abpFormOptions } from "@/components/abp/crud/abp-form-options";
import { useAppForm } from "@/components/form/form-hook";
import { FormSection } from "@/components/form/form-section";
import { SubmitButton } from "@/components/form/submit-button";
import { postApiAppBook } from "@/routes/_layout/_authed/books/-book-api";
import type { AbpSwaggerBooksCreateUpdateBookDto } from "@/routes/_layout/_authed/books/-book-models";

/** 长表单逃生舱示范(不走 SheetForm 组合层);只填 name 让后端拒绝缺失的必填项,展示服务端错误落字段。 */
export const Route = createFileRoute("/_layout/_authed/books/new")({
  component: NewBookPage,
});

const newBookSchema = z.object({ name: z.string() });

function NewBookPage() {
  const L = useLocalization();
  const [saved, setSaved] = useState(false);

  const form = useAppForm(
    abpFormOptions({
      defaultValues: { name: "" },
      schema: newBookSchema,
      submit: async (value: { name: string }) => {
        setSaved(false);
        await postApiAppBook(value as AbpSwaggerBooksCreateUpdateBookDto);
      },
      onSuccess: () => setSaved(true),
    }),
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("App::NewBook")}</h1>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.FormErrors />
        </form.AppForm>

        <div className="divide-y rounded-lg border bg-card">
          <FormSection title={L("App::BookInfo")}>
            <form.AppField name="name">
              {(field) => <field.TextField label={L("App::BookName")} />}
            </form.AppField>
          </FormSection>

          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <>
                  {saved && (
                    <span className="text-sm text-muted-foreground">{L("Crud:Saved")}</span>
                  )}
                  <SubmitButton pending={isSubmitting} />
                </>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </section>
  );
}
