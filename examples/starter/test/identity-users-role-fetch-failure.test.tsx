// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureAbpMutator, resetAbpMutator } from "@/api/mutator";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { Route } from "@/routes/_layout/_authed/identity/users";
import { admin, renderWithProviders } from "./test-utils";

// 渲染真实的 users 页面（Route.options.component 就是 users.tsx 的 UsersPage），端点只在
// abpMutator 的 fetchFn 这一层假装，sheet 状态机、toValues、AbpTable 的行点击全是真件。
// `@/auth` 必须 mock：它的 index 会拉进 server-fns（createServerFn），在 vitest 下解析不了
// `#tanstack-router-entry`；requirePermission 只出现在 beforeLoad，本用例根本不执行它。
vi.mock("@/auth", () => ({ requirePermission: () => () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

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

const USER = { id: "1", userName: "alice", email: "alice@abp.io", isActive: true };

/** 列表正常返回，角色 GET 500，复现「记录还在但关联查询挂了」这条真实抖动。 */
function startFakeBackend() {
  const rolesRequests: string[] = [];
  configureAbpMutator({
    fetchFn: async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/roles")) {
        rolesRequests.push(url.pathname);
        return new Response(JSON.stringify({ error: { message: "boom" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/api/identity/users") {
        return new Response(JSON.stringify({ items: [USER], totalCount: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    },
  });
  return rolesRequests;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  resetAbpMutator();
});

describe("identity users page: the roles GET behind opening a record", () => {
  it("keeps the sheet shut and reports the failure when the roles GET rejects", async () => {
    const rolesRequests = startFakeBackend();
    const UsersPage = Route.options.component;
    if (!UsersPage) throw new Error("users route has no component");
    renderWithProviders(<UsersPage />, { identity: admin, messages });

    // 点行开详情（AbpTable 默认行为），onOpen 是 fire-and-forget，toValues 的 rejection
    // 没有外层接手，只能靠页面自己兜住。
    fireEvent.click(await screen.findByText("alice"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Operation failed"));
    expect(rolesRequests).toEqual(["/api/identity/users/1/roles"]);
    // toValues 返回 null 才拦得住打开；改成返回空对象/空角色，抽屉会带着空 roleNames 弹出，
    // 用户一保存就把这个人的角色清光。
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
