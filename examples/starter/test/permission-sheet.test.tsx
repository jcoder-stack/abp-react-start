// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useGetApiPermissionManagementPermissions as useGetPermissionsMock,
  usePutApiPermissionManagementPermissions as usePutPermissionsMock,
} from "@/api/endpoints/permissions/permissions";
import type {
  VoloAbpPermissionManagementGetPermissionListResultDto,
  VoloAbpPermissionManagementPermissionGrantInfoDto,
} from "@/api/models";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import adminMessages from "@/components/abp/permission/admin-messages.json";
import {
  applyCheck,
  buildPermissionTree,
  lockedNames,
  type PermissionLike,
  toggleGroup,
} from "@/components/abp/permission/permission-helpers";
import { PermissionSheet } from "@/components/abp/permission/permission-sheet";
import formMessages from "@/components/form/form-messages.json";
import treeMessages from "@/components/tree/tree-messages.json";
import { renderWithProviders } from "./test-utils";

vi.mock("@/api/endpoints/permissions/permissions", () => ({
  useGetApiPermissionManagementPermissions: vi.fn(),
  usePutApiPermissionManagementPermissions: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const messages = {
  en: {
    "": {
      ...treeMessages.en[""],
      ...formMessages.en[""],
      ...crudMessages.en[""],
      ...adminMessages.en[""],
    },
  },
  "zh-Hans": {
    "": {
      ...treeMessages["zh-Hans"][""],
      ...formMessages["zh-Hans"][""],
      ...crudMessages["zh-Hans"][""],
      ...adminMessages["zh-Hans"][""],
    },
  },
};

function permission(
  overrides: Partial<VoloAbpPermissionManagementPermissionGrantInfoDto> & { name: string },
): VoloAbpPermissionManagementPermissionGrantInfoDto {
  return {
    displayName: overrides.name,
    parentName: null,
    isGranted: false,
    allowedProviders: ["R", "U"],
    grantedProviders: [],
    isEditable: true,
    ...overrides,
  };
}

/**
 * 两组权限：Identity 组含父子（Users → Users.Create/Users.Delete），Users.Delete 已被 Role
 * provider（"R"）授予，用于 lockedNames/disabled 断言；Tenant 组为独立单节点。
 */
const GET_RESULT: VoloAbpPermissionManagementGetPermissionListResultDto = {
  entityDisplayName: null,
  groups: [
    {
      name: "Identity",
      displayName: "Identity Management",
      permissions: [
        permission({ name: "Identity.Users", displayName: "Users" }),
        permission({
          name: "Identity.Users.Create",
          displayName: "Create",
          parentName: "Identity.Users",
        }),
        permission({
          name: "Identity.Users.Delete",
          displayName: "Delete",
          parentName: "Identity.Users",
          isGranted: true,
          grantedProviders: [{ providerName: "R", providerKey: "admin" }],
        }),
      ],
    },
    {
      name: "Tenant",
      displayName: "Tenant Management",
      permissions: [permission({ name: "Tenant.Manage", displayName: "Manage" })],
    },
  ],
};

type GetQuery = ReturnType<typeof useGetPermissionsMock>;
type PutMutation = ReturnType<typeof usePutPermissionsMock>;

function mockQuery(overrides: Partial<GetQuery>): GetQuery {
  return { data: undefined, isPending: false, ...overrides } as unknown as GetQuery;
}

function mockMutation(overrides: Partial<PutMutation>): PutMutation {
  return { mutate: vi.fn(), isPending: false, ...overrides } as unknown as PutMutation;
}

const mockUseGet = vi.mocked(useGetPermissionsMock);
const mockUsePut = vi.mocked(usePutPermissionsMock);

function renderSheet(propsOverride: Partial<Parameters<typeof PermissionSheet>[0]> = {}) {
  const onOpenChange = vi.fn();
  const utils = renderWithProviders(
    <PermissionSheet
      providerName="U"
      providerKey="user-1"
      open
      onOpenChange={onOpenChange}
      title="Permissions"
      {...propsOverride}
    />,
    { messages },
  );
  return { onOpenChange, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGet.mockReturnValue(mockQuery({ data: GET_RESULT }));
  mockUsePut.mockReturnValue(mockMutation({}));
});

describe("permission-helpers: buildPermissionTree", () => {
  it("builds a two-level parent/child tree from parentName, label = displayName", () => {
    const permissions: PermissionLike[] = [
      permission({ name: "Root", displayName: "Root label" }),
      permission({ name: "Root.Child", displayName: "Child label", parentName: "Root" }),
    ];
    expect(buildPermissionTree(permissions)).toEqual([
      {
        id: "Root",
        label: "Root label",
        children: [{ id: "Root.Child", label: "Child label" }],
      },
    ]);
  });

  it("treats permissions with no parentName as roots, in input order", () => {
    const permissions: PermissionLike[] = [
      permission({ name: "A", displayName: "A" }),
      permission({ name: "B", displayName: "B" }),
    ];
    expect(buildPermissionTree(permissions).map((n) => n.id)).toEqual(["A", "B"]);
  });
});

describe("permission-helpers: applyCheck (ABP cascade)", () => {
  const permissions: PermissionLike[] = [
    permission({ name: "Root", displayName: "Root" }),
    permission({ name: "Root.Child", displayName: "Child", parentName: "Root" }),
    permission({
      name: "Root.Child.Grandchild",
      displayName: "Grandchild",
      parentName: "Root.Child",
    }),
  ];

  it("checking a leaf forces its entire parent chain checked too", () => {
    const result = applyCheck(new Set(), permissions, "Root.Child.Grandchild", true);
    expect(result).toEqual(new Set(["Root.Child.Grandchild", "Root.Child", "Root"]));
  });

  it("unchecking a parent clears its whole subtree, not just itself", () => {
    const fullyChecked = new Set(["Root", "Root.Child", "Root.Child.Grandchild"]);
    const result = applyCheck(fullyChecked, permissions, "Root", false);
    expect(result.size).toBe(0);
  });

  it("checking a parent alone does not force-check its children (parent = precondition, not cascade-down)", () => {
    const result = applyCheck(new Set(), permissions, "Root", true);
    expect(result).toEqual(new Set(["Root"]));
  });

  it("unchecking a leaf only removes the leaf, leaving its ancestors checked", () => {
    const fullyChecked = new Set(["Root", "Root.Child", "Root.Child.Grandchild"]);
    const result = applyCheck(fullyChecked, permissions, "Root.Child.Grandchild", false);
    expect(result).toEqual(new Set(["Root", "Root.Child"]));
  });

  it("unchecking a parent skips locked descendants when clearing the subtree", () => {
    const fullyChecked = new Set(["Root", "Root.Child", "Root.Child.Grandchild"]);
    const locked = new Set(["Root.Child.Grandchild"]);
    const result = applyCheck(fullyChecked, permissions, "Root", false, locked);
    expect(result).toEqual(new Set(["Root.Child.Grandchild"]));
  });
});

describe("permission-helpers: toggleGroup", () => {
  const groupPermissions: PermissionLike[] = [
    permission({ name: "G.A", displayName: "A" }),
    permission({ name: "G.B", displayName: "B" }),
  ];

  it("checking the group adds every permission in that group", () => {
    expect(toggleGroup(new Set(), groupPermissions, true)).toEqual(new Set(["G.A", "G.B"]));
  });

  it("unchecking the group only removes that group's names, leaving unrelated names untouched", () => {
    const state = new Set(["G.A", "G.B", "Other.Name"]);
    expect(toggleGroup(state, groupPermissions, false)).toEqual(new Set(["Other.Name"]));
  });

  it("unchecking the group ('select none') keeps locked members in checked", () => {
    const state = new Set(["G.A", "G.B"]);
    const locked = new Set(["G.B"]);
    expect(toggleGroup(state, groupPermissions, false, locked)).toEqual(new Set(["G.B"]));
  });

  it("checking the group ('select all') does not force a locked, not-yet-checked member in — locked means unchanged", () => {
    const locked = new Set(["G.B"]);
    expect(toggleGroup(new Set(), groupPermissions, true, locked)).toEqual(new Set(["G.A"]));
  });
});

// toUpdatePayload 的单测已删：PermissionSheet 的 "save submits the full permission payload and
// closes the sheet on success" 断言的正是它的完整输出：4 条权限一条不少、未勾选的也带
// isGranted:false，且走的是真实 PUT 变量，比孤立调用函数更强。

describe("permission-helpers: lockedNames", () => {
  it("locks a granted permission whose grantedProviders include a different provider", () => {
    const permissions: PermissionLike[] = [
      permission({
        name: "A",
        isGranted: true,
        grantedProviders: [{ providerName: "R", providerKey: "admin" }],
      }),
    ];
    expect(lockedNames(permissions, "U")).toEqual(new Set(["A"]));
  });

  it("does not lock when the only granting provider is the current one", () => {
    const permissions: PermissionLike[] = [
      permission({
        name: "A",
        isGranted: true,
        grantedProviders: [{ providerName: "U", providerKey: "user-1" }],
      }),
    ];
    expect(lockedNames(permissions, "U").size).toBe(0);
  });

  it("does not lock an ungranted permission even if grantedProviders lists another provider", () => {
    const permissions: PermissionLike[] = [
      permission({
        name: "A",
        isGranted: false,
        grantedProviders: [{ providerName: "R", providerKey: "admin" }],
      }),
    ];
    expect(lockedNames(permissions, "U").size).toBe(0);
  });
});

describe("PermissionSheet", () => {
  it("shows a loading skeleton while the permission query is pending", async () => {
    mockUseGet.mockReturnValue(mockQuery({ data: undefined, isPending: true }));
    renderSheet();
    expect(await screen.findByTestId("permission-sheet-skeleton")).toBeDefined();
  });

  it("queries with the sheet's provider/key and only enables while open", async () => {
    renderSheet({ open: false });
    // 路由挂载是异步的（RouterProvider 的过渡态），组件（进而 hook 调用）在首个同步 tick 之后才落地。
    await waitFor(() =>
      expect(mockUseGet).toHaveBeenCalledWith(
        { providerName: "U", providerKey: "user-1" },
        { query: { enabled: false } },
      ),
    );
  });

  it("renders each group as an accordion item", async () => {
    renderSheet();
    expect(await screen.findByText("Identity Management")).toBeDefined();
    expect(screen.getByText("Tenant Management")).toBeDefined();
  });

  it("checking a leaf in the tree cascades the check up through its parent chain", async () => {
    renderSheet();
    const leaf = await screen.findByTestId("tree-checkbox-Identity.Users.Create");
    fireEvent.click(leaf);
    expect(leaf.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("tree-checkbox-Identity.Users").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("disables the checkbox for a permission granted by a different provider", async () => {
    renderSheet();
    const lockedCheckbox = await screen.findByTestId("tree-checkbox-Identity.Users.Delete");
    expect((lockedCheckbox as HTMLButtonElement).disabled).toBe(true);
  });

  it("the group's select-all checkbox checks every permission in that group", async () => {
    renderSheet();
    const selectAll = await screen.findByTestId("permission-group-select-all-Identity");
    fireEvent.click(selectAll);
    expect(screen.getByTestId("tree-checkbox-Identity.Users").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(
      screen.getByTestId("tree-checkbox-Identity.Users.Create").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("surfaces a failed save instead of closing silently", async () => {
    const { toast } = await import("sonner");
    // 保存失败时若无 onError，抽屉停在原地且零提示。用户会以为没点到而反复点击。
    const mutate = vi.fn((_vars: unknown, opts?: { onError?: (e: unknown) => void }) =>
      opts?.onError?.(new Error("403")),
    );
    mockUsePut.mockReturnValue(mockMutation({ mutate }));
    const { onOpenChange } = renderSheet();

    await screen.findByTestId("tree-checkbox-Identity.Users.Create");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("unchecking a parent that cascades to a locked child keeps the locked child granted in the save payload", async () => {
    const { toast } = await import("sonner");
    const mutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    mockUsePut.mockReturnValue(mockMutation({ mutate }));
    renderSheet();

    // Identity.Users.Delete 已被 "R" provider 锁定授予；先勾 Create 让父链级联勾上 Users，
    // 再取消 Users，正常应清空整个子树，但 Delete 是锁定项，不应被这一步的取消动作波及。
    const createLeaf = await screen.findByTestId("tree-checkbox-Identity.Users.Create");
    fireEvent.click(createLeaf);
    const parentNode = screen.getByTestId("tree-checkbox-Identity.Users");
    expect(parentNode.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(parentNode);
    // Users 自身被清出 checked，但锁定的 Delete 仍留在子树里，Users 因此是「部分勾选」而非「全不选」。
    expect(parentNode.getAttribute("aria-checked")).toBe("mixed");
    expect(createLeaf.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByTestId("tree-checkbox-Identity.Users.Delete").getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const [vars] = mutate.mock.calls[0] as [
      { data: { permissions: { name: string; isGranted: boolean }[] }; params: unknown },
      unknown,
    ];
    expect(vars.data.permissions).toEqual(
      expect.arrayContaining([
        { name: "Identity.Users", isGranted: false },
        { name: "Identity.Users.Create", isGranted: false },
        { name: "Identity.Users.Delete", isGranted: true },
      ]),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("save submits the full permission payload and closes the sheet on success", async () => {
    const { toast } = await import("sonner");
    const mutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    mockUsePut.mockReturnValue(mockMutation({ mutate }));
    const { onOpenChange } = renderSheet();

    await screen.findByText("Identity Management");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [vars] = mutate.mock.calls[0] as [
      { data: { permissions: { name: string; isGranted: boolean }[] }; params: unknown },
      unknown,
    ];
    expect(vars.params).toEqual({ providerName: "U", providerKey: "user-1" });
    expect(vars.data.permissions).toHaveLength(4);
    expect(vars.data.permissions).toEqual(
      expect.arrayContaining([
        { name: "Identity.Users", isGranted: false },
        { name: "Identity.Users.Create", isGranted: false },
        { name: "Identity.Users.Delete", isGranted: true },
        { name: "Tenant.Manage", isGranted: false },
      ]),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalled();
  });
});
