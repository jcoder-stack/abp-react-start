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
      <span data-testid="names">
        {dt
          .getSelectedRows()
          .map((r) => r.name)
          .join(",")}
      </span>
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
