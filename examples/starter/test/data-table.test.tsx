// @vitest-environment jsdom
import { useLocalization } from "@jcoder/abp-react/react";
import type { SortingState } from "@tanstack/react-table";
import { fireEvent, screen } from "@testing-library/react";
import { act, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataTableProps } from "@/components/data-table/data-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnsMenu } from "@/components/data-table/data-table-columns-menu";
import { getPageItems } from "@/components/data-table/data-table-footer";
import {
  DataTableClearSortButton,
  DataTableSortMenu,
} from "@/components/data-table/data-table-sort-menu";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { renderWithProviders } from "./test-utils";

// 组件文案断言需要 Table: 词条（挂具默认只带 layoutMessages）
const messages = tableMessages;

interface Row {
  id: string;
  name: string;
}
const columns: TableColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];

const groupedColumns: TableColumnDef<Row>[] = [
  {
    id: "group",
    header: "Group",
    columns: [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "id", header: "ID" },
    ],
  },
];

const sortableColumns: TableColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name", enableSorting: true },
];

const nonSortableColumns: TableColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name", enableSorting: false },
];

const twoSortableColumns: TableColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "id", header: "ID" },
];

// 函数形态词条表头：验证菜单标签走 flexRender（渲染出实际词条文案），而非退化成裸 column.id（"name"）。
function SearchLabelHeader() {
  const L = useLocalization();
  return <>{L("Table:Search")}</>;
}
const localizedHeaderColumns: TableColumnDef<Row>[] = [
  { accessorKey: "name", header: SearchLabelHeader },
];

function Harness({
  data,
  pageCount = 1,
  rowCount,
  columns: cols = columns,
  selectable,
  onRowClick,
  withColumnsMenu,
  withSortMenu,
  defaultPageSize,
  pageSizes,
  fetching,
  empty,
  skeletonRows,
  loading,
  rowProps,
  footer,
}: {
  data: Row[];
  pageCount?: number;
  rowCount?: number;
  columns?: TableColumnDef<Row>[];
  selectable?: boolean;
  onRowClick?: (row: Row) => void;
  withColumnsMenu?: boolean;
  withSortMenu?: boolean;
  defaultPageSize?: number;
  pageSizes?: number[];
  fetching?: boolean;
  empty?: ReactNode;
  skeletonRows?: number | "pageSize";
  loading?: boolean;
  rowProps?: (row: Row) => { className?: string };
  footer?: DataTableProps<Row>["footer"];
}) {
  const state = useDataTableState({ defaultPageSize });
  const dt = useDataTable({ state, columns: cols, data, pageCount, rowCount, selectable });
  return (
    <div>
      <span data-testid="filter">{dt.state.params.filter}</span>
      <span data-testid="page">{dt.state.params.pageIndex}</span>
      <span data-testid="selected">{dt.state.selectedCount}</span>
      <DataTable
        table={dt}
        onRowClick={onRowClick}
        pageSizes={pageSizes}
        fetching={fetching}
        empty={empty}
        skeletonRows={skeletonRows}
        loading={loading}
        rowProps={rowProps}
        footer={footer}
      >
        <DataTableToolbar table={dt}>
          {withColumnsMenu && <DataTableColumnsMenu table={dt} />}
          {withSortMenu && <DataTableSortMenu table={dt} />}
        </DataTableToolbar>
      </DataTable>
    </div>
  );
}

// Harness 把 sorting 交给 useDataTable 管，无法预置两列排序态；这个专用挂具直接受控 sorting。
function SortIndexHarness({ sorting }: { sorting: SortingState }) {
  const state = useDataTableState();
  const dt = useDataTable({
    columns: twoSortableColumns,
    data: [{ id: "1", name: "Alpha" }],
    pageCount: 1,
    state: { ...state, sorting },
  });
  return <DataTable table={dt} />;
}

