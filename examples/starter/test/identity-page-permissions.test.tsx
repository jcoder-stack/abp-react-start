// @vitest-environment jsdom
import type { Identity } from "@jcoder/abp-react/auth";
import { useLocalization, usePermissionChecker } from "@jcoder/abp-react/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { createCrudService } from "@/components/abp/crud/crud-service";
import adminMessages from "@/components/abp/permission/admin-messages.json";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { Button } from "@/components/ui/button";
import { renderWithProviders } from "./test-utils";

// identity/users.tsx/identity/roles.tsx 的行操作槽复刻：useAbpTable 自带的新增/编辑按钮走
// source.can.create/update（既有覆盖见 abp-table.test.tsx），本文件单独覆盖两页新增的门控点：
// 「权限」行操作按钮不走 source.can（那三个只对应 Create/Update/Delete），而是页面自己
// usePermissionChecker() 判 `<Resource>.ManagePermissions`，两条门控线互不影响的场景需要单独证明。
const messages = {
  en: {
    "": {
      ...tableMessages.en[""],
      ...formMessages.en[""],
      ...crudMessages.en[""],
      ...adminMessages.en[""],
    },
  },
  "zh-Hans": {
    "": {
      ...tableMessages["zh-Hans"][""],
      ...formMessages["zh-Hans"][""],
      ...crudMessages["zh-Hans"][""],
      ...adminMessages["zh-Hans"][""],
    },
  },
};

interface User {
  id: string;
  userName: string;
}

const service = createCrudService<User, { userName: string }, { userName: string }>({
  useList: (params, options) =>
    useQuery({
      queryKey: ["identity-users-permission-test", params],
      queryFn: async () => ({ items: [{ id: "1", userName: "alice" }], totalCount: 1 }),
      ...options?.query,
    }),
  useCreate: (options) =>
    useMutation({
      mutationFn: async () => ({ id: "2", userName: "bob" }),
      ...options?.mutation,
    }),
  useUpdate: (options) =>
    useMutation({
      mutationFn: async () => ({ id: "1", userName: "alice" }),
      ...options?.mutation,
    }),
  useDelete: (options) =>
    useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
  listKey: () => ["identity-users-permission-test"],
  policy: "AbpIdentity.Users",
});

const columns: TableColumnDef<User>[] = [{ accessorKey: "userName", header: "User" }];
const openNoop = () => {};

function Harness() {
  const L = useLocalization();
  const can = usePermissionChecker();
  const canManagePermissions = can("AbpIdentity.Users.ManagePermissions");
  const t = useAbpTable(service, {
    columns,
    onOpen: openNoop,
    row: {
      actions: () =>
        canManagePermissions ? (
          <Button variant="ghost" size="icon" aria-label={L("Admin:Permissions")}>
            {L("Admin:Permissions")}
          </Button>
        ) : null,
    },
  });
  return <t.Table />;
}

const baseIdentity: Identity = {
  isAuthenticated: true,
  user: { id: "1", userName: "admin", email: "admin@abp.io", roles: [] },
  tenant: null,
  grantedPolicies: {},
};

// 「全授予时三样都在」这条基线用例已删：下面两条各自的正向断言合起来把它覆盖满了，
// 「无 ManagePermissions」那条断言 create/edit 在场，「无 Create/Update」那条断言权限钮在场。
describe("identity page: row-action permission gating", () => {
  it("hides new/edit without .Create/.Update, independent of ManagePermissions", async () => {
    const identity: Identity = {
      ...baseIdentity,
      // 行点击默认开着，View 项不出现；额外授予 Delete 只是为了让 "···" 菜单非空以便展开，
      // 本用例真正断言的是 Edit 不随 Delete/ManagePermissions 出现，只认 Update。
      grantedPolicies: {
        "AbpIdentity.Users.ManagePermissions": true,
        "AbpIdentity.Users.Delete": true,
      },
    };
    renderWithProviders(<Harness />, { identity, messages });
    expect(await screen.findByText("alice")).toBeDefined();
    expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
    expect(screen.getByRole("button", { name: /permissions/i })).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: /edit/i })).toBeNull();
  });

  it("hides the Permissions row action without .ManagePermissions, independent of Create/Update", async () => {
    const identity: Identity = {
      ...baseIdentity,
      grantedPolicies: {
        "AbpIdentity.Users.Create": true,
        "AbpIdentity.Users.Update": true,
      },
    };
    renderWithProviders(<Harness />, { identity, messages });
    expect(await screen.findByText("alice")).toBeDefined();
    expect(screen.getByRole("button", { name: /create/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /permissions/i })).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: /edit/i })).toBeDefined();
  });
});
