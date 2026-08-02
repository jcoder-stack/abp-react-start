import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  getGetApiAccountMyProfileQueryKey,
  postApiAccountMyProfileChangePassword,
  putApiAccountMyProfile,
  useGetApiAccountMyProfile,
} from "@/api/endpoints/profile/profile";
import type {
  VoloAbpAccountChangePasswordInput,
  VoloAbpAccountProfileDto,
  VoloAbpAccountUpdateProfileDto,
} from "@/api/models";
import { abpFormOptions } from "@/components/abp/crud/abp-form-options";
import { FormErrorSummary } from "@/components/form/form-error-summary";
import { useAppForm } from "@/components/form/form-hook";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteError } from "@/routes/shell-boundary";

/** /profile 个人中心。无 requiredPolicy（认证即可访问，非租户/角色资源）。两张独立 Card：
 * 资料卡直到 getApiAccountMyProfile 结算才挂载表单（用查到的值当 useForm 的 defaultValues，
 * 而非先挂空表单再靠 effect 回填，省一次 reset 竞态）；改密码卡是纯空表单，成功后自己清空。 */
export const Route = createFileRoute("/_layout/_authed/profile/")({
  errorComponent: RouteError,
  component: ProfilePage,
});

function ProfilePage() {
  const L = useLocalization();
  const profileQuery = useGetApiAccountMyProfile();

  return (
    <section className="mx-auto w-full max-w-xl space-y-4">
      <h1 className="text-2xl font-normal">{L("Admin:Profile")}</h1>
      {profileQuery.isError ? (
        <FormErrorSummary errors={[L("Crud:OperationFailed")]} />
      ) : profileQuery.data ? (
        <ProfileInfoCard profile={profileQuery.data} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{L("Admin:ProfileInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      )}
      <ChangePasswordCard />
    </section>
  );
}

interface ProfileFormValues {
  userName: string;
  email: string;
  name: string;
  surname: string;
  phoneNumber: string;
  concurrencyStamp: string;
}

function toProfileValues(profile: VoloAbpAccountProfileDto): ProfileFormValues {
  return {
    userName: profile.userName ?? "",
    email: profile.email ?? "",
    name: profile.name ?? "",
    surname: profile.surname ?? "",
    phoneNumber: profile.phoneNumber ?? "",
    concurrencyStamp: profile.concurrencyStamp ?? "",
  };
}

/** ABP 乐观并发：UpdateAsync 把 concurrencyStamp 赋给实体当 EF 拦截器 UPDATE 的 WHERE 条件，
 * 不带（空串→undefined）就匹配不到行，单人保存也会抛 AbpDbConcurrencyException。 */
function toUpdateProfileInput(value: ProfileFormValues): VoloAbpAccountUpdateProfileDto {
  return {
    userName: value.userName,
    email: value.email,
    name: value.name || undefined,
    surname: value.surname || undefined,
    phoneNumber: value.phoneNumber || undefined,
    concurrencyStamp: value.concurrencyStamp || undefined,
  };
}

function ProfileInfoCard({ profile }: { profile: VoloAbpAccountProfileDto }) {
  const L = useLocalization();
  const queryClient = useQueryClient();

  const profileSchema = z.object({
    userName: z.string().trim().min(1, L("Form:Required")),
    email: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .pipe(z.email(L("Form:InvalidEmail"))),
    name: z.string(),
    surname: z.string(),
    phoneNumber: z.string(),
    concurrencyStamp: z.string(),
  });

  const form = useAppForm(
    abpFormOptions({
      defaultValues: toProfileValues(profile),
      schema: profileSchema,
      submit: async (value: ProfileFormValues) => {
        const updated = await putApiAccountMyProfile(toUpdateProfileInput(value));
        queryClient.setQueryData(getGetApiAccountMyProfileQueryKey(), updated);
        form.reset(toProfileValues(updated));
      },
      onSuccess: () => toast.success(L("Crud:Saved")),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{L("Admin:ProfileInfo")}</CardTitle>
      </CardHeader>
      <CardContent>
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

          <form.AppField name="userName">
            {(field) => <field.TextField label={L("AbpAccount::DisplayName:UserName")} required />}
          </form.AppField>

          <form.AppField name="email">
            {(field) => (
              <field.TextField label={L("AbpAccount::DisplayName:Email")} type="email" required />
            )}
          </form.AppField>

          <form.AppField name="name">
            {(field) => <field.TextField label={L("AbpAccount::DisplayName:Name")} />}
          </form.AppField>

          <form.AppField name="surname">
            {(field) => <field.TextField label={L("AbpAccount::DisplayName:Surname")} />}
          </form.AppField>

          <form.AppField name="phoneNumber">
            {(field) => <field.TextField label={L("AbpAccount::DisplayName:PhoneNumber")} />}
          </form.AppField>

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => <SubmitButton pending={isSubmitting} />}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
}

const EMPTY_PASSWORD_VALUES: ChangePasswordFormValues = { currentPassword: "", newPassword: "" };

function toChangePasswordInput(value: ChangePasswordFormValues): VoloAbpAccountChangePasswordInput {
  return { currentPassword: value.currentPassword, newPassword: value.newPassword };
}

function ChangePasswordCard() {
  const L = useLocalization();

  const passwordSchema = z.object({
    currentPassword: z.string().trim().min(1, L("Form:Required")),
    newPassword: z.string().trim().min(1, L("Form:Required")),
  });

  const form = useAppForm(
    abpFormOptions({
      defaultValues: EMPTY_PASSWORD_VALUES,
      schema: passwordSchema,
      submit: async (value: ChangePasswordFormValues) => {
        await postApiAccountMyProfileChangePassword(toChangePasswordInput(value));
      },
      onSuccess: () => {
        toast.success(L("Crud:Saved"));
        form.reset(EMPTY_PASSWORD_VALUES);
      },
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{L("AbpAccount::ChangePassword")}</CardTitle>
      </CardHeader>
      <CardContent>
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

          <form.AppField name="currentPassword">
            {(field) => (
              <field.TextField
                label={L("AbpAccount::DisplayName:CurrentPassword")}
                type="password"
                autoComplete="current-password"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="newPassword">
            {(field) => (
              <field.TextField
                label={L("AbpAccount::DisplayName:NewPassword")}
                type="password"
                autoComplete="new-password"
                required
              />
            )}
          </form.AppField>

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => <SubmitButton pending={isSubmitting} />}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