// sorting 自持 state：SortIndexHarness 的 sorting 是只读 prop，点击清除后不会变，测不出效果。
function ClearSortHarness({ initialSorting }: { initialSorting: SortingState }) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const state = useDataTableState();
  const dt = useDataTable({
    columns: twoSortableColumns,
    data: [{ id: "1", name: "Alpha" }],
    pageCount: 1,
    state: { ...state, sorting, onSortingChange: setSorting },
  });
  return (
    <DataTable table={dt}>
      <DataTableClearSortButton table={dt} />
    </DataTable>
  );
}

describe("getPageItems", () => {
  it.each([
    ["shows every page when the total is 7 or fewer", 0, 7, [0, 1, 2, 3, 4, 5, 6]],
    ["shows the only page of a single-page list", 3, 1, [0]],
    [
      "windows around the current page with ellipses for long lists",
      5,
      10,
      [0, "ellipsis", 4, 5, 6, "ellipsis", 9],
    ],
    ["collapses only the trailing gap near the start", 0, 10, [0, 1, "ellipsis", 9]],
    ["collapses only the leading gap near the end", 9, 10, [0, "ellipsis", 8, 9]],
  ] as const)("%s", (_label, pageIndex, pageCount, expected) => {
    expect(getPageItems(pageIndex, pageCount)).toEqual(expected);
  });
});

