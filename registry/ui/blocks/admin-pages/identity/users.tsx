import { formatPersonName } from "@jcoder/abp-react/i18n";
import { useCulture, useLocalization, usePermissionChecker } from "@jcoder/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  getApiIdentityUsersIdRoles,
  getGetApiIdentityUsersQueryKey,
  useDeleteApiIdentityUsersId,
  useGetApiIdentityUsers,
  useGetApiIdentityUsersAssignableRoles,
  usePostApiIdentityUsers,
  usePutApiIdentityUsersId,
} from "@/api/endpoints/user/user";
import type {
  VoloAbpIdentityIdentityUserCreateDto,
  VoloAbpIdentityIdentityUserDto,
  VoloAbpIdentityIdentityUserUpdateDto,
} from "@/api/models";
import { requirePermission } from "@/auth";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { StatusBadge } from "@/components/abp/table/status-badge";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { ComboboxOption } from "@/components/combobox/use-combobox-options";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { IdentityPermissions } from "@/permissions";
import { RouteError } from "@/routes/shell-boundary";

// 编辑/权限面板的重依赖（combobox、tree、accordion 等）按需加载：列表首屏不背这批模块。
const PermissionSheet = lazy(() =>
  import("@/components/abp/permission/permission-sheet").then((m) => ({
    default: m.PermissionSheet,
  })),
);

/** 用户 DTO 不带 roleNames，故 open() 需先 GET .../roles 再开 sheet。 */
export const Route = createFileRoute("/_layout/_authed/identity/users")({
  beforeLoad: requirePermission(IdentityPermissions.Users.Default),
  errorComponent: RouteError,
  component: UsersPage,
});

const userService = createCrudService({
  useList: useGetApiIdentityUsers,
  useCreate: usePostApiIdentityUsers,
  useUpdate: usePutApiIdentityUsersId,
  useDelete: useDeleteApiIdentityUsersId,
  listKey: getGetApiIdentityUsersQueryKey,
  policy: IdentityPermissions.Users.Default,
});

interface UserFormValues {
  userName: string;
  email: string;
  name: string;
  surname: string;
  phoneNumber: string;
  password: string;
  isActive: boolean;
  roleNames: string[];
}

const EMPTY_VALUES: UserFormValues = {
  userName: "",
  email: "",
  name: "",
  surname: "",
  phoneNumber: "",
  password: "",
  isActive: true,
  roleNames: [],
};

/** 不能走默认 pick：roleNames 来自异步预取、password 必须回空（不回显）。 */
function toRecordValues(
  record: VoloAbpIdentityIdentityUserDto,
  roleNames: string[],
): UserFormValues {
  return {
    userName: record.userName ?? "",
    email: record.email ?? "",
    name: record.name ?? "",
    surname: record.surname ?? "",
    phoneNumber: record.phoneNumber ?? "",
    password: "",
    isActive: record.isActive ?? true,
    roleNames,
  };
}

/** 不能走默认 identity：可选字段空串归一为 undefined（不给后端发 `name: ""`）。 */
function toCreateInput(value: UserFormValues): VoloAbpIdentityIdentityUserCreateDto {
  return {
    userName: value.userName,
    email: value.email,
    name: value.name || undefined,
    surname: value.surname || undefined,
    phoneNumber: value.phoneNumber || undefined,
    password: value.password,
    isActive: value.isActive,
    roleNames: value.roleNames,
  };
}

/** 不能走默认 identity：edit 不渲染 password 字段（留空=不改）；value.password 恒为初始空串，
 *  故 update body 里永远不带 password，后端保持原密码不变；其余可选字段同 toCreateInput，
 *  空串归一为 undefined（不给后端发 `name: ""`）。 */
function toUpdateInput(value: UserFormValues): VoloAbpIdentityIdentityUserUpdateDto {
  return {
    userName: value.userName,
    email: value.email,
    name: value.name || undefined,
    surname: value.surname || undefined,
    phoneNumber: value.phoneNumber || undefined,
    isActive: value.isActive,
    roleNames: value.roleNames,
  };
}

