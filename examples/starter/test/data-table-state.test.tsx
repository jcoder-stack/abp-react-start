/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDataTableState } from "@/components/data-table/use-data-table-state";

describe("useDataTableState", () => {
  it("翻页清空行选择", () => {
    const { result } = renderHook(() => useDataTableState());
    act(() => result.current.onRowSelectionChange({ a: true }));
    expect(result.current.selectedCount).toBe(1);
    act(() => result.current.onPaginationChange((p) => ({ ...p, pageIndex: 1 })));
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.params.pageIndex).toBe(1);
  });

  it("resetPaging 回第 1 页并清选择", () => {
    const { result } = renderHook(() => useDataTableState({ defaultPageSize: 20 }));
    act(() => result.current.onPaginationChange((p) => ({ ...p, pageIndex: 3 })));
    act(() => result.current.onRowSelectionChange({ a: true }));
    act(() => result.current.resetPaging());
    expect(result.current.params).toMatchObject({ pageIndex: 0, pageSize: 20 });
    expect(result.current.selectedCount).toBe(0);
  });

  it("keepSelected 只保留指定 id", () => {
    const { result } = renderHook(() => useDataTableState());
    act(() => result.current.onRowSelectionChange({ a: true, b: true, c: true }));
    act(() => result.current.keepSelected(["b"]));
    expect(result.current.rowSelection).toEqual({ b: true });
  });
});

describe("density", () => {
  it("defaults to comfortable and switches to compact", () => {
    const { result } = renderHook(() => useDataTableState());
    expect(result.current.density).toBe("comfortable");
    act(() => result.current.setDensity("compact"));
    expect(result.current.density).toBe("compact");
  });
});
