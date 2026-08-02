import { useLocalization } from "@jcoder-stack/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import {
  getGetApiMultiTenancyTenantsQueryKey,
  useDeleteApiMultiTenancyTenantsId,
  useGetApiMultiTenancyTenants,
  usePostApiMultiTenancyTenants,
  usePutApiMultiTenancyTenantsId,
} from "@/api/endpoints/tenant/tenant";
import type {
  VoloAbpTenantManagementTenantDto,
  VoloAbpTenantManagementTenantUpdateDto,
} from "@/api/models";
import {
  postApiMultiTenancyTenantsBody,
  postApiMultiTenancyTenantsBodyAdminEmailAddressMax,
  postApiMultiTenancyTenantsBodyAdminPasswordMax,
  postApiMultiTenancyTenantsBodyNameMax,
} from "@/api/schemas/tenant/tenant";
import { requirePermission } from "@/auth";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import { TenantManagementPermissions } from "@/permissions";
import { RouteError } from "@/routes/shell-boundary";

/** /tenants：TenantManagement 模块的租户 CRUD；create/edit 字段集不同：create 额外收
 * adminEmailAddress/adminPassword（开租户时建种子管理员），edit 只改 name（后端 TenantUpdateDto
 * 本就不收管理员字段，修改管理员是另一条 Identity.Users 链路）。 */
export const Route = createFileRoute("/_layout/_authed/tenants/")({
  beforeLoad: requirePermission(TenantManagementPermissions.Tenants.Default),
  errorComponent: RouteError,
  component: TenantsPage,
});

const tenantService = createCrudService({
  useList: useGetApiMultiTenancyTenants,
  useCreate: usePostApiMultiTenancyTenants,
  useUpdate: usePutApiMultiTenancyTenantsId,
  useDelete: useDeleteApiMultiTenancyTenantsId,
  listKey: getGetApiMultiTenancyTenantsQueryKey,
  policy: TenantManagementPermissions.Tenants.Default,
});

interface TenantFormValues {
  name: string;
  adminEmailAddress: string;
  adminPassword: string;
}

const EMPTY_VALUES: TenantFormValues = { name: "", adminEmailAddress: "", adminPassword: "" };

// toValues 显式保留（不用默认的 pick-and-coalesce）：密码是业务上刻意的单向字段，
// 记录里从没有它，回填必须固定为空串，不能让默认实现的「按 emptyValues 键从记录 pick」
// 悄悄从别的同名字段带出值。
function toRecordValues(record: VoloAbpTenantManagementTenantDto): TenantFormValues {
  return { name: record.name ?? "", adminEmailAddress: "", adminPassword: "" };
}

// toUpdate 显式保留：update DTO 没有 admin 字段，若省略、退化到默认 identity 映射，会把
// adminEmailAddress/adminPassword 两个空串也塞进 PUT 请求体（依赖后端「忽略未知属性」的隐式
// 契约，而不是让接口形状本身说话）。这里没有触发类型层的条件必填：TenantUpdateDto 的必填
// 字段只有 name，TenantFormValues 结构上仍满足 `extends` 关系，toUpdate 类型层其实可省。
// 真正会被强制显式传的是「目标 DTO 存在 TValues 没有的必填字段」，见
// abp-sheet-contract.test-d.ts 的负例。
function toUpdateInput(value: TenantFormValues): VoloAbpTenantManagementTenantUpdateDto {
  return { name: value.name };
}

function TenantsPage() {
  const L = useLocalization();

  const columns = useMemo<TableColumnDef<VoloAbpTenantManagementTenantDto>[]>(
    () => [{ accessorKey: "name", header: () => L("AbpTenantManagement::TenantName") }],
    [L],
  );

  const sheet = useAbpSheet(tenantService, {
    emptyValues: EMPTY_VALUES,
    toValues: (record) => toRecordValues(record),
    toUpdate: toUpdateInput,
    // 以生成的 body schema 为基底：max64/max256/max128 这类后端约束免费继承；
    // adminEmailAddress/adminPassword 沿用既有 mode 分支（仅 create 收，edit 分支放行空串，
    // 因为 TenantUpdateDto 本就不带这两个字段），max 从生成常量取，消息在此覆盖。
    schema: (mode) => {
      const isCreate = mode === "create";
      return postApiMultiTenancyTenantsBody.extend({
        name: z
          .string()
          .trim()
          .min(1, L("Form:Required"))
          .max(
            postApiMultiTenancyTenantsBodyNameMax,
            L("Form:MaxLength", postApiMultiTenancyTenantsBodyNameMax),
          ),
        adminEmailAddress: isCreate
          ? z
              .string()
              .trim()
              .min(1, L("Form:Required"))
              .max(
                postApiMultiTenancyTenantsBodyAdminEmailAddressMax,
                L("Form:MaxLength", postApiMultiTenancyTenantsBodyAdminEmailAddressMax),
              )
              .pipe(z.email(L("Form:InvalidEmail")))
          : z.string(),
        adminPassword: isCreate
          ? z
              .string()
              .trim()
              .min(1, L("Form:Required"))
              .max(
                postApiMultiTenancyTenantsBodyAdminPasswordMax,
                L("Form:MaxLength", postApiMultiTenancyTenantsBodyAdminPasswordMax),
              )
          : z.string(),
      });
    },
  });

  const t = useAbpTable(tenantService, { columns, onOpen: sheet.open });
  const isCreate = sheet.mode === "create";

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">{L("AbpTenantManagement::Tenants")}</h1>
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
              label={L("AbpTenantManagement::TenantName")}
              required
              disabled={sheet.readOnly}
            />
          )}
        </sheet.form.AppField>

        {isCreate && (
          <>
            <sheet.form.AppField name="adminEmailAddress">
              {(field) => (
                <field.TextField
                  label={L("AbpTenantManagement::DisplayName:AdminEmailAddress")}
                  type="email"
                  required
                />
              )}
            </sheet.form.AppField>

            <sheet.form.AppField name="adminPassword">
              {(field) => (
                <field.TextField
                  label={L("AbpTenantManagement::DisplayName:AdminPassword")}
                  type="password"
                  required
                />
              )}
            </sheet.form.AppField>
          </>
        )}
      </sheet.Sheet>
    </section>
  );
}
