// @vitest-environment jsdom
import type { ApplicationConfiguration } from "@jcoder-stack/abp-react/core";
import { AppConfigProvider } from "@jcoder-stack/abp-react/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { TooltipProvider } from "@/components/ui/tooltip";
import expandingMessages from "../ui/blocks/data-table-expanding/data-table-expanding-messages.json";
import type { ExpandingFeatures } from "../ui/blocks/data-table-expanding/expanding-features";
import {
  DataTableExpandAllButton,
  expandColumn,
  treeColumn,
} from "../ui/blocks/data-table-expanding/row-expander";
import { useExpandingDataTable } from "../ui/blocks/data-table-expanding/use-expanding-data-table";

const config: ApplicationConfiguration = {
  currentUser: { isAuthenticated: false, id: null, userName: null, tenantId: null, roles: [] },
  auth: { grantedPolicies: {} },
  setting: { values: {} },
  localization: {
    currentCulture: { name: "en" },
    languages: [{ cultureName: "en", displayName: "English" }],
    values: {},
  },
  currentTenant: { id: null, name: null, isAvailable: true },
  features: { values: {} },
};

const messages = {
  en: { "": { ...tableMessages.en[""], ...expandingMessages.en[""] } },
};

function renderWithLocalization(ui: ReactNode) {
  return render(
    <AppConfigProvider config={config} messages={messages} fallbackCulture="en">
      <TooltipProvider>{ui}</TooltipProvider>
    </AppConfigProvider>,
  );
}

interface Unit {
  id: string;
  name: string;
  children?: Unit[];
}

const units: Unit[] = [
  {
    id: "hq",
    name: "Headquarters",
    children: [
      { id: "rd", name: "R&D", children: [{ id: "fe", name: "Frontend" }] },
      { id: "ops", name: "Operations" },
    ],
  },
  { id: "branch", name: "Branch" },
];

const treeColumns: TableColumnDef<Unit, ExpandingFeatures>[] = [
  treeColumn<Unit>({ accessorKey: "name", header: "Name" }),
];

const treeOptions = { getSubRows: (row: Unit) => row.children };

function TreeHarness(props: { onRowClick?: (row: Unit) => void; selectable?: boolean }) {
  const [data, setData] = useState(units);
  const dt = useExpandingDataTable({
    columns: treeColumns,
    data,
    getRowId: (row) => row.id,
    selectable: props.selectable,
    tableOptions: treeOptions,
  });
  return (
    <>
      <button type="button" onClick={() => setData(structuredClone(units))}>
        refetch
      </button>
      <span data-testid="selected">{dt.getSelectedRows().length}</span>
      <dt.SelectedCount>{(count) => <span data-testid="count">{count}</span>}</dt.SelectedCount>
      <DataTable table={dt} onRowClick={props.onRowClick}>
        <DataTableToolbar table={dt} search={false}>
          <DataTableExpandAllButton table={dt} />
        </DataTableToolbar>
      </DataTable>
    </>
  );
}

const rowNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);

describe("树表", () => {
  it("初始只显示根节点，展开后子节点紧随父节点出现，按钮的 aria-expanded 跟着变", () => {
    renderWithLocalization(<TreeHarness />);
    expect(rowNames()).toEqual(["Headquarters", "Branch"]);

    const hqRow = screen.getByRole("row", { name: /Headquarters/ });
    const toggle = within(hqRow).getByRole("button", { name: "Expand row" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(rowNames()).toEqual(["Headquarters", "R&D", "Operations", "Branch"]);
    expect(
      within(hqRow).getByRole("button", { name: "Collapse row" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("叶子节点没有展开钮", () => {
    renderWithLocalization(<TreeHarness />);
    const branchRow = screen.getByRole("row", { name: /Branch/ });
    expect(within(branchRow).queryByRole("button")).toBeNull();
  });

  it("点展开钮、在展开钮上按 Enter 都不会触发行点击", () => {
    const onRowClick = vi.fn();
    renderWithLocalization(<TreeHarness onRowClick={onRowClick} />);
    const toggle = screen.getByRole("button", { name: "Expand row" });
    fireEvent.click(toggle);
    fireEvent.keyDown(screen.getByRole("button", { name: "Collapse row" }), { key: "Enter" });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("全部展开铺开所有层级，再点一次全部收起", () => {
    renderWithLocalization(<TreeHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(rowNames()).toEqual(["Headquarters", "R&D", "Frontend", "Operations", "Branch"]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(rowNames()).toEqual(["Headquarters", "Branch"]);
  });

  it("勾选的子行在 refetch 换来新数组后仍保持选中", () => {
    renderWithLocalization(<TreeHarness selectable />);
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    // 选叶子：勾父节点会按 TanStack 缺省连带选中子孙，计数就不是 1 了
    const opsRow = screen.getByRole("row", { name: /Operations/ });
    fireEvent.click(within(opsRow).getByRole("checkbox", { name: "Select row" }));
    expect(screen.getByTestId("count").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "refetch" }));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});

interface Order {
  id: string;
  code: string;
  total: number;
}

const orders: Order[] = [
  { id: "o1", code: "SO-001", total: 120 },
  { id: "o2", code: "SO-002", total: 80 },
];

const detailColumns: TableColumnDef<Order, ExpandingFeatures>[] = [
  expandColumn<Order>(),
  { accessorKey: "code", header: "Code" },
  { accessorKey: "total", header: "Total" },
];

const detailOptions = { getRowCanExpand: () => true };

function DetailHarness() {
  const state = useDataTableState();
  const dt = useExpandingDataTable({
    state,
    columns: detailColumns,
    data: orders,
    getRowId: (row) => row.id,
    pageCount: 2,
    tableOptions: detailOptions,
  });
  return (
    <>
      <button type="button" onClick={() => dt.table.nextPage()}>
        next-page
      </button>
      <DataTable
        table={dt}
        renderSubRow={(row) => (row.getIsExpanded() ? <p>Lines of {row.original.code}</p> : null)}
      />
    </>
  );
}

describe("折叠详情", () => {
  it("展开后在该行下方插入一行通栏详情，colSpan 等于可见列数", () => {
    renderWithLocalization(<DetailHarness />);
    expect(screen.queryByText("Lines of SO-001")).toBeNull();

    const row = screen.getByRole("row", { name: /SO-001/ });
    fireEvent.click(within(row).getByRole("button", { name: "Expand row" }));

    const detail = screen.getByText("Lines of SO-001");
    expect(detail.closest("td")?.getAttribute("colspan")).toBe("3");
    expect(rowNames()).toEqual(["SO-001120", "Lines of SO-001", "SO-00280"]);
  });

  it("翻页后展开态清空", () => {
    renderWithLocalization(<DetailHarness />);
    const row = screen.getByRole("row", { name: /SO-001/ });
    fireEvent.click(within(row).getByRole("button", { name: "Expand row" }));
    expect(screen.getByText("Lines of SO-001")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "next-page" }));
    expect(screen.queryByText("Lines of SO-001")).toBeNull();
  });
});
