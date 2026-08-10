// @vitest-environment jsdom
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
  it("勾一行只重渲染那一行，重渲染量不随行数放大", async () => {
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

  // 反证宿主 selector 用的是排除法而非列举法：列举法漏掉调用方追加特性带来的切片时，
  // 那些切片的 UI 会静默失灵，这里拿基础集里的 columnVisibility 当哨兵。
  it("勾选之后隐藏列仍然生效", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    fireEvent.click((await screen.findAllByLabelText("Select row"))[0]);
    fireEvent.click(screen.getByRole("button", { name: "hide-name" }));
    expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();
  });
});
