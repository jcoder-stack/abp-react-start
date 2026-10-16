// @vitest-environment jsdom
import type { ApplicationConfiguration } from "@jcoder-stack/abp-react/core";
import { AppConfigProvider } from "@jcoder-stack/abp-react/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { type AbpTableRowConfig, useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import expandingMessages from "../ui/blocks/data-table-expanding/data-table-expanding-messages.json";
import {
  type ExpandingFeatures,
  expandingFeatures,
} from "../ui/blocks/data-table-expanding/expanding-features";
import {
  DataTableExpandAllButton,
  expandColumn,
  treeColumn,
} from "../ui/blocks/data-table-expanding/row-expander";
import { useCollapseOnScopeChange } from "../ui/blocks/data-table-expanding/use-expanding-data-table";

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
  en: { "": { ...tableMessages.en[""], ...crudMessages.en[""], ...expandingMessages.en[""] } },
};

function renderWithLocalization(ui: ReactNode) {
  return render(
    <AppConfigProvider config={config} messages={messages} fallbackCulture="en">
      <TooltipProvider>{ui}</TooltipProvider>
    </AppConfigProvider>,
  );
}

/** 全量拉取的只读源：树按根节点分页，总数只算根。 */
function staticSource<TDto>(items: TDto[], pageCount = 1) {
  return (): AbpTableSource<TDto> => ({
    listQuery: {
      data: { items, totalCount: items.length },
      isPending: false,
      isFetching: false,
      isError: false,
    },
    pageCount,
    totalCount: items.length,
    can: { create: false, update: false, delete: false },
    supportsFilter: false,
  });
}

const rowNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);

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
const unitSource = staticSource(units);

function TreeHarness(props: { onOpen?: (mode: "create" | "edit" | "view", u?: Unit) => void }) {
  const t = useAbpTable(unitSource, {
    columns: treeColumns,
    features: expandingFeatures,
    tableOptions: treeOptions,
    onOpen: props.onOpen,
  });
  useCollapseOnScopeChange(t);
  return (
    <t.Table>
      <t.Toolbar>
        <DataTableExpandAllButton table={t} />
      </t.Toolbar>
    </t.Table>
  );
}

describe("useAbpTable 树表", () => {
  it("初始只显示根节点，展开后子节点紧随父节点出现", () => {
    renderWithLocalization(<TreeHarness />);
    expect(rowNames()).toEqual(["Headquarters", "Branch"]);

    const hqRow = screen.getByRole("row", { name: /Headquarters/ });
    fireEvent.click(within(hqRow).getByRole("button", { name: "Expand row" }));
    expect(rowNames()).toEqual(["Headquarters", "R&D", "Operations", "Branch"]);
  });

  it("t.Toolbar 里的全部展开铺开所有层级，再点一次全部收起", () => {
    renderWithLocalization(<TreeHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(rowNames()).toEqual(["Headquarters", "R&D", "Frontend", "Operations", "Branch"]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(rowNames()).toEqual(["Headquarters", "Branch"]);
  });

  it("点展开钮不会触发「点行开详情」", () => {
    const onOpen = vi.fn();
    renderWithLocalization(<TreeHarness onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(onOpen).not.toHaveBeenCalled();
    // 对照：点行本身仍然开详情
    fireEvent.click(screen.getByRole("row", { name: /Branch/ }));
    expect(onOpen).toHaveBeenCalledWith("view", units[1]);
  });
});

interface Order {
  id: string;
  code: string;
}

const orders: Order[] = [
  { id: "o1", code: "SO-001" },
  { id: "o2", code: "SO-002" },
];

const detailColumns: TableColumnDef<Order, ExpandingFeatures>[] = [
  expandColumn<Order>(),
  { accessorKey: "code", header: "Code" },
];
const detailOptions = { getRowCanExpand: () => true };
const orderSource = staticSource(orders, 2);

/** 行内常驻操作拿到的表对象带展开 API：这里用它做「全部展开」，验证运行时确实是同一张扩展表。 */
const rowConfig: AbpTableRowConfig<Order, ExpandingFeatures> = {
  actions: (row, table) =>
    row.id === "o1" ? (
      <button type="button" onClick={() => table.toggleAllRowsExpanded(true)}>
        expand-all-from-row
      </button>
    ) : null,
};

function DetailHarness() {
  const t = useAbpTable(orderSource, {
    columns: detailColumns,
    features: expandingFeatures,
    tableOptions: detailOptions,
    row: rowConfig,
  });
  useCollapseOnScopeChange(t);
  return (
    <>
      <button type="button" onClick={() => t.table.nextPage()}>
        next-page
      </button>
      <t.Table
        renderSubRow={(row) => (row.getIsExpanded() ? <p>Lines of {row.original.code}</p> : null)}
      />
    </>
  );
}

describe("useAbpTable 折叠详情", () => {
  it("t.Table 的 renderSubRow 在展开行下方插入通栏详情", () => {
    renderWithLocalization(<DetailHarness />);
    expect(screen.queryByText("Lines of SO-001")).toBeNull();

    const row = screen.getByRole("row", { name: /SO-001/ });
    fireEvent.click(within(row).getByRole("button", { name: "Expand row" }));

    const detail = screen.getByText("Lines of SO-001");
    // 展开列 + Code + 操作列
    expect(detail.closest("td")?.getAttribute("colspan")).toBe("3");
    expect(screen.queryByText("Lines of SO-002")).toBeNull();
  });

  it("row.actions 拿到的表对象能直接调展开 API", () => {
    renderWithLocalization(<DetailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "expand-all-from-row" }));
    expect(screen.getByText("Lines of SO-001")).toBeTruthy();
    expect(screen.getByText("Lines of SO-002")).toBeTruthy();
  });

  it("翻页后 useCollapseOnScopeChange 收起全部", () => {
    renderWithLocalization(<DetailHarness />);
    const row = screen.getByRole("row", { name: /SO-001/ });
    fireEvent.click(within(row).getByRole("button", { name: "Expand row" }));
    expect(screen.getByText("Lines of SO-001")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "next-page" }));
    expect(screen.queryByText("Lines of SO-001")).toBeNull();
  });
});
