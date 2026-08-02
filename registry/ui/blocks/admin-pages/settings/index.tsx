import { useLocalization } from "@jcoder/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  postApiSettingManagementEmailing,
  postApiSettingManagementEmailingSendTestEmail,
  useGetApiSettingManagementEmailing,
} from "@/api/endpoints/email-settings/email-settings";
import {
  postApiSettingManagementTimezone,
  useGetApiSettingManagementTimezone,
  useGetApiSettingManagementTimezoneTimezones,
} from "@/api/endpoints/time-zone-settings/time-zone-settings";
import type {
  VoloAbpNameValue,
  VoloAbpSettingManagementEmailSettingsDto,
  VoloAbpSettingManagementSendTestEmailInput,
  VoloAbpSettingManagementUpdateEmailSettingsDto,
} from "@/api/models";
import { requirePermission } from "@/auth";
import { abpFormOptions } from "@/components/abp/crud/abp-form-options";
import { Combobox } from "@/components/combobox/combobox";
import { FormErrorSummary } from "@/components/form/form-error-summary";
import { useAppForm } from "@/components/form/form-hook";
import { FormSection } from "@/components/form/form-section";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingManagementPermissions } from "@/permissions";
import { RouteError } from "@/routes/shell-boundary";

/** /settings：SettingManagement 模块的邮件/时区两页签。requiredPolicy 用
 * SettingManagement.Emailing。demo 后端两页签共用这一策略，无独立的 TimeZone 权限点。 */
export const Route = createFileRoute("/_layout/_authed/settings/")({
  beforeLoad: requirePermission(SettingManagementPermissions.Emailing),
  errorComponent: RouteError,
  component: SettingsPage,
});

function SettingsPage() {
  const L = useLocalization();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("AbpSettingManagement::Menu:Settings")}</h1>
      <Tabs defaultValue="emailing">
        <TabsList variant="line">
          <TabsTrigger value="emailing">{L("AbpSettingManagement::Menu:Emailing")}</TabsTrigger>
          <TabsTrigger value="timezone">{L("AbpSettingManagement::Menu:TimeZone")}</TabsTrigger>
        </TabsList>
        <TabsContent value="emailing" className="space-y-4">
          <EmailingTab />
        </TabsContent>
        <TabsContent value="timezone">
          <TimeZoneTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}

interface EmailingFormValues {
  smtpHost: string;
  smtpPort: number;
  smtpUserName: string;
  smtpPassword: string;
  smtpDomain: string;
  smtpEnableSsl: boolean;
  smtpUseDefaultCredentials: boolean;
  defaultFromAddress: string;
  defaultFromDisplayName: string;
}

function toEmailingValues(dto: VoloAbpSettingManagementEmailSettingsDto): EmailingFormValues {
  return {
    smtpHost: dto.smtpHost ?? "",
    smtpPort: dto.smtpPort ?? 25,
    smtpUserName: dto.smtpUserName ?? "",
    smtpPassword: dto.smtpPassword ?? "",
    smtpDomain: dto.smtpDomain ?? "",
    smtpEnableSsl: dto.smtpEnableSsl ?? false,
    smtpUseDefaultCredentials: dto.smtpUseDefaultCredentials ?? false,
    defaultFromAddress: dto.defaultFromAddress ?? "",
    defaultFromDisplayName: dto.defaultFromDisplayName ?? "",
  };
}

function toUpdateEmailingInput(
  value: EmailingFormValues,
): VoloAbpSettingManagementUpdateEmailSettingsDto {
  return {
    smtpHost: value.smtpHost || undefined,
    smtpPort: value.smtpPort,
    smtpUserName: value.smtpUserName || undefined,
    smtpPassword: value.smtpPassword || undefined,
    smtpDomain: value.smtpDomain || undefined,
    smtpEnableSsl: value.smtpEnableSsl,
    smtpUseDefaultCredentials: value.smtpUseDefaultCredentials,
    defaultFromAddress: value.defaultFromAddress,
    defaultFromDisplayName: value.defaultFromDisplayName,
  };
}