describe("DataTable", () => {
  it("renders rows and the built-in pagination", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} pageCount={3} />, {
      messages,
    });
    expect(await screen.findByText("Alpha")).toBeDefined();
    // Table:PageOf 插值：Page 1 of 3（窄屏标签，词条保留）
    expect(await screen.findByText(/1[^0-9]+3/)).toBeDefined();
  });

  it("renders numbered pages and marks the current page as active", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} pageCount={3} />, {
      messages,
    });
    const page1 = await screen.findByRole("link", { name: "1" });
    const page2 = screen.getByRole("link", { name: "2" });
    const page3 = screen.getByRole("link", { name: "3" });
    expect(page1.getAttribute("aria-current")).toBe("page");
    expect(page2.getAttribute("aria-current")).toBeNull();
    expect(page3.getAttribute("aria-current")).toBeNull();
  });

  it("switches to the clicked page without a real navigation", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} pageCount={3} />, {
      messages,
    });
    const page2 = await screen.findByRole("link", { name: "2" });
    fireEvent.click(page2);
    expect((await screen.findByTestId("page")).textContent).toBe("1");
  });

  it("spans the empty cell across visible leaf columns, not top-level groups", async () => {
    renderWithProviders(<Harness data={[]} columns={groupedColumns} />, { messages });
    const cell = await screen.findByText("No data");
    // 1 个顶层分组、2 个叶子列 → colSpan 必须是 2
    expect(cell.getAttribute("colspan")).toBe("2");
  });

  it("renders the row total in the footer, and nothing when the count is unknown", async () => {
    const { unmount } = renderWithProviders(
      <Harness data={[{ id: "1", name: "Alpha" }]} pageCount={25} rowCount={248} />,
      { messages },
    );
    expect(await screen.findByText("248 items")).toBeDefined();
    unmount();

    // rowCount 缺席（调用方拿不到总数）时页脚不编一个出来，只剩每页行数与分页器。
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} pageCount={25} />, {
      messages,
    });
    expect(await screen.findByText("Rows per page")).toBeDefined();
    expect(screen.queryByText(/items/)).toBeNull();
  });

  it("resets to the first page when the page size changes", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} pageCount={5} />, {
      messages,
    });
    // 先翻到第 4 页（pageIndex 3）
    fireEvent.click(await screen.findByRole("link", { name: "4" }));
    expect((await screen.findByTestId("page")).textContent).toBe("3");
    // 打开每页行数 Select 并选 20
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "20" }));
    // 页码应回到第一页
    expect((await screen.findByTestId("page")).textContent).toBe("0");
  });

  it("exposes aria-sort on the header cell and toggles sorting from a real button", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} columns={sortableColumns} />, {
      messages,
    });
    const header = await screen.findByRole("columnheader", { name: /Name/ });
    expect(header.getAttribute("aria-sort")).toBe("none");

    // 读屏要能把它认成可激活控件，而不是一个恰好能聚焦的表头格
    const button = screen.getByRole("button", { name: /Name/ });
    button.focus();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("ascending");
  });

  it("does not wrap non-sortable headers in a button", async () => {
    renderWithProviders(
      <Harness data={[{ id: "1", name: "Alpha" }]} columns={nonSortableColumns} />,
      {
        messages,
      },
    );
    expect(await screen.findByRole("columnheader", { name: "Name" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
  });

  it("applies meta.align to header and cell", async () => {
    const alignedColumns: TableColumnDef<Row>[] = [
      { accessorKey: "name", header: "Name", meta: { align: "right" } },
    ];
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} columns={alignedColumns} />, {
      messages,
    });
    const cell = (await screen.findByText("Alpha")).closest("td");
    expect(cell?.className).toContain("text-right");
    const header = await screen.findByRole("columnheader", { name: "Name" });
    expect(header.className).toContain("text-right");
  });

  it("activates onRowClick via Enter when a row is focused", async () => {
    const onRowClick = vi.fn();
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} onRowClick={onRowClick} />, {
      messages,
    });
    const cell = await screen.findByText("Alpha");
    const row = cell.closest("tr") as HTMLElement;
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith({ id: "1", name: "Alpha" });
  });

  // Enter 不 preventDefault 时，本次按键会在激活后继续合成 click 打到新获焦元素上
  // （实测：详情抽屉的「编辑」按钮，键盘用户直接越过详情落进编辑态）。
  it.each(["Enter", " "])(
    "prevents the default action when activating a row with %s",
    async (key) => {
      const onRowClick = vi.fn();
      renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} onRowClick={onRowClick} />, {
        messages,
      });
      const cell = await screen.findByText("Alpha");
      const row = cell.closest("tr") as HTMLElement;
      row.focus();
      const prevented = !fireEvent.keyDown(row, { key });
      expect(prevented).toBe(true);
    },
  );

  it("does not make rows focusable when onRowClick is absent", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} />, { messages });
    const cell = await screen.findByText("Alpha");
    const row = cell.closest("tr") as HTMLElement;
    expect(row.getAttribute("tabindex")).toBeNull();
  });

  it("selects all rows on the current page and clears on page change", async () => {
    renderWithProviders(
      <Harness
        data={[
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" },
        ]}
        pageCount={3}
        selectable
      />,
      { messages },
    );
    const checks = await screen.findAllByRole("checkbox");
    // checks[0] = 表头全选
    fireEvent.click(checks[0]);
    expect((await screen.findByTestId("selected")).textContent).toBe("2");
    // 翻页清空
    fireEvent.click(screen.getByRole("link", { name: "2" }));
    expect((await screen.findByTestId("selected")).textContent).toBe("0");
  });

  it("hides a column through the columns menu", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} withColumnsMenu />, {
      messages,
    });
    expect(await screen.findByRole("columnheader", { name: "Name" })).toBeDefined();
    // Radix DropdownMenuTrigger 只在 onPointerDown 上开合，不监听 onClick
    fireEvent.pointerDown(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Name" }));
    expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();

    // 隐藏后该列没有表头对象（getHeaderGroups 只收可见叶列），菜单标签必须仍走 header 兜底显示
    // 「Name」；去掉兜底、退回 `return columnId` 就会显示 accessor id「name」，下面的 findByRole
    // 因大小写不匹配而超时失败。
    fireEvent.pointerDown(screen.getByRole("button", { name: "Columns" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Name" })).toBeDefined();
  });

  it("labels menu items with the same text as the header", async () => {
    renderWithProviders(
      <Harness
        data={[{ id: "1", name: "Alpha" }]}
        columns={localizedHeaderColumns}
        withColumnsMenu
      />,
      { messages },
    );
    // 表头由函数组件渲染出真实词条文案 "Search…"（而非 accessor id "name"）。
    expect(await screen.findByRole("columnheader", { name: "Search…" })).toBeDefined();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Columns" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Search…" })).toBeDefined();
  });

  it("sorts through the sort menu and clears it", async () => {
    renderWithProviders(
      <Harness data={[{ id: "1", name: "Alpha" }]} columns={sortableColumns} withSortMenu />,
      { messages },
    );
    // Radix DropdownMenuTrigger 只在 onPointerDown 上开合，不监听 onClick
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Sort" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Name/ }));
    expect(
      (await screen.findByRole("columnheader", { name: /Name/ })).getAttribute("aria-sort"),
    ).toBe("ascending");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear sort" }));
    expect(
      (await screen.findByRole("columnheader", { name: /Name/ })).getAttribute("aria-sort"),
    ).toBe("none");
  });

  it("offers no sort exit while only one column is sorted", async () => {
    renderWithProviders(<ClearSortHarness initialSorting={[{ id: "name", desc: false }]} />, {
      messages,
    });
    await screen.findByRole("columnheader", { name: /Name/ });
    expect(screen.queryByRole("button", { name: "Clear sort" })).toBeNull();
  });

  it("clears every sorted column at once and then hides itself", async () => {
    renderWithProviders(
      <ClearSortHarness
        initialSorting={[
          { id: "name", desc: false },
          { id: "id", desc: true },
        ]}
      />,
      { messages },
    );
    fireEvent.click(await screen.findByRole("button", { name: "Clear sort" }));
    expect(
      (await screen.findByRole("columnheader", { name: /Name/ })).getAttribute("aria-sort"),
    ).toBe("none");
    expect(screen.getByRole("columnheader", { name: /ID/ }).getAttribute("aria-sort")).toBe("none");
    expect(screen.queryByRole("button", { name: "Clear sort" })).toBeNull();
  });

  it("keeps the page-size trigger populated when defaultPageSize is outside the default options", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} defaultPageSize={25} />, {
      messages,
    });
    const trigger = await screen.findByRole("combobox");
    expect(trigger.textContent).toBe("25");
    fireEvent.click(trigger);
    // 25 被并入选项集，所以它既显示在触发器上、也能在下拉里选回来
    expect(await screen.findByRole("option", { name: "25" })).toBeDefined();
  });

  it("renders the caller's pageSizes instead of the defaults", async () => {
    renderWithProviders(
      <Harness data={[{ id: "1", name: "Alpha" }]} pageSizes={[15, 30]} defaultPageSize={15} />,
      { messages },
    );
    fireEvent.click(await screen.findByRole("combobox"));
    expect(await screen.findByRole("option", { name: "15" })).toBeDefined();
    expect(screen.getByRole("option", { name: "30" })).toBeDefined();
    expect(screen.queryByRole("option", { name: "20" })).toBeNull();
  });

  it("marks the table busy while refetching with stale rows still on screen", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} fetching />, { messages });
    // 旧数据仍在位。keepPreviousData 的意义就在这里，不能退化成骨架
    expect(await screen.findByText("Alpha")).toBeDefined();
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
  });

  it("leaves aria-busy off when neither loading nor fetching", async () => {
    renderWithProviders(<Harness data={[{ id: "1", name: "Alpha" }]} />, { messages });
    expect(await screen.findByText("Alpha")).toBeDefined();
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBeNull();
  });

  it("renders the caller's empty state instead of the built-in copy", async () => {
    renderWithProviders(<Harness data={[]} empty={<span>还没有任何图书，先新建一本</span>} />, {
      messages,
    });
    expect(await screen.findByText("还没有任何图书，先新建一本")).toBeDefined();
    // 内建文案必须让位，否则会同时出现两句空状态
    expect(screen.queryByText("No data")).toBeNull();
  });

  it("falls back to the built-in empty copy when no slot is given", async () => {
    renderWithProviders(<Harness data={[]} />, { messages });
    expect(await screen.findByText("No data")).toBeDefined();
  });

  it("matches the skeleton row count to the page size when asked", async () => {
    renderWithProviders(
      <Harness data={[]} loading defaultPageSize={20} skeletonRows="pageSize" />,
      { messages },
    );
    const body = (await screen.findByRole("table")).querySelector("tbody");
    expect(body?.querySelectorAll("tr").length).toBe(20);
  });

  it("uses five skeleton rows by default", async () => {
    renderWithProviders(<Harness data={[]} loading />, { messages });
    const body = (await screen.findByRole("table")).querySelector("tbody");
    expect(body?.querySelectorAll("tr").length).toBe(5);
  });

  it("merges caller row classes without dropping the component's own", async () => {
    renderWithProviders(
      <Harness
        data={[{ id: "1", name: "Alpha" }]}
        rowProps={(row) => ({ className: row.name === "Alpha" ? "opacity-50" : undefined })}
      />,
      { messages },
    );
    const row = (await screen.findByText("Alpha")).closest("tr");
    // 调用方的类到位
    expect(row?.className).toContain("opacity-50");
    // 组件自管的类不能被挤掉，这是本项最容易实现错的地方（cn 顺序写反或整体替换）
    expect(row?.className).toContain("group");
  });

  it("lets the caller replace the whole footer region", async () => {
    renderWithProviders(
      <Harness
        data={[{ id: "1", name: "Alpha" }]}
        pageCount={3}
        footer={(ctx) => (
          <button type="button" onClick={() => ctx.table.nextPage()}>
            加载更多（共 {ctx.pageCount} 页）
          </button>
        )}
      />,
      { messages },
    );
    expect(await screen.findByRole("button", { name: /加载更多（共 3 页）/ })).toBeDefined();
    // 三样内建件都必须让位，否则「加载更多」形态下会残留无意义的页码与每页行数
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("link", { name: "2" })).toBeNull();
    expect(screen.queryByText("Rows per page")).toBeNull();
  });

  it("advances the page through the caller's footer", async () => {
    renderWithProviders(
      <Harness
        data={[{ id: "1", name: "Alpha" }]}
        pageCount={3}
        footer={(ctx) => (
          <button type="button" onClick={() => ctx.table.nextPage()}>
            next
          </button>
        )}
      />,
      { messages },
    );
    fireEvent.click(await screen.findByRole("button", { name: "next" }));
    // Harness 里的 data-testid="page" 回显 useDataTable 的 pageIndex
    expect((await screen.findByTestId("page")).textContent).toBe("1");
  });
});

