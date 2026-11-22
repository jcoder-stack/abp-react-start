// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { type AbpQueryStore, useAbpTable } from "@/components/abp/table/use-abp-table";
import { parseQuerySearch, queryStore } from "@/components/data-table/list-search";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

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

function makeSource(items: Book[], canCreate: boolean, seen?: (params: unknown) => void) {
  return (params: unknown): AbpTableSource<Book> => {
    seen?.(params);
    return {
      listQuery: {
        data: { items, totalCount: items.length },
        isPending: false,
        isFetching: false,
        isError: false,
      },
      pageCount: 1,
      totalCount: items.length,
      can: { create: canCreate, update: false, delete: false },
      supportsFilter: true,
    };
  };
}

describe("empty table", () => {
  function Harness(props: { canCreate: boolean; onOpen?: () => void }) {
    const t = useAbpTable(makeSource([], props.canCreate), { columns, onOpen: props.onOpen });
    return <t.Table />;
  }

  it("points at creating the first record when the user may create", async () => {
    const onOpen = vi.fn();
    renderWithProviders(<Harness canCreate onOpen={onOpen} />, { messages });
    expect(await screen.findByText("No data")).toBeDefined();

    // 工具栏里已有一个「新建」，空态里是第二个。
    const createButtons = screen.getAllByRole("button", { name: "Create" });
    fireEvent.click(createButtons[createButtons.length - 1]);

    expect(createButtons).toHaveLength(2);
    expect(onOpen).toHaveBeenCalledWith("create");
  });

  it("promises no next step to a user who cannot create", async () => {
    renderWithProviders(<Harness canCreate={false} onOpen={vi.fn()} />, { messages });
    expect(await screen.findByText("No data")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });

  it("drops the pager, which has nothing to page through", async () => {
    renderWithProviders(<Harness canCreate={false} />, { messages });
    expect(await screen.findByText("No data")).toBeDefined();
    expect(screen.queryByRole("link", { name: "1" })).toBeNull();
  });
});

describe("query params held outside the table", () => {
  const defaults = { Name: "", Year: "" };

  function Harness(props: { store: AbpQueryStore; seen: (params: unknown) => void }) {
    const t = useAbpTable(makeSource([{ id: "1", name: "Alpha" }], false, props.seen), {
      columns,
      query: { defaults, store: props.store },
    });
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            t.queryForm.setFieldValue("Year", "1984");
            void t.submitQuery();
          }}
        >
          apply
        </button>
        <button type="button" onClick={t.resetQuery}>
          reset
        </button>
        <t.queryForm.Subscribe selector={(s) => s.values.Name}>
          {(name) => <span data-testid="name-field">{name}</span>}
        </t.queryForm.Subscribe>
        <t.Table />
      </div>
    );
  }

  it("requests with what the store holds and shows it in the form", async () => {
    const seen = vi.fn();
    renderWithProviders(
      <Harness store={{ value: { Name: "orwell" }, onChange: vi.fn() }} seen={seen} />,
      { messages },
    );
    expect(await screen.findByText("Alpha")).toBeDefined();

    expect(seen.mock.calls[0][0]).toMatchObject({ Name: "orwell" });
    await waitFor(() => expect(screen.getByTestId("name-field").textContent).toBe("orwell"));
  });

  it("hands a submitted query to the store instead of keeping it", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness store={{ value: { Name: "orwell" }, onChange }} seen={vi.fn()} />,
      {
        messages,
      },
    );
    await waitFor(() => expect(screen.getByTestId("name-field").textContent).toBe("orwell"));

    fireEvent.click(screen.getByRole("button", { name: "apply" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ Name: "orwell", Year: "1984" }));
  });

  it("empties the store on reset", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness store={{ value: { Name: "orwell" }, onChange }} seen={vi.fn()} />,
      {
        messages,
      },
    );
    await waitFor(() => expect(screen.getByTestId("name-field").textContent).toBe("orwell"));

    fireEvent.click(screen.getByRole("button", { name: "reset" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({}));
  });
});

describe("query search params", () => {
  const defaults = { Name: "", Kind: 0, Active: false };

  it("reads only declared fields, as the type their default has", () => {
    expect(
      parseQuerySearch({ Name: 2024, Kind: "seven", Active: true, page: 3, other: "x" }, defaults),
    ).toEqual({ Name: "2024", Active: true });
  });

  it("keeps defaults out of the URL and marks a cleared default as empty", () => {
    const setSearch = vi.fn();
    const store = queryStore({}, { Name: "", Status: "open" }, setSearch);

    store.onChange({ Name: "orwell", Status: "open" });
    expect(setSearch).toHaveBeenLastCalledWith({ Name: "orwell", Status: undefined });

    store.onChange({});
    expect(setSearch).toHaveBeenLastCalledWith({ Name: undefined, Status: "" });
  });
});
