// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const messages = {
  en: { "": { ...tableMessages.en[""], ...formMessages.en[""], ...crudMessages.en[""] } },
  "zh-Hans": {
    "": {
      ...tableMessages["zh-Hans"][""],
      ...formMessages["zh-Hans"][""],
      ...crudMessages["zh-Hans"][""],
    },
  },
};

interface Book {
  id: string;
  name: string;
}

const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Name" }];
const pageOne: Book[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];
const everything: Book[] = [
  ...pageOne,
  { id: "3", name: "Gamma" },
  { id: "4", name: "Delta" },
  { id: "5", name: "Epsilon" },
];

function makeSource(listAll?: AbpTableSource<Book>["listAll"]) {
  return (): AbpTableSource<Book> => ({
    listQuery: {
      data: { items: pageOne, totalCount: everything.length },
      isPending: false,
      isFetching: false,
      isError: false,
    },
    pageCount: 3,
    totalCount: everything.length,
    listAll,
    can: { create: false, update: false, delete: false },
    supportsFilter: true,
  });
}

describe("selecting all matching rows", () => {
  function Harness(props: {
    listAll?: AbpTableSource<Book>["listAll"];
    run?: (row: Book) => Promise<unknown>;
  }) {
    const t = useAbpTable(makeSource(props.listAll), { columns, selectable: true });
    return (
      <t.Table>
        <t.BulkBar>
          <t.BulkAction label="Archive" run={props.run ?? (() => Promise.resolve())} />
        </t.BulkBar>
      </t.Table>
    );
  }

  async function selectPage() {
    expect(await screen.findByText("Alpha")).toBeDefined();
    fireEvent.click((await screen.findAllByRole("checkbox"))[0]);
  }

  it("offers to extend a full-page selection to every matching row", async () => {
    renderWithProviders(<Harness listAll={vi.fn()} />, { messages });
    await selectPage();

    fireEvent.click(await screen.findByRole("button", { name: "Select all 5 matching" }));

    expect(await screen.findByText("All 5 matching are selected.")).toBeDefined();
  });

  it("makes no such offer when the source cannot list every matching row", async () => {
    renderWithProviders(<Harness />, { messages });
    await selectPage();

    expect(await screen.findByRole("button", { name: "Archive" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Select all 5 matching" })).toBeNull();
  });

  it("runs the bulk action on rows that were never loaded", async () => {
    const listAll = vi.fn().mockResolvedValue(everything);
    const run = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<Harness listAll={listAll} run={run} />, { messages });
    await selectPage();
    fireEvent.click(await screen.findByRole("button", { name: "Select all 5 matching" }));

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(5));
    expect(run.mock.calls.map(([row]) => row.id)).toEqual(["1", "2", "3", "4", "5"]);
    // 分页参数不该带给「取全部」：它要的是整批，不是当前页。
    expect(listAll.mock.calls[0][0]).not.toHaveProperty("SkipCount");
    expect(listAll.mock.calls[0][0]).not.toHaveProperty("MaxResultCount");
  });

  it("falls back to the page selection as soon as the user unticks a row", async () => {
    renderWithProviders(<Harness listAll={vi.fn()} />, { messages });
    await selectPage();
    fireEvent.click(await screen.findByRole("button", { name: "Select all 5 matching" }));
    expect(await screen.findByText("All 5 matching are selected.")).toBeDefined();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    await waitFor(() => expect(screen.queryByText("All 5 matching are selected.")).toBeNull());
  });
});

describe("filter summary row", () => {
  function Harness(props: { withSummary: boolean }) {
    const t = useAbpTable(makeSource(), {
      columns,
      query: {
        defaults: { Name: "", Kind: "" },
        summary: props.withSummary
          ? { Name: { label: "Title" }, Kind: { label: "Kind", format: (v) => `#${v}` } }
          : undefined,
      },
    });
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            t.queryForm.setFieldValue("Name", "orwell");
            t.queryForm.setFieldValue("Kind", "7");
            void t.submitQuery();
          }}
        >
          apply
        </button>
        <t.Table />
      </div>
    );
  }

  it("says which query fields are in force once they are committed", async () => {
    renderWithProviders(<Harness withSummary />, { messages });
    expect(await screen.findByText("Alpha")).toBeDefined();
    expect(screen.queryByText("Filtered by")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "apply" }));

    expect(await screen.findByText("Filtered by")).toBeDefined();
    expect(screen.getByText("Title: orwell")).toBeDefined();
    expect(screen.getByText("Kind: #7")).toBeDefined();
  });

  it("removes one filter and leaves the others in force", async () => {
    renderWithProviders(<Harness withSummary />, { messages });
    fireEvent.click(await screen.findByRole("button", { name: "apply" }));
    expect(await screen.findByText("Title: orwell")).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove filter" })[0]);

    await waitFor(() => expect(screen.queryByText("Title: orwell")).toBeNull());
    expect(screen.getByText("Kind: #7")).toBeDefined();
  });

  it("stays out of the way on tables that did not declare a summary", async () => {
    renderWithProviders(<Harness withSummary={false} />, { messages });
    fireEvent.click(await screen.findByRole("button", { name: "apply" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "apply" })).toBeDefined());
    expect(screen.queryByText("Filtered by")).toBeNull();
  });
});