describe("DataTable multi-column sorting", () => {
  it("shows sort order numbers only when more than one column is sorted", async () => {
    const { unmount } = renderWithProviders(
      <SortIndexHarness sorting={[{ id: "name", desc: false }]} />,
      { messages },
    );
    // 单列排序时序号是纯噪声，不该出现。断言必须限定在表头文本内，用 screen.queryByText("1")
    // 会误中 ID 列的行数据单元格（本挂具的行 id 恰好是 "1"），与序号徽标无关。
    const singleSortNameHeader = await screen.findByRole("columnheader", { name: /Name/ });
    expect(singleSortNameHeader.textContent).not.toContain("1");
    // 同理，单列排序时不该挂 aria-describedby，没有优先级信息可描述。
    expect(
      screen.getByRole("button", { name: "Name" }).getAttribute("aria-describedby"),
    ).toBeNull();
    // 反向断言：单列时完全没有排序优先级描述
    expect(screen.queryByRole("button", { name: "Name", description: /Sort priority/ })).toBeNull();
    unmount();

    renderWithProviders(
      <SortIndexHarness
        sorting={[
          { id: "name", desc: false },
          { id: "id", desc: true },
        ]}
      />,
      { messages },
    );
    const nameHeader = await screen.findByRole("columnheader", { name: /Name/ });
    const idHeader = screen.getByRole("columnheader", { name: /ID/ });
    expect(nameHeader.textContent).toContain("1");
    expect(idHeader.textContent).toContain("2");
  });

  it("exposes the sort priority to assistive tech without polluting the name", async () => {
    renderWithProviders(
      <SortIndexHarness
        sorting={[
          { id: "name", desc: false },
          { id: "id", desc: true },
        ]}
      />,
      { messages },
    );
    // 精确字符串（非正则）的 name 查询走的就是可访问名计算：序号 span 若丢了 aria-hidden，
    // 可访问名会变成 "Name1"，下面三条断言随即失败。aria-sort 只表达方向、从不表达优先级，
    // 所以那个数字对辅助技术是纯噪声。
    expect(await screen.findByRole("columnheader", { name: "Name" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Name" })).toBeDefined();
    // 最后一行同时钉住两件事：可访问名仍是干净的 "Name"（语音控制能匹配），且可访问描述能被
    // 真正计算出来，描述目标带 aria-hidden（否则会污染 <th> 的 name-from-content），而
    // aria-describedby 直接引用的节点即使 hidden 仍会被读取。断言接线（getAttribute +
    // getElementById().textContent）验不到这一层。
    expect(
      screen.getByRole("button", { name: "Name", description: "Sort priority 1" }),
    ).toBeDefined();
  });

  it("adds to the sort instead of replacing it when picking from the menu", async () => {
    renderWithProviders(
      <Harness data={[{ id: "1", name: "Alpha" }]} columns={twoSortableColumns} withSortMenu />,
      { messages },
    );
    // Radix DropdownMenuTrigger 只在 onPointerDown 上开合，不监听 onClick
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Sort" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Name" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "ID" }));
    // 两列都排上了 ⇒ 表头出现序号 1 与 2；若菜单仍是「替换」语义，只会有一列排序、没有序号
    const nameHeader = await screen.findByRole("columnheader", { name: /Name/ });
    const idHeader = screen.getByRole("columnheader", { name: /ID/ });
    expect(nameHeader.textContent).toContain("1");
    expect(idHeader.textContent).toContain("2");
  });
});

