// @vitest-environment jsdom
import { columnOrderingFeature } from "@tanstack/react-table";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/data-table/data-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useDataTableState } from "@/components/data-table/use-data-table-state";
import { renderWithProviders } from "./test-utils";

interface Row {
  id: string;
  name: string;
}
const columns: TableColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];
const twoRows: Row[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];

function Harness(props: { data?: Row[] }) {
  const state = useDataTableState();
  const dt = useDataTable({
    state,
    columns,
    data: props.data ?? twoRows,
    selectable: true,
    getRowId: (r) => r.id,
  });
  return (
    <>
      <dt.SelectedCount>{(n) => <span data-testid="count">{n}</span>}</dt.SelectedCount>
      <button type="button" onClick={() => dt.clearSelection()}>
        clear
      </button>
      <button type="button" onClick={() => dt.keepSelected(["2"])}>
        keep2
      </button>
      <button type="button" onClick={() => state.onSortingChange([{ id: "name", desc: false }])}>
        sort
      </button>
      <button
        type="button"
        onClick={() => state.onPaginationChange((p) => ({ ...p, pageIndex: p.pageIndex + 1 }))}
      >
        next-page
      </button>
      <button type="button" onClick={() => state.commitSearch("alpha")}>
        commit-search
      </button>
      <button type="button" onClick={() => state.resetPaging()}>
        reset-paging
      </button>
      <button type="button" onClick={() => dt.table.setColumnVisibility({ name: false })}>
        hide-name
      </button>
      <DataTable table={dt} />
    </>
  );
}

// features 的契约是引用必须稳定，模块级常量是它唯一正当的写法。
const extraFeatures = { columnOrderingFeature };

/** `TableInstance` 按基础特性定型，`opts.features` 追加进来的 API 不在它的类型里。
 *  这正是本用例要覆盖的处境：类型上看不见，但那片状态必须真的被宿主订阅。 */
type ColumnOrderingApi = { setColumnOrder: (order: string[]) => void };

function OrderingHarness() {
  const state = useDataTableState();
  const dt = useDataTable({
    state,
    columns,
    data: twoRows,
    selectable: true,
    getRowId: (r) => r.id,
    features: extraFeatures,
  });
  return (
    <>
      <span data-testid="slices">{Object.keys(dt.table.state).sort().join(",")}</span>
      <button
        type="button"
        onClick={() =>
          (dt.table as unknown as ColumnOrderingApi).setColumnOrder(["name", "select"])
        }
      >
        reorder
      </button>
      <DataTable table={dt} />
    </>
  );
}

describe("选中态由表持有", () => {
  it("勾选一行后计数为 1", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("clearSelection 清空", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("keepSelected 只保留指定行", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "keep2" }));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("翻页后选中态清空", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "next-page" }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  // 第 1 页是 resetPaging 的退化分支：pageIndex 本来就是 0，写回同值，只有 filter 变了。
  // 作用域少算 filter 的话这两条会漏掉清空，用户会带着上一语境的选中行去点批量删除。
  it("在第 1 页提交搜索后选中态清空", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "commit-search" }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("在第 1 页调用 resetPaging 后选中态清空", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "reset-paging" }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("排序变化后选中态清空", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "sort" }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("离场行的选中态被剪掉，不留幽灵计数", async () => {
    function Pruning() {
      const [data, setData] = useState<Row[]>(twoRows);
      return (
        <>
          <button type="button" onClick={() => setData([twoRows[1]])}>
            drop-first
          </button>
          <Harness data={data} />
        </>
      );
    }
    renderWithProviders(<Pruning />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "drop-first" }));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});

// 宿主已用 selector 把 rowSelection 摘出订阅，勾选不再重渲染 DataTable。以下每条都对着
// 一处「原本在渲染期读快照」的位置：漏掉任何一处的表现都是静默的——勾得动，界面不动。
describe("选中态的定点订阅", () => {
  it("勾一行后该行复选框呈勾选态，其余行不变", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    fireEvent.click((await screen.findAllByLabelText("Select row"))[0]);
    const boxes = screen.getAllByLabelText("Select row");
    expect(boxes[0].getAttribute("aria-checked")).toBe("true");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("勾一行后只有该行的 tr 带 data-state=selected", async () => {
    const { container } = renderWithProviders(<Harness />, { messages: tableMessages });
    fireEvent.click((await screen.findAllByLabelText("Select row"))[0]);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].getAttribute("data-state")).toBe("selected");
    expect(rows[1].getAttribute("data-state")).toBe(null);
  });

  it("表头全选框部分选中为 indeterminate、全选为勾选", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    fireEvent.click((await screen.findAllByLabelText("Select row"))[0]);
    expect(screen.getByLabelText("Select all rows").getAttribute("aria-checked")).toBe("mixed");
    fireEvent.click(screen.getAllByLabelText("Select row")[1]);
    expect(screen.getByLabelText("Select all rows").getAttribute("aria-checked")).toBe("true");
  });

  // 上面四条在「宿主订阅全部切片」时也全绿——那正是本次要去掉的成本。用重渲染的行数把它
  // 钉住：宿主一旦重新订阅 rowSelection，勾一行就会带着满页行陪跑，这条立刻红。
  it("勾一行只重渲染那一行", async () => {
    const cellRenders = { count: 0 };
    const countingColumns: TableColumnDef<Row>[] = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          cellRenders.count += 1;
          return row.original.name;
        },
      },
    ];
    const manyRows: Row[] = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
    }));
    function ManyRows() {
      const state = useDataTableState();
      const dt = useDataTable({
        state,
        columns: countingColumns,
        data: manyRows,
        selectable: true,
        getRowId: (r) => r.id,
      });
      return <DataTable table={dt} />;
    }
    renderWithProviders(<ManyRows />, { messages: tableMessages });
    const boxes = await screen.findAllByLabelText("Select row");
    cellRenders.count = 0;
    fireEvent.click(boxes[0]);
    expect(cellRenders.count).toBe(1);
  });

  // 上一条只钉住「columnVisibility 得被订阅」，列全三片的列举法照样能过。真正的硬要求是
  // 排除法：features 加法合并，调用方追加的特性带来的切片必须自动落进宿主的订阅面。
  // 这里用 columnOrderingFeature 当代表——它的 columnOrder 只影响表现层，改了就该看得见。
  it("调用方追加的特性，其状态切片被宿主订阅且能驱动 UI", async () => {
    const { container } = renderWithProviders(<OrderingHarness />, { messages: tableMessages });
    expect((await screen.findByTestId("slices")).textContent).toContain("columnOrder");
    const selectIsFirst = () =>
      Boolean(
        container
          .querySelector("thead th:first-child")
          ?.querySelector('[aria-label="Select all rows"]'),
      );
    expect(selectIsFirst()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "reorder" }));
    expect(selectIsFirst()).toBe(false);
  });

  // 反证宿主 selector 用的是排除法而非列举法：列举法漏掉调用方追加特性带来的切片时，
  // 那些切片的 UI 会静默失灵，这里拿基础集里的 columnVisibility 当哨兵。
  it("勾选之后隐藏列仍然生效", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    fireEvent.click((await screen.findAllByLabelText("Select row"))[0]);
    fireEvent.click(screen.getByRole("button", { name: "hide-name" }));
    expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();
  });
});
