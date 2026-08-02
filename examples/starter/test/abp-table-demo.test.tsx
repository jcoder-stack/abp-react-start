// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { AbpTableDemo } from "@/routes/-showcase/abp-table-demo";
import { anonymous, renderWithProviders } from "./test-utils";

// 落地页的 abp-table 演示随 app-shell 块分发进每个 jc-abp init 出来的项目，且匿名可见，
// 它自带的内存数据源要真按 ABP 列表协议分页/筛选，坏了不会有任何后端报错兜底。
// 只覆盖读路径：数据源是模块级可变数组，增删改会跨用例串味。写路径的框架侧契约由
// crud-flow.test.tsx 与 bulk-delete.test.tsx 覆盖。
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

describe("landing abp-table demo", () => {
  it("匿名访客就能看到首页数据，且按 MaxResultCount 切片", async () => {
    renderWithProviders(<AbpTableDemo />, { identity: anonymous, messages });

    // 种子 7 条、每页 5 条：首页只出前 5 条，第 6/7 条不在 DOM 里。
    expect(await screen.findByText("1984")).toBeDefined();
    expect(screen.getByText("I, Robot")).toBeDefined();
    expect(screen.queryByText("Animal Farm")).toBeNull();
  });

  it("搜索按 Filter 落到数据源，作者名也能命中", async () => {
    renderWithProviders(<AbpTableDemo />, { identity: anonymous, messages });
    await screen.findByText("1984");

    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "asimov" } });

    // 防抖后重新取数：只剩 Isaac Asimov 的两本。
    await waitFor(() => expect(screen.queryByText("1984")).toBeNull());
    expect(screen.getByText("Foundation")).toBeDefined();
    expect(screen.getByText("I, Robot")).toBeDefined();
    // 非 Asimov 的书全部离场，说明过滤发生在数据源而不是客户端补丁。
    expect(screen.queryByText("Pride and Prejudice")).toBeNull();
  });
});