function EmailingTab() {
  const L = useLocalization();
  const emailingQuery = useGetApiSettingManagementEmailing();

  if (emailingQuery.isError) {
    return <FormErrorSummary errors={[L("Crud:OperationFailed")]} />;
  }
  if (!emailingQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{L("AbpSettingManagement::Menu:Emailing")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return <EmailingFormCard emailing={emailingQuery.data} />;
}

function EmailingFormCard({ emailing }: { emailing: VoloAbpSettingManagementEmailSettingsDto }) {
  const L = useLocalization();
  const [testEmailOpen, setTestEmailOpen] = useState(false);

  const emailingSchema = z.object({
    smtpHost: z.string(),
    smtpPort: z.number(L("Form:Required")),
    smtpUserName: z.string(),
    smtpPassword: z.string(),
    smtpDomain: z.string(),
    smtpEnableSsl: z.boolean(),
    smtpUseDefaultCredentials: z.boolean(),
    defaultFromAddress: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .pipe(z.email(L("Form:InvalidEmail"))),
    defaultFromDisplayName: z.string().trim().min(1, L("Form:Required")),
  });

  const form = useAppForm(
    abpFormOptions({
      defaultValues: toEmailingValues(emailing),
      schema: emailingSchema,
      submit: async (value: EmailingFormValues) => {
        await postApiSettingManagementEmailing(toUpdateEmailingInput(value));
        form.reset(value);
      },
      onSuccess: () => toast.success(L("Crud:Saved")),
    }),
  );

  return (
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
        <FormSection title={L("Admin:SmtpSection")} description={L("Admin:SmtpSectionDesc")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="smtpHost">
              {(field) => <field.TextField label={L("AbpSettingManagement::SmtpHost")} />}
            </form.AppField>

            <form.AppField name="smtpPort">
              {(field) => (
                <field.NumberField label={L("AbpSettingManagement::SmtpPort")} required />
              )}
            </form.AppField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="smtpUserName">
              {(field) => <field.TextField label={L("AbpSettingManagement::SmtpUserName")} />}
            </form.AppField>

            <form.AppField name="smtpPassword">
              {(field) => (
                <field.TextField
                  label={L("AbpSettingManagement::SmtpPassword")}
                  type="password"
                  autoComplete="off"
                />
              )}
            </form.AppField>
          </div>

          <form.AppField name="smtpDomain">
            {(field) => <field.TextField label={L("AbpSettingManagement::SmtpDomain")} />}
          </form.AppField>

          <form.AppField name="smtpEnableSsl">
            {(field) => <field.SwitchField label={L("AbpSettingManagement::SmtpEnableSsl")} />}
          </form.AppField>

          <form.AppField name="smtpUseDefaultCredentials">
            {(field) => (
              <field.SwitchField label={L("AbpSettingManagement::SmtpUseDefaultCredentials")} />
            )}
          </form.AppField>
        </FormSection>

        <FormSection title={L("Admin:SenderSection")} description={L("Admin:SenderSectionDesc")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="defaultFromAddress">
              {(field) => (
                <field.TextField
                  label={L("AbpSettingManagement::DefaultFromAddress")}
                  type="email"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="defaultFromDisplayName">
              {(field) => (
                <field.TextField
                  label={L("AbpSettingManagement::DefaultFromDisplayName")}
                  required
                />
              )}
            </form.AppField>
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                {L("AbpSettingManagement::SendTestEmail")}
              </Button>
            </DialogTrigger>
            <SendTestEmailDialogContent
              defaultSenderEmailAddress={emailing.defaultFromAddress ?? ""}
              onClose={() => setTestEmailOpen(false)}
            />
          </Dialog>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => <SubmitButton pending={isSubmitting} />}
          </form.Subscribe>
        </div>
      </div>
    </form>
  );
}

interface SendTestEmailFormValues {
  senderEmailAddress: string;
  targetEmailAddress: string;
  subject: string;
  body: string;
}

function toSendTestEmailInput(
  value: SendTestEmailFormValues,
): VoloAbpSettingManagementSendTestEmailInput {
  return {
    senderEmailAddress: value.senderEmailAddress,
    targetEmailAddress: value.targetEmailAddress,
    subject: value.subject,
    body: value.body || undefined,
  };
}

/** 「发送测试邮件」Dialog：成败走 toast（不进 FormErrorSummary）。demo SMTP 未配时后端抛
 * MailSendingFailed 是环境性错误而非表单校验错误，字段级映射无意义。 */
function SendTestEmailDialogContent({
  defaultSenderEmailAddress,
  onClose,
}: {
  defaultSenderEmailAddress: string;
  onClose: () => void;
}) {
  const L = useLocalization();

  const emptyValues: SendTestEmailFormValues = {
    senderEmailAddress: defaultSenderEmailAddress,
    targetEmailAddress: "",
    subject: "",
    body: "",
  };

  const sendTestEmailSchema = z.object({
    senderEmailAddress: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .pipe(z.email(L("Form:InvalidEmail"))),
    targetEmailAddress: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .pipe(z.email(L("Form:InvalidEmail"))),
    subject: z.string().trim().min(1, L("Form:Required")),
    body: z.string(),
  });

  const form = useAppForm(
    abpFormOptions({
      defaultValues: emptyValues,
      schema: sendTestEmailSchema,
      submit: async (value: SendTestEmailFormValues) => {
        try {
          await postApiSettingManagementEmailingSendTestEmail(toSendTestEmailInput(value));
        } catch {
          // 重新 throw 使本次提交判定失败,避免误触发成功回调关闭弹窗/重置表单;错误已由 toast 展示。
          toast.error(L("AbpSettingManagement::MailSendingFailed"));
          throw new Error(L("AbpSettingManagement::MailSendingFailed"));
        }
      },
      onSuccess: () => {
        toast.success(L("AbpSettingManagement::SentSuccessfully"));
        form.reset(emptyValues);
        onClose();
      },
    }),
  );

  return (
    <DialogContent>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <DialogHeader>
          <DialogTitle>{L("AbpSettingManagement::SendTestEmail")}</DialogTitle>
          <DialogDescription>
            {L("AbpSettingManagement::Permission:EmailingTest")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <form.AppField name="senderEmailAddress">
            {(field) => (
              <field.TextField
                label={L("AbpSettingManagement::SenderEmailAddress")}
                type="email"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="targetEmailAddress">
            {(field) => (
              <field.TextField
                label={L("AbpSettingManagement::TargetEmailAddress")}
                type="email"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="subject">
            {(field) => <field.TextField label={L("AbpSettingManagement::Subject")} required />}
          </form.AppField>

          <form.AppField name="body">
            {(field) => <field.TextField label={L("AbpSettingManagement::Body")} />}
          </form.AppField>
        </div>

        <DialogFooter>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <SubmitButton pending={isSubmitting}>{L("AbpSettingManagement::Send")}</SubmitButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function TimeZoneTab() {
  const L = useLocalization();
  const timezonesQuery = useGetApiSettingManagementTimezoneTimezones();
  const currentQuery = useGetApiSettingManagementTimezone();

  if (timezonesQuery.isError || currentQuery.isError) {
    return <FormErrorSummary errors={[L("Crud:OperationFailed")]} />;
  }
  if (!timezonesQuery.data || currentQuery.data === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{L("AbpSettingManagement::Menu:TimeZone")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return <TimeZoneFormCard timezones={timezonesQuery.data} currentTimezone={currentQuery.data} />;
}

function TimeZoneFormCard({
  timezones,
  currentTimezone,
}: {
  timezones: VoloAbpNameValue[];
  currentTimezone: string;
}) {
  const L = useLocalization();
  const [value, setValue] = useState(currentTimezone);
  const [saving, setSaving] = useState(false);
  const timezoneOptions = useMemo(
    () =>
      timezones.map((timezone) => ({
        value: timezone.value ?? "",
        label: timezone.name ?? timezone.value ?? "",
      })),
    [timezones],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await postApiSettingManagementTimezone({ timezone: value });
      toast.success(L("Crud:Saved"));
    } catch {
      toast.error(L("Crud:OperationFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <div className="divide-y rounded-lg border bg-card">
        <FormSection title={L("AbpSettingManagement::Menu:TimeZone")}>
          <Field>
            <FieldLabel htmlFor="timezone">
              {L("AbpSettingManagement::DisplayName:Timezone")}
            </FieldLabel>
            {/* 时区约 500 项，Radix Select 逐项挂载实测有 500ms+ 长任务，改用可搜索 Combobox。 */}
            <Combobox
              value={value}
              onChange={(next) => setValue(next ?? "")}
              options={timezoneOptions}
            />
          </Field>
        </FormSection>

        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <SubmitButton pending={saving} />
        </div>
      </div>
    </form>
  );
}
