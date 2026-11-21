// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { createAbpColumns } from "@/components/abp/table/column-presets";
import {
  type AbpTableExportContext,
  type AbpTableRowConfig,
  useAbpTable,
} from "@/components/abp/table/use-abp-table";
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
  locked?: boolean;
  stock?: number;
}

const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Name" }];
const books: Book[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta", locked: true },
  { id: "3", name: "Gamma" },
];

function makeSource(refetch?: () => void, items: Book[] = books): () => AbpTableSource<Book> {
  return () => ({
    listQuery: {
      data: { items, totalCount: items.length },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch,
    },
    pageCount: 1,
    totalCount: items.length,
    delete: { mutate: vi.fn() },
    can: { create: true, update: true, delete: true },
    supportsFilter: true,
  });
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
  vi.mocked(toast.error).mockClear();
});

async function selectAll() {
  expect(await screen.findByText("Alpha")).toBeDefined();
  fireEvent.click((await screen.findAllByRole("checkbox"))[0]);
}

describe("t.BulkAction", () => {
  function Harness(props: {
    run: (row: Book) => Promise<unknown>;
    canRun?: (row: Book) => boolean;
    refetch?: () => void;
    confirm?: boolean;
  }) {
    const t = useAbpTable(makeSource(props.refetch), { columns, selectable: true });
    return (
      <t.Table>
        <t.BulkBar>
          <t.BulkAction
            label="Archive"
            run={props.run}
            canRun={props.canRun}
            confirm={props.confirm ? { title: "Archive these?" } : undefined}
          />
        </t.BulkBar>
      </t.Table>
    );
  }

  it("runs once per selected row, reports one success and refetches once", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn();
    renderWithProviders(<Harness run={run} refetch={refetch} />, { messages });
    await selectAll();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("3 items updated"));
    expect(run.mock.calls.map(([row]) => row.id)).toEqual(["1", "2", "3"]);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("skips rows the action does not apply to and says so", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<Harness run={run} canRun={(row) => !row.locked} />, { messages });
    await selectAll();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "2 updated, 0 failed, 1 skipped as not applicable",
      ),
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps only the failed rows selected so they can be retried", async () => {
    const run = vi.fn((row: Book) =>
      row.id === "2" ? Promise.reject(new Error("nope")) : Promise.resolve(),
    );
    renderWithProviders(<Harness run={run} />, { messages });
    await selectAll();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("2 updated, 1 failed"));
    const rowChecks = (await screen.findAllByRole("checkbox")).slice(1);
    expect(rowChecks.map((c) => c.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("waits for confirmation when one is configured", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<Harness run={run} confirm />, { messages });
    await selectAll();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Archive these?")).toBeDefined();
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Archive", hidden: false }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(3));
  });
});

describe("row.canEdit", () => {
  const row: AbpTableRowConfig<Book> = { canEdit: (book) => !book.locked };

  function Harness() {
    const t = useAbpTable(makeSource(), { columns, onOpen: vi.fn(), row });
    return <t.Table />;
  }

  it("drops the Edit item only on rows it rejects", async () => {
    renderWithProviders(<Harness />, { messages });
    expect(await screen.findByText("Alpha")).toBeDefined();
    const triggers = screen.getAllByRole("button", { name: "Actions" });

    fireEvent.pointerDown(triggers[0]);
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeDefined();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull());

    fireEvent.pointerDown(triggers[1]);
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
  });
});

describe("t.Utility", () => {
  it("puts caller content into the toolbar's utility group", async () => {
    function Harness() {
      const t = useAbpTable(makeSource(), { columns });
      return (
        <t.Table>
          <t.Utility>
            <button type="button">Print</button>
          </t.Utility>
        </t.Table>
      );
    }
    renderWithProviders(<Harness />, { messages });
    expect(await screen.findByRole("button", { name: "Print" })).toBeDefined();
  });
});

describe("onExport context", () => {
  it("hands over the committed request params and the selected rows", async () => {
    let received: AbpTableExportContext<Book> | undefined;
    function Harness() {
      const t = useAbpTable(makeSource(), {
        columns,
        selectable: true,
        initialFilter: "al",
        onExport: (context) => {
          received = context;
        },
      });
      return <t.Table />;
    }
    renderWithProviders(<Harness />, { messages });
    await selectAll();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(received?.getListParams()).toMatchObject({ Filter: "al", SkipCount: 0 });
    expect(received?.getSelectedRows().map((book) => book.id)).toEqual(["1", "2", "3"]);
  });
});

describe("number and datetime presets", () => {
  const col = createAbpColumns<Book & { createdAt?: string }>();

  function Harness(props: { columns: TableColumnDef<Book & { createdAt?: string }>[] }) {
    const t = useAbpTable(
      () => ({
        ...makeSource(undefined, [])(),
        listQuery: {
          data: {
            items: [
              { id: "1", name: "Alpha", stock: 1234567.5, createdAt: "2026-03-02T09:14:00Z" },
            ],
            totalCount: 1,
          },
          isPending: false,
          isFetching: false,
          isError: false,
        },
      }),
      { columns: props.columns },
    );
    return <t.Table />;
  }

  it("groups digits in number and money columns", async () => {
    const cols = [
      col.number("stock", "Table:Columns"),
      col.money("stock", "Table:Sort", { id: "stockMoney" }),
    ];
    renderWithProviders(<Harness columns={cols} />, { messages });
    expect(await screen.findByText("1,234,567.5")).toBeDefined();
    expect(screen.getByText("1,234,567.50")).toBeDefined();
  });

  it("shows an instant in the tenant time zone format", async () => {
    const cols = [col.datetime("createdAt", "Table:Columns")];
    renderWithProviders(<Harness columns={cols} />, { messages });
    expect(await screen.findByText("2026-03-02 09:14")).toBeDefined();
  });
});