describe("DataTableToolbar v2", () => {
  function ToolbarHarness({
    onRefresh,
    bulk,
    selectable,
  }: {
    onRefresh?: () => void;
    bulk?: ReactNode;
    selectable?: boolean;
  }) {
    const state = useDataTableState();
    const dt = useDataTable({
      state,
      columns,
      data: [
        { id: "1", name: "Alpha" },
        { id: "2", name: "Beta" },
      ],
      pageCount: 1,
      selectable,
    });
    return (
      <DataTable table={dt}>
        <DataTableToolbar table={dt} onRefresh={onRefresh} bulk={bulk} />
      </DataTable>
    );
  }

  function renderToolbarHarness(props: {
    onRefresh?: () => void;
    bulk?: ReactNode;
    selectable?: boolean;
  }) {
    return renderWithProviders(<ToolbarHarness {...props} />, { messages });
  }

  it("renders refresh and export buttons only when callbacks are provided, and refresh fires", async () => {
    const onRefresh = vi.fn();
    renderToolbarHarness({ onRefresh });
    // 路由挂载需要一次微任务 tick 才能出稳定 DOM，故第一次查询用 findByRole 等待
    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });

  it("switches row density from the density menu", async () => {
    renderToolbarHarness({});
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Density" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Compact" }));
    // jsdom 测不了真实行高，只能断言组件应用的紧凑 padding 类名作为行为代理
    const cell = screen.getAllByRole("cell")[0];
    expect(cell.closest("table")?.className).toContain("[&_td]:py-1");
  });

  it("replaces the left region with bulk content while rows are selected", async () => {
    renderToolbarHarness({ bulk: <span>BULK-REGION</span>, selectable: true });
    expect(screen.queryByText("BULK-REGION")).toBeNull();
    const checks = await screen.findAllByRole("checkbox");
    fireEvent.click(checks[0]);
    expect(screen.getByText("BULK-REGION")).toBeDefined();
    expect(screen.queryByPlaceholderText("Search…")).toBeNull();
  });
});

describe("useDataTable search debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("commits the filter after 400ms and resets to the first page", async () => {
    vi.useRealTimers();
    renderWithProviders(<Harness data={[]} />);
    // 路由挂载需要一次微任务 tick 才能出稳定 DOM；在切假定时器前先等到位。
    const input = await screen.findByRole("textbox");
    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "ad" } });
    expect(screen.getByTestId("filter").textContent).toBe("");
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByTestId("filter").textContent).toBe("ad");
    expect(screen.getByTestId("page").textContent).toBe("0");
  });

  it("Enter flushes immediately", async () => {
    vi.useRealTimers();
    renderWithProviders(<Harness data={[]} />);
    const input = await screen.findByRole("textbox");
    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "now" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("filter").textContent).toBe("now");
  });
});
