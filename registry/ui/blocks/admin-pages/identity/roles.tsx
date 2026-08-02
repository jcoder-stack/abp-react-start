import { useLocalization, usePermissionChecker } from "@jcoder/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  getGetApiIdentityRolesQueryKey,
  useDeleteApiIdentityRolesId,
  useGetApiIdentityRoles,
  usePostApiIdentityRoles,
  usePutApiIdentityRolesId,
} from "@/api/endpoints/role/role";
import type { VoloAbpIdentityIdentityRoleDto } from "@/api/models";
import { requirePermission } from "@/auth";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { StatusBadge } from "@/components/abp/table/status-badge";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { IdentityPermissions } from "@/permissions";
import { buildRoleSchema } from "@/routes/_layout/_authed/identity/-role-schema";
import { RouteError } from "@/routes/shell-boundary";

// 权限面板的重依赖（tree、accordion 等）按需加载：列表首屏不背这批模块。
const PermissionSheet = lazy(() =>
  import("@/components/abp/permission/permission-sheet").then((m) => ({
    default: m.PermissionSheet,
  })),
);

/** 角色本身无可分配对象，故无角色 MultiCombobox。 */
export const Route = createFileRoute("/_layout/_authed/identity/roles")({
  beforeLoad: requirePermission(IdentityPermissions.Roles.Default),
  errorComponent: RouteError,
  component: RolesPage,
});

const roleService = createCrudService({
  useList: useGetApiIdentityRoles,
  useCreate: usePostApiIdentityRoles,
  useUpdate: usePutApiIdentityRolesId,
  useDelete: useDeleteApiIdentityRolesId,
  listKey: getGetApiIdentityRolesQueryKey,
  policy: IdentityPermissions.Roles.Default,
});

interface RoleFormValues {
  name: string;
  isDefault: boolean;
  isPublic: boolean;
}

const EMPTY_VALUES: RoleFormValues = { name: "", isDefault: false, isPublic: false };

function RolesPage() {
  const L = useLocalization();
  const can = usePermissionChecker();
  const canManagePermissions = can(IdentityPermissions.Roles.ManagePermissions);
  const [permissionsFor, setPermissionsFor] = useState<VoloAbpIdentityIdentityRoleDto | null>(null);

  const roleSchema = buildRoleSchema(L);

  // 引用必须稳定：进 AbpTable 的 columns memo 依赖，内联箭头会让列模型每渲染重建（DEV 有 churn 告警）。
  const permissionMenuItem = useCallback(
    (row: VoloAbpIdentityIdentityRoleDto) =>
      canManagePermissions ? (
        <DropdownMenuItem onSelect={() => setPermissionsFor(row)}>
          <KeyRound />
          {L("Admin:Permissions")}
        </DropdownMenuItem>
      ) : null,
    [canManagePermissions, L],
  );

  const columns = useMemo<TableColumnDef<VoloAbpIdentityIdentityRoleDto>[]>(
    () => [
      { accessorKey: "name", header: () => L("AbpIdentity::DisplayName:RoleName") },
      {
        accessorKey: "isDefault",
        header: () => L("AbpIdentity::DisplayName:IsDefault"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() ? "info" : "neutral"}>
            {getValue() ? L("Admin:Yes") : L("Admin:No")}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "isPublic",
        header: () => L("AbpIdentity::DisplayName:IsPublic"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() ? "info" : "neutral"}>
            {getValue() ? L("Admin:Yes") : L("Admin:No")}
          </StatusBadge>
        ),
      },
    ],
    [L],
  );

  const sheet = useAbpSheet(roleService, {
    emptyValues: EMPTY_VALUES,
    schema: () => roleSchema,
  });

  const t = useAbpTable(roleService, {
    columns,
    row: { menu: permissionMenuItem },
    onOpen: sheet.open,
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("AbpIdentity::Roles")}</h1>
      <t.Table>
        <t.BulkBar>
          <t.BulkDelete />
        </t.BulkBar>
      </t.Table>
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => (
            <field.TextField
              label={L("AbpIdentity::DisplayName:RoleName")}
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="isDefault">
          {(field) => (
            <field.SwitchField
              label={L("AbpIdentity::DisplayName:IsDefault")}
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        <sheet.form.AppField name="isPublic">
          {(field) => (
            <field.SwitchField
              label={L("AbpIdentity::DisplayName:IsPublic")}
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>
      </sheet.Sheet>
      {permissionsFor && (
        <Suspense fallback={null}>
          <PermissionSheet
            providerName="R"
            providerKey={permissionsFor.name ?? ""}
            open={permissionsFor !== null}
            onOpenChange={(open) => !open && setPermissionsFor(null)}
            title={`${L("Admin:Permissions")} · ${permissionsFor.name ?? ""}`}
          />
        </Suspense>
      )}
    </section>
  );
}