function UsersPage() {
  const L = useLocalization();
  const culture = useCulture();
  const can = usePermissionChecker();
  const canManagePermissions = can(IdentityPermissions.Users.ManagePermissions);
  const [permissionsFor, setPermissionsFor] = useState<VoloAbpIdentityIdentityUserDto | null>(null);

  // 引用必须稳定：进 AbpTable 的 columns memo 依赖，内联箭头会让列模型每渲染重建（DEV 有 churn 告警）。
  const permissionMenuItem = useCallback(
    (row: VoloAbpIdentityIdentityUserDto) =>
      canManagePermissions ? (
        <DropdownMenuItem onSelect={() => setPermissionsFor(row)}>
          <KeyRound />
          {L("Admin:Permissions")}
        </DropdownMenuItem>
      ) : null,
    [canManagePermissions, L],
  );

  const columns = useMemo<TableColumnDef<VoloAbpIdentityIdentityUserDto>[]>(
    () => [
      { accessorKey: "userName", header: () => L("AbpIdentity::UserName") },
      {
        id: "fullName",
        header: () => L("Admin:FullName"),
        enableSorting: false,
        cell: ({ row }) =>
          formatPersonName({ name: row.original.name, surname: row.original.surname, culture }),
      },
      { accessorKey: "email", header: () => L("AbpIdentity::DisplayName:Email") },
      {
        accessorKey: "isActive",
        header: () => L("AbpIdentity::DisplayName:IsActive"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() ? "success" : "neutral"}>
            {getValue() ? L("Admin:Yes") : L("Admin:No")}
          </StatusBadge>
        ),
      },
    ],
    [L, culture],
  );

  const sheet = useAbpSheet(userService, {
    emptyValues: EMPTY_VALUES,
    // 用户 DTO 不带 roleNames，view/edit 打开前先取一次当前角色再开 sheet；AbpTable 的 onOpen
    // 是 fire-and-forget，GET 失败必须在这里兜住提示并取消打开，否则用户只看到点击无响应。
    toValues: async (record, mode) => {
      let roleNames: string[] = [];
      if (record.id && mode !== "create") {
        try {
          const roles = await getApiIdentityUsersIdRoles(record.id);
          roleNames = (roles.items ?? [])
            .map((role) => role.name ?? "")
            .filter((name) => name.length > 0);
        } catch {
          toast.error(L("Crud:OperationFailed"));
          return null;
        }
      }
      return toRecordValues(record, roleNames);
    },
    toCreate: toCreateInput,
    toUpdate: toUpdateInput,
    schema: (mode) => {
      const isCreate = mode === "create";
      return z.object({
        userName: z.string().trim().min(1, L("Form:Required")),
        email: z
          .string()
          .trim()
          .min(1, L("Form:Required"))
          .pipe(z.email(L("Form:InvalidEmail"))),
        name: z.string(),
        surname: z.string(),
        phoneNumber: z.string(),
        password: isCreate ? z.string().trim().min(1, L("Form:Required")) : z.string(),
        isActive: z.boolean(),
        roleNames: z.array(z.string()),
      });
    },
  });

  const t = useAbpTable(userService, {
    columns,
    row: { menu: permissionMenuItem },
    onOpen: sheet.open,
  });

  // MultiCombobox 的角色候选项只在编辑态（create/edit）且有 Update 权限时才拉，防止 view 态
  // 或无权限用户触发一次注定被后端 403 的请求。
  const assignableRolesQuery = useGetApiIdentityUsersAssignableRoles({
    query: { enabled: t.source.can.update && sheet.mode !== undefined && sheet.mode !== "view" },
  });
  const roleOptions: ComboboxOption[] = (assignableRolesQuery.data?.items ?? []).map((role) => ({
    value: role.name ?? "",
    label: role.name ?? "",
  }));

  const rolesEditable = t.source.can.update && sheet.mode !== "view";

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("AbpIdentity::Users")}</h1>
      <t.Table>
        <t.BulkBar>
          <t.BulkDelete />
        </t.BulkBar>
      </t.Table>
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="userName">
          {(field) => (
            <field.TextField
              label={L("AbpIdentity::UserName")}
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="email">
          {(field) => (
            <field.TextField
              label={L("AbpIdentity::DisplayName:Email")}
              type="email"
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="name">
          {(field) => (
            <field.TextField label={L("AbpIdentity::DisplayName:Name")} disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="surname">
          {(field) => (
            <field.TextField label={L("AbpIdentity::Surname")} disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="phoneNumber">
          {(field) => (
            <field.TextField label={L("AbpIdentity::PhoneNumber")} disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>

        {sheet.mode === "create" && (
          <sheet.form.AppField name="password">
            {(field) => (
              <field.TextField label={L("AbpIdentity::Password")} type="password" required />
            )}
          </sheet.form.AppField>
        )}

        <sheet.form.AppField name="isActive">
          {(field) => (
            <field.SwitchField
              label={L("AbpIdentity::DisplayName:IsActive")}
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="roleNames">
          {(field) => (
            <field.MultiComboboxField
              label={L("AbpIdentity::Roles")}
              options={roleOptions}
              editable={rolesEditable}
            />
          )}
        </sheet.form.AppField>
      </sheet.Sheet>
      {permissionsFor && (
        <Suspense fallback={null}>
          <PermissionSheet
            providerName="U"
            providerKey={permissionsFor.id ?? ""}
            open={permissionsFor !== null}
            onOpenChange={(open) => !open && setPermissionsFor(null)}
            title={`${L("Admin:Permissions")} · ${permissionsFor.userName ?? ""}`}
          />
        </Suspense>
      )}
    </section>
  );
}
