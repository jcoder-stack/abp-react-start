// @vitest-environment jsdom
import { AppConfigProvider } from "@jcoder-stack/abp-react/react";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTable } from "@/components/data-table/use-data-table";
import { makeConfig } from "./test-utils";

interface Row {
  id: string;
  name: string;
}
const columns: TableColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];
const rows = (ids: string[]) => ids.map((id) => ({ id, name: `n-${id}` }));

// selectionColumn 的表头/单元格靠 useLocalization 取 aria-label，需要 AppConfigProvider 兜底。
function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppConfigProvider config={makeConfig()} messages={tableMessages} fallbackCulture="en">
      {children}
    </AppConfigProvider>
  );
}

describe("useDataTable", () => {
  it("返回 TanStack 实例且 selectable 时注入勾选列", () => {
    const { result } = renderHook(
      () => useDataTable({ columns, data: rows(["a"]), selectable: true, getRowId: (r) => r.id }),
      { wrapper },
    );
    expect(result.current.table.getAllColumns().map((c) => c.id)).toEqual(["select", "name"]);
  });

  it("行离场时剪枝选中态（幽灵批量条不变式）", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useDataTable({ columns, data, selectable: true, getRowId: (r: Row) => r.id }),
      { initialProps: { data: rows(["a", "b"]) }, wrapper },
    );
    act(() => result.current.state.onRowSelectionChange({ a: true, b: true }));
    rerender({ data: rows(["b"]) });
    expect(result.current.state.rowSelection).toEqual({ b: true });
    expect(result.current.selectedRows.map((r) => r.id)).toEqual(["b"]);
  });

  it("省略 state 时内部自建", () => {
    const { result } = renderHook(() => useDataTable({ columns, data: rows(["a"]) }), { wrapper });
    expect(result.current.state.params.pageIndex).toBe(0);
  });
});
