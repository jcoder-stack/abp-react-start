// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
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
const data: Row[] = [{ id: "1", name: "Alpha" }];

function Harness() {
  const state = useDataTableState();
  const dt = useDataTable({ state, columns, data });
  return (
    <>
      <span data-testid="filter">{state.params.filter}</span>
      <DataTable table={dt}>
        <DataTableToolbar table={dt} />
      </DataTable>
    </>
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("搜索下沉到工具条", () => {
  it("防抖窗口内不提交，窗口过后提交一次", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const input = await screen.findByPlaceholderText("Search…");

    fireEvent.change(input, { target: { value: "Al" } });
    expect((input as HTMLInputElement).value).toBe("Al");
    expect(screen.getByTestId("filter").textContent).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("filter").textContent).toBe("Al");
  });

  it("Enter 立即提交，不等防抖", async () => {
    renderWithProviders(<Harness />, { messages: tableMessages });
    const input = await screen.findByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "Beta" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("filter").textContent).toBe("Beta");
  });
});
