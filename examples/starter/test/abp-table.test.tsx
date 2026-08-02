// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { type AbpTableRowConfig, useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

// t.Table 渲染 Table:/Crud:/Form: 三组词条，"" 桶逐 culture 合并
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

const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Name" }];

/** 假数据源：`useAbpTable` 的回调分支，绕开 service/react-query，直接摆出 `AbpTableSource`。 */
function makeSource(
  over: Partial<AbpTableSource<Book>> = {},
): (params: Record<string, unknown>) => AbpTableSource<Book> {
  return (_params) => ({
    listQuery: {
      data: { items: [{ id: "1", name: "DDD" }], totalCount: 1 },
      isPending: false,
      isFetching: false,
      isError: false,
    },
    pageCount: 1,
    totalCount: 1,
    delete: { mutate: vi.fn() },
    can: { create: true, update: true, delete: true },
    supportsFilter: true,
    ...over,
  });
}

// 批量条的计数把数字单独包了一层做高亮（"2" 着色），整串文本因此分散在多个节点里；
// 用「自身文本匹配、且子节点都不匹配」的函数匹配器取到最内层那个元素。
const selectedText = (n: number) => (_content: string, node: Element | null) => {
  const norm = (el: Element | null) => el?.textContent?.replace(/\s+/g, " ").trim();
  const target = `${n} selected`;
  if (norm(node) !== target) return false;
  return !Array.from(node?.children ?? []).some((c) => norm(c) === target);
};

