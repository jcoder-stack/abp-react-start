// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAbpColumns } from "@/components/abp/table/column-presets";
import { DataTable } from "@/components/data-table/data-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTable } from "@/components/data-table/use-data-table";
import { renderWithProviders } from "./test-utils";

interface Row {
  id: string;
  title: string;
  publishDate?: string;
  price?: number;
  kind?: number;
  active?: boolean;
}

const col = createAbpColumns<Row>();

const TYPE_KEYS: Record<number, string> = { 0: "Table:Yes", 1: "Table:No" };

/** 每张表都带一列标题，供负向断言先等一个确实渲染出来的锚点——
 *  否则「查不到 undefined」在空 DOM 上会假通过。 */
const anchor = col.text("title", "Table:Search");

function Harness(props: { columns: TableColumnDef<Row>[]; data: Row[] }) {
  const dt = useDataTable({ columns: props.columns, data: props.data, getRowId: (r) => r.id });
  return <DataTable table={dt} />;
}

function renderRows(columns: TableColumnDef<Row>[], data: Row[]) {
  return renderWithProviders(<Harness columns={[anchor, ...columns]} data={data} />, {
    messages: tableMessages,
  });
}

describe("column presets", () => {
  it("date 列只渲染 ISO 值的日期段", async () => {
    renderRows(
      [col.date("publishDate", "Table:Columns")],
      [{ id: "1", title: "锚点", publishDate: "2026-03-14T22:30:00Z" }],
    );
    expect(await screen.findByText("2026-03-14")).toBeTruthy();
  });

  it("date 列在值缺席时渲染空，不渲染 undefined", async () => {
    renderRows([col.date("publishDate", "Table:Columns")], [{ id: "1", title: "锚点" }]);
    await screen.findByText("锚点");
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("money 列按位数定点并右对齐", async () => {
    const { container } = renderRows(
      [col.money("price", "Table:Columns", { digits: 2 })],
      [{ id: "1", title: "锚点", price: 12.5 }],
    );
    expect(await screen.findByText("12.50")).toBeTruthy();
    expect(container.querySelector("td.text-right")).toBeTruthy();
  });

  it("money 列在值不是数字时渲染空", async () => {
    renderRows([col.money("price", "Table:Columns")], [{ id: "1", title: "锚点" }]);
    await screen.findByText("锚点");
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });

  it("enum 列把值映射成词条", async () => {
    renderRows(
      [col.enum("kind", "Table:Columns", { map: TYPE_KEYS })],
      [{ id: "1", title: "锚点", kind: 1 }],
    );
    expect(await screen.findByText("No")).toBeTruthy();
  });

  it("enum 列对映射外的值按原样渲染，不吞掉", async () => {
    renderRows(
      [col.enum("kind", "Table:Columns", { map: TYPE_KEYS })],
      [{ id: "1", title: "锚点", kind: 42 }],
    );
    expect(await screen.findByText("42")).toBeTruthy();
  });

  it("enum 列在值缺席且给了 fallback 时用 fallback 词条", async () => {
    renderRows(
      [col.enum("kind", "Table:Columns", { map: TYPE_KEYS, fallback: "Table:Empty" })],
      [{ id: "1", title: "锚点" }],
    );
    expect(await screen.findByText("No data")).toBeTruthy();
  });

  it("bool 列渲染是/否徽章", async () => {
    renderRows([col.bool("active", "Table:Columns")], [{ id: "1", title: "锚点", active: true }]);
    expect(await screen.findByText("Yes")).toBeTruthy();
  });

  it("bool 列把 false 与缺席都渲染成否", async () => {
    renderRows(
      [col.bool("active", "Table:Columns")],
      [
        { id: "1", title: "锚点一", active: false },
        { id: "2", title: "锚点二" },
      ],
    );
    await screen.findByText("锚点二");
    expect(screen.getAllByText("No")).toHaveLength(2);
  });

  it("表头用词条 key 渲染，列定义因此不依赖 L", async () => {
    renderRows([], [{ id: "1", title: "锚点" }]);
    expect(await screen.findByRole("columnheader", { name: /Search/ })).toBeTruthy();
  });

  it("表头接受自渲染函数作为逃生舱", async () => {
    renderRows(
      [col.text("title", () => "自定义表头", { id: "custom" })],
      [{ id: "1", title: "锚点" }],
    );
    expect(await screen.findByRole("columnheader", { name: /自定义表头/ })).toBeTruthy();
  });

  it("opts 整键覆盖预设默认值", async () => {
    const { container } = renderRows(
      [col.money("price", "Table:Columns", { meta: { align: "left" }, cell: () => "覆盖了" })],
      [{ id: "1", title: "锚点", price: 12.5 }],
    );
    expect(await screen.findByText("覆盖了")).toBeTruthy();
    expect(container.querySelector("td.text-right")).toBeNull();
  });

  it("调用方追加 features 时 columnMeta 类型槽不丢失", async () => {
    const { container } = renderRows(
      [col.money("price", "Table:Columns")],
      [{ id: "1", title: "锚点", price: 3 }],
    );
    expect(await screen.findByText("3.00")).toBeTruthy();
    expect(container.querySelector("td.text-right")).toBeTruthy();
  });
});
