// @vitest-environment jsdom
import { AppConfigProvider } from "@jcoder-stack/abp-react/react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTable } from "@/components/data-table/use-data-table";
import { makeConfig } from "./test-utils";

// 独立成文件而非并进 use-data-table.test.tsx：这里要正向断言 devWarn 真的喊出来了，
// abp-table-columns-memo.test.tsx（I1 回归）在同一 dev-warn 模块实例里断言的是「不喊」，
// 两条正向用例若混进那个文件，会把该文件的负向断言变成假阳性。vitest 按文件隔离模块注册表，
// 独立文件即拿到全新的 dev-warn.ts 单例，两条正向用例各自的 key 也互不相同，互相之间同样无干扰。

interface Row {
  id: string;
  name: string;
}
const rows = (ids: string[]) => ids.map((id) => ({ id, name: `n-${id}` }));
const newColumns = (): TableColumnDef<Row>[] => [{ accessorKey: "name", header: "Name" }];

// selectionColumn 的表头/单元格靠 useLocalization 取 aria-label，需要 AppConfigProvider 兜底。
function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppConfigProvider config={makeConfig()} messages={tableMessages} fallbackCulture="en">
      {children}
    </AppConfigProvider>
  );
}

describe("useDataTable dev-only churn warnings (positive fire)", () => {
  it("fires data-table:columns-churn once columns keep getting a brand-new array for 3+ rerenders", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ columns }: { columns: TableColumnDef<Row>[] }) =>
        useDataTable({ columns, data: rows(["a"]) }),
      { initialProps: { columns: newColumns() }, wrapper },
    );
    // churn 计数只在挂载后的 rerender 里累积（挂载帧只建立基线），阈值 >=3 才喊：
    // 3 次都传全新数组引用的 rerender，第 3 次跨过阈值触发。
    rerender({ columns: newColumns() });
    rerender({ columns: newColumns() });
    rerender({ columns: newColumns() });

    const hits = warn.mock.calls.filter((c) => String(c[0]).includes("columns 每次渲染都是新数组"));
    expect(hits).toHaveLength(1);

    warn.mockRestore();
  });

  it("fires data-table:features-changed when the features prop reference changes after mount", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const columns = newColumns();

    const { rerender } = renderHook(
      ({ features }: { features: Record<string, never> }) =>
        useDataTable({ columns, data: rows(["a"]), features }),
      { initialProps: { features: {} }, wrapper },
    );
    // useTable 只在挂载时构造表实例、特性注册在构造时完成，挂载后再变的引用会被忽略，
    // 但必须喊出来，否则就是"传了新 features、什么都没发生"的静默失效。
    rerender({ features: {} });

    const hits = warn.mock.calls.filter((c) =>
      String(c[0]).includes("features prop 在挂载后改变了引用"),
    );
    expect(hits).toHaveLength(1);

    warn.mockRestore();
  });
});
