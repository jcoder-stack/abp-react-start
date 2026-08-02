// @vitest-environment jsdom
import { useMutation, useQuery } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { admin, renderWithProviders } from "./test-utils";

// 独立成文件而非跟其他用例挤在 abp-table.test.tsx：devWarn 的去重是模块级单例 Set，同文件内
// 只要有别的用例先触发过 "data-table:columns-churn" 就会把这条用例的告警配额提前消费掉，
// 让它在 bug 在场时也显示为通过（见本文件锁的 I1 回归）。vitest 按文件隔离，独立文件才能
// 拿到全新的 devWarn 模块实例。
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

interface Book {
  id: string;
  name: string;
}

const list = vi.fn(async () => ({ items: [{ id: "1", name: "DDD" }], totalCount: 1 }));
const create = vi.fn(async () => ({ id: "2", name: "n" }));
const del = vi.fn(async (_vars: { id: string }) => {});

const service = createCrudService<Book, { name: string }, { name: string }>({
  useList: (params, options) =>
    useQuery({ queryKey: ["churn-books", params], queryFn: () => list(), ...options?.query }),
  useCreate: (options) => useMutation({ mutationFn: () => create(), ...options?.mutation }),
  useUpdate: (options) =>
    useMutation({ mutationFn: () => Promise.resolve(), ...options?.mutation }),
  useDelete: (options) =>
    useMutation({ mutationFn: (vars: { id: string }) => del(vars), ...options?.mutation }),
  listKey: () => ["churn-books"],
  policy: "App.Books",
});

const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Name" }];

/** 引用必须稳定：onOpen 进 useAbpTable 内部 columns memo 的依赖，内联箭头每渲染新引用
 * 会让这条用例本身先制造出它要证伪的那种 churn。 */
const openNoop = () => {};

describe("useAbpTable columns memo (I1 regression)", () => {
  it("keeps the columns identity stable across forced re-renders with update/delete granted", async () => {
    // 锁 I1：deleteMutation 的 memo 键若挂回 raw mutation 对象（每渲染新身份），
    // rowActionsSrc → columns 整条 memo 链失效，data-table 的 churn 告警会在四个真实
    // 页面（都授予了 update/delete）上误报。columns 用模块级稳定引用，bump 强制父级
    // 重渲染若干次，churn 告警不应出现。
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function ChurnHarness() {
      const [, setBump] = useState(0);
      const t = useAbpTable(service, { columns, onOpen: openNoop });
      return (
        <>
          <button type="button" onClick={() => setBump((b) => b + 1)}>
            bump
          </button>
          <t.Table />
        </>
      );
    }

    const perms = {
      ...admin,
      grantedPolicies: { "App.Books.Update": true, "App.Books.Delete": true },
    };
    renderWithProviders(<ChurnHarness />, { identity: perms, messages });

    expect(await screen.findByText("DDD")).toBeDefined();
    const bump = screen.getByRole("button", { name: "bump" });
    fireEvent.click(bump);
    fireEvent.click(bump);
    fireEvent.click(bump);
    fireEvent.click(bump);

    const hits = warn.mock.calls.filter((c) => String(c[0]).includes("columns"));
    expect(hits).toHaveLength(0);

    warn.mockRestore();
  });
});
