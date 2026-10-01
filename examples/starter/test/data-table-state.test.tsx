/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDataTableState } from "@/components/data-table/use-data-table-state";

describe("useDataTableState", () => {
  it("翻页写进 params", () => {
    const { result } = renderHook(() => useDataTableState());
    act(() => result.current.onPaginationChange((p) => ({ ...p, pageIndex: 1 })));
    expect(result.current.params.pageIndex).toBe(1);
  });

  it("resetPaging 回第 1 页", () => {
    const { result } = renderHook(() => useDataTableState({ defaultPageSize: 20 }));
    act(() => result.current.onPaginationChange((p) => ({ ...p, pageIndex: 3 })));
    act(() => result.current.resetPaging());
    expect(result.current.params).toMatchObject({ pageIndex: 0, pageSize: 20 });
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

describe("initialFilter", () => {
  it("挂载时用 initialFilter 播种已提交的搜索值", () => {
    const { result } = renderHook(() => useDataTableState({ initialFilter: "orwell" }));
    expect(result.current.params.filter).toBe("orwell");
  });
});
