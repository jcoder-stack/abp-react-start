// @vitest-environment jsdom
import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { postApiIdentityRolesBodyNameMax } from "@/api/schemas/role/role";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { buildRoleSchema } from "@/routes/_layout/_authed/identity/-role-schema";
import { admin, renderWithProviders } from "./test-utils";

// identity/roles.tsx 的 name 校验用的正是这里导入的 `buildRoleSchema`（见
// `-role-schema.ts` 头部注释：roles.tsx 本身经 `@/auth` 拉进 @tanstack/react-start 的
// server fn，在没有 tanstackStart vite 插件的 vitest 环境下无法被测试直接 import，故单独
// 落到这个不依赖 `@/auth`/`createFileRoute` 的同目录模块，页面与测试共用同一份实现）。
// 本用例证明超长 name 在提交前就被前端拦下。此前的手写 schema 没有 max 约束，超长值要打到
// 后端才 400；schema 任何回归（比如误改回手写、丢了 max）都会直接反映进这条测试。
const messages = {
  en: { "": { ...tableMessages.en[""], ...formMessages.en[""], ...crudMessages.en[""] } },
  "zh-Hans": {
    "": {
      ...tableMessages["zh-Hans"][""],
      ...formMessages["zh-Hans"][""],
      ...crudMessages["zh-Hans"][""],
    },
  },
};

interface Row {
  id: string;
  name: string;
}
interface FormValues {
  name: string;
}

const EMPTY_VALUES: FormValues = { name: "" };
const columns: TableColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];

/** 内存 CrudService：create 可脚本化捕获入参，用于断言超长值有没有打到后端。 */
function createHarnessService(record: Row, create: (input: unknown) => Promise<Row>) {
  const list = vi.fn(async () => ({ items: [record], totalCount: 1 }));
  const createMock = vi.fn(create);
  const service = createCrudService<Row, { name: string }, { name: string }>({
    useList: (params, options) =>
      useQuery({
        queryKey: ["identity-roles-max-length-test", params],
        queryFn: () => list(),
        ...options?.query,
      }),
    useCreate: (options) =>
      useMutation({
        mutationFn: (v: { data: { name: string } }) => createMock(v.data),
        ...options?.mutation,
      }),
    useUpdate: (options) =>
      useMutation({ mutationFn: () => Promise.resolve(record), ...options?.mutation }),
    useDelete: (options) =>
      useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
    listKey: () => ["identity-roles-max-length-test"],
    supportsFilter: false,
  });
  return { service, list, create: createMock };
}

/** identity/roles.tsx 的组合模式最小复刻：useAbpSheet + useAbpTable，schema 直接用页面
 * 导出的 `buildRoleSchema`，护栏挂真实产物，不复刻校验规则。 */
function Harness({ service }: { service: ReturnType<typeof createHarnessService>["service"] }) {
  const L = useLocalization();
  const roleSchema = buildRoleSchema(L);

  const sheet = useAbpSheet(service, {
    emptyValues: EMPTY_VALUES,
    toValues: (record: Row) => ({ name: record.name ?? "" }),
    toCreate: (value: FormValues) => ({ name: value.name }),
    toUpdate: (value: FormValues) => ({ name: value.name }),
    schema: () => roleSchema,
  });

  const t = useAbpTable(service, { columns, onOpen: sheet.open });

  return (
    <section>
      <t.Table />
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => <field.TextField label="Name" disabled={sheet.readOnly} />}
        </sheet.form.AppField>
      </sheet.Sheet>
    </section>
  );
}

describe("identity roles page: name max length", () => {
  it("blocks a name longer than the generated max and surfaces the max-length message", async () => {
    const record: Row = { id: "1", name: "editor" };
    const { service, create } = createHarnessService(record, async () => ({
      id: "2",
      name: "overflow",
    }));
    renderWithProviders(<Harness service={service} />, { identity: admin, messages });

    await screen.findByText("editor");
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    fireEvent.change(nameInput, {
      target: { value: "a".repeat(postApiIdentityRolesBodyNameMax + 1) },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText(`Up to ${postApiIdentityRolesBodyNameMax} characters`)).toBeDefined(),
    );
    expect(create).not.toHaveBeenCalled();
  });
});