describe("AbpTable error state", () => {
  function ErrorHarness(props: { refetch?: () => void }) {
    const t = useAbpTable(
      makeSource({
        listQuery: {
          data: undefined,
          isPending: false,
          isFetching: false,
          isError: true,
          refetch: props.refetch,
        },
      }),
      { columns, onOpen: vi.fn() },
    );
    return (
      <t.Table>
        <t.QueryForm>
          <span data-testid="qf-field" />
        </t.QueryForm>
      </t.Table>
    );
  }

  it("keeps the query field reachable so the user can undo the query that broke it", async () => {
    renderWithProviders(<ErrorHarness />, { messages });

    // 错误摘要出现（说明确实进了 isError 分支）
    expect(await screen.findByText("Operation failed")).toBeDefined();
    // 自救路径在位：报错态同样保留筛选钮，点开就能改掉那个触发 400 的筛选值
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByTestId("qf-field")).toBeDefined();
  });

  it("offers a Retry button in the error state that refetches with the same params", async () => {
    const refetch = vi.fn();
    renderWithProviders(<ErrorHarness refetch={refetch} />, { messages });

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("AbpTable create button gating", () => {
  function CreateGateHarness(props: { canCreate: boolean }) {
    const t = useAbpTable(
      makeSource({ can: { create: props.canCreate, update: true, delete: true } }),
      {
        columns,
        onOpen: vi.fn(),
      },
    );
    return <t.Table />;
  }

  // 正向（有 create 能力就出按钮）由 "AbpTable default assembly" 覆盖，那条用例的 source
  // 同样是 can.create=true + onOpen 在场，且一并断言搜索框与列菜单。这里只留反向门控。
  it("hides the create button without the create capability", async () => {
    renderWithProviders(<CreateGateHarness canCreate={false} />, { messages });
    expect(await screen.findByText("DDD")).toBeDefined();
    expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
  });
});

describe("AbpTable action column conditions", () => {
  function RowActionsHarness(props: {
    can?: Partial<AbpTableSource<Book>["can"]>;
    onOpen?: (mode: string, r?: Book) => void;
    row?: AbpTableRowConfig<Book>;
    deleteMutate?: (id: string) => void;
  }) {
    const t = useAbpTable(
      makeSource({
        can: { create: true, update: true, delete: true, ...props.can },
        delete: { mutate: props.deleteMutate ?? vi.fn() },
      }),
      { columns, onOpen: props.onOpen, row: props.row },
    );
    return <t.Table />;
  }

  it("shows the overflow trigger and an Edit item when update is granted", async () => {
    renderWithProviders(<RowActionsHarness onOpen={vi.fn()} />, { messages });
    expect(await screen.findByText("DDD")).toBeDefined();
    // Radix DropdownMenuTrigger 只在 onPointerDown 上开合，不监听 onClick
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeDefined();
  });

  it("hides the Edit item without the update policy", async () => {
    renderWithProviders(
      <RowActionsHarness onOpen={vi.fn()} can={{ update: false, delete: true }} />,
      { messages },
    );
    expect(await screen.findByText("DDD")).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    // Delete 存在证明菜单确实展开了；Edit 缺席才是本用例要证明的。
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
  });

  it("keeps View out of the menu while row click opens the detail, shows it once click is disabled", async () => {
    const { unmount } = renderWithProviders(<RowActionsHarness onOpen={vi.fn()} />, { messages });
    expect(await screen.findByText("DDD")).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    expect(screen.queryByRole("menuitem", { name: "View" })).toBeNull();
    unmount();

    renderWithProviders(<RowActionsHarness onOpen={vi.fn()} row={{ click: false }} />, {
      messages,
    });
    expect(await screen.findByText("DDD")).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: "View" })).toBeDefined();
  });

  it("hides the Delete item when row.delete is false", async () => {
    renderWithProviders(<RowActionsHarness onOpen={vi.fn()} row={{ delete: false }} />, {
      messages,
    });
    expect(await screen.findByText("DDD")).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  it("opens a confirm dialog from the Delete item and calls source.delete.mutate on confirm", async () => {
    const deleteMutate = vi.fn();
    renderWithProviders(<RowActionsHarness onOpen={vi.fn()} deleteMutate={deleteMutate} />, {
      messages,
    });
    expect(await screen.findByText("DDD")).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Confirm deletion")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteMutate).toHaveBeenCalledWith("1");
  });
});

describe("AbpTable bulk bar", () => {
  function BulkHarness() {
    const t = useAbpTable(
      makeSource({
        listQuery: {
          data: {
            items: [
              { id: "1", name: "Alpha" },
              { id: "2", name: "Beta" },
            ],
            totalCount: 2,
          },
          isPending: false,
          isFetching: false,
          isError: false,
        },
        totalCount: 2,
      }),
      { columns, selectable: true },
    );
    return (
      <t.Table>
        <t.BulkBar>
          <button type="button">export</button>
        </t.BulkBar>
      </t.Table>
    );
  }

  it("hides the bulk bar until a row is selected, then shows count + slot content, and Clear dismisses it", async () => {
    renderWithProviders(<BulkHarness />, { messages });
    expect(await screen.findByText("Alpha")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

    const checks = await screen.findAllByRole("checkbox");
    fireEvent.click(checks[0]); // 表头全选 → 2 行
    expect(await screen.findByText(selectedText(2))).toBeDefined();
    expect(screen.getByRole("button", { name: "export" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(selectedText(2))).toBeNull();
    expect(screen.queryByRole("button", { name: "export" })).toBeNull();
  });
});

describe("AbpTable default assembly", () => {
  it("renders the search box, create button, and columns menu when t.Table has no children", async () => {
    function DefaultHarness() {
      const t = useAbpTable(makeSource(), { columns, onOpen: vi.fn() });
      return <t.Table />;
    }
    renderWithProviders(<DefaultHarness />, { messages });

    expect(await screen.findByText("DDD")).toBeDefined();
    expect(screen.getByPlaceholderText("Search…")).toBeDefined();
    expect(screen.getByRole("button", { name: /create/i })).toBeDefined();
    expect(screen.getByRole("button", { name: "Columns" })).toBeDefined();
  });
});

describe("AbpTable onExport", () => {
  function ExportHarness(props: { onExport?: () => void }) {
    const t = useAbpTable(makeSource(), { columns, onExport: props.onExport });
    return <t.Table />;
  }

  it("renders the Export icon only when onExport is wired, and forwards clicks to it", async () => {
    const onExport = vi.fn();
    renderWithProviders(<ExportHarness onExport={onExport} />, { messages });

    expect(await screen.findByText("DDD")).toBeDefined();
    const exportButton = screen.getByRole("button", { name: "Export" });
    fireEvent.click(exportButton);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("omits the Export icon when onExport is not passed", async () => {
    renderWithProviders(<ExportHarness />, { messages });
    expect(await screen.findByText("DDD")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
});

describe("AbpTable slot recognition", () => {
  // t.QueryForm 槽的识别（字段进面板、搜索框让位、内建 Query 按钮出现）由 query-form.test.tsx
  // 的 "t.QueryForm shell" 两条用例覆盖，它们走的是同一条 t.Table → 槽识别路径，且额外验证了
  // 再次收起后搜索框回来。这里只留「不认识的子节点要喊」这条本描述块独有的分支。
  it("devWarns once on an unrecognized direct child of t.Table", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    function UnknownChildHarness() {
      const t = useAbpTable(makeSource(), { columns });
      return (
        <t.Table>
          <div>unrecognized</div>
        </t.Table>
      );
    }
    renderWithProviders(<UnknownChildHarness />, { messages });
    await screen.findByText("DDD");

    const hits = warn.mock.calls.filter((c) => String(c[0]).includes("t.Table"));
    expect(hits).toHaveLength(1);

    warn.mockRestore();
  });
});

describe("AbpTable bound member identity", () => {
  it("keeps the QueryForm input focused across two unrelated state changes", async () => {
    function IdentityHarness() {
      const [, setBump] = useState(0);
      const t = useAbpTable(makeSource(), { columns });
      return (
        <div>
          <button type="button" onClick={() => setBump((b) => b + 1)}>
            bump
          </button>
          <t.Table>
            <t.QueryForm>
              <input data-testid="qf-input" />
            </t.QueryForm>
          </t.Table>
        </div>
      );
    }
    renderWithProviders(<IdentityHarness />, { messages });

    fireEvent.click(await screen.findByRole("button", { name: "Filters" }));
    const input = screen.getByTestId("qf-input");
    input.focus();
    fireEvent.click(screen.getByRole("button", { name: "bump" }));
    fireEvent.click(screen.getByRole("button", { name: "bump" }));

    expect(document.activeElement).toBe(input);
  });
});
