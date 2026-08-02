// @vitest-environment jsdom
import { AppConfigProvider } from "@jcoder-stack/abp-react/react";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { makeConfig } from "./test-utils";

interface Dto {
  id: string;
  name: string;
}
const columns: TableColumnDef<Dto>[] = [{ accessorKey: "name", header: "Name" }];

const makeSource =
  (
    over: Partial<AbpTableSource<Dto>> = {},
  ): ((p: Record<string, unknown>) => AbpTableSource<Dto>) =>
  (_params) => ({
    listQuery: {
      data: { items: [{ id: "a", name: "x" }], totalCount: 1 },
      isPending: false,
      isFetching: false,
      isError: false,
    },
    pageCount: 1,
    totalCount: 1,
    can: { create: true, update: true, delete: true },
    supportsFilter: true,
    ...over,
  });

// useLocalization（操作列 header/内置菜单文案）需要 AppConfigProvider 兜底，同 use-data-table.test.tsx。
function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppConfigProvider
      config={makeConfig()}
      messages={{
        en: { "": { ...tableMessages.en[""], ...crudMessages.en[""] } },
        "zh-Hans": { "": { ...tableMessages["zh-Hans"][""], ...crudMessages["zh-Hans"][""] } },
      }}
      fallbackCulture="en"
    >
      {children}
    </AppConfigProvider>
  );
}

// submitQuery/resetQuery 的三条 renderHook 用例（提交带值、pruneEmpty、回第 1 页、resetQuery
// 回默认值）已删：query-form.test.tsx 的 "sends the submitted field value as an endpoint param"、
// "prunes an empty field value instead of sending it as an empty string"、"resets paging to page 1
// on submit"、"resets to query.defaults and re-applies immediately" 覆盖同一批契约，且断言落在
// service 真正收到的 params 上（即 getListParams 的输出），而不是直接读 hook 返回值。
describe("useAbpTable", () => {
  it("onOpen + can 齐备时注入操作列，只读 source 不注入", () => {
    const open = vi.fn();
    const { result } = renderHook(() => useAbpTable(makeSource(), { columns, onOpen: open }), {
      wrapper,
    });
    expect(result.current.table.getAllColumns().some((c) => c.id === "actions")).toBe(true);

    const ro = renderHook(
      () =>
        useAbpTable(makeSource({ can: { create: false, update: false, delete: false } }), {
          columns,
        }),
      { wrapper },
    );
    expect(ro.result.current.table.getAllColumns().some((c) => c.id === "actions")).toBe(false);
  });

  it("末页删空钳制（三态门控）", () => {
    const { result, rerender } = renderHook(
      ({ pageCount, isError }: { pageCount: number; isError: boolean }) =>
        useAbpTable(
          makeSource({
            pageCount,
            listQuery: {
              data: { items: [{ id: "a", name: "x" }], totalCount: 1 },
              isPending: false,
              isFetching: false,
              isError,
            },
          }),
          { columns },
        ),
      { initialProps: { pageCount: 3, isError: false }, wrapper },
    );

    act(() => result.current.state.onPaginationChange((p) => ({ ...p, pageIndex: 2 })));
    // pageIndex 2 < pageCount 3，未越界，不钳制
    expect(result.current.state.params.pageIndex).toBe(2);

    // pageCount 收缩到 2（越界），但 isError=true，三态门控里错误态不得钳制，停在原页
    rerender({ pageCount: 2, isError: true });
    expect(result.current.state.params.pageIndex).toBe(2);

    // 错误恢复、三态全 false 后才真正钳到 max(pageCount - 1, 0) = 1
    rerender({ pageCount: 2, isError: false });
    expect(result.current.state.params.pageIndex).toBe(1);
  });

  // hasUnroutedCrossFieldError 的 devWarn 用例已删：query-form.test.tsx 的 "warns in DEV when a
  // cross-field zod issue has no path to render on" 断言同一条告警,并额外证明提交确实被拦下
  // （请求次数没涨），那才是这条 devWarn 存在的理由。
});
