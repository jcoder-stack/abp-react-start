// @vitest-environment jsdom
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/data-table/data-table";
import { localStoragePreferences } from "@/components/data-table/data-table-preferences";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableViewMenu } from "@/components/data-table/data-table-view-menu";
import {
  listStateFromSearch,
  listStateToSearch,
  parseListSearch,
  searchListStore,
} from "@/components/data-table/list-search";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { useDataTable } from "@/components/data-table/use-data-table";
import {
  type DataTableListState,
  useDataTableState,
} from "@/components/data-table/use-data-table-state";
import { renderWithProviders } from "./test-utils";

const messages = tableMessages;

beforeEach(() => {
  window.localStorage.clear();
});

describe("list search params", () => {
  it("keeps the default state out of the URL", () => {
    expect(listStateToSearch({ pageIndex: 0, pageSize: 10, sorting: [], filter: "" })).toEqual({
      page: undefined,
      size: undefined,
      sort: undefined,
      q: undefined,
    });
  });

  it("round-trips a non-default position", () => {
    const state: DataTableListState = {
      pageIndex: 2,
      pageSize: 20,
      sorting: [
        { id: "name", desc: false },
        { id: "creationTime", desc: true },
      ],
      filter: "orwell",
    };
    const search = listStateToSearch(state);
    expect(search).toEqual({ page: 3, size: 20, sort: "name,-creationTime", q: "orwell" });
    expect(listStateFromSearch(parseListSearch(search))).toEqual(state);
  });

  it("treats values it cannot read as absent instead of throwing", () => {
    expect(
      parseListSearch({ page: "abc", size: -5, sort: 7, q: "", other: "kept elsewhere" }),
    ).toEqual({});
  });

  it("reads a numeric keyword back as text", () => {
    expect(parseListSearch({ q: 2024 })).toEqual({ q: "2024" });
  });
});

describe("useDataTableState with an external list store", () => {
  it("reads the position from the store and falls back to defaults for missing keys", () => {
    const { result } = renderHook(() =>
      useDataTableState({
        defaultPageSize: 20,
        list: { value: { pageIndex: 4, filter: "ddd" }, onChange: vi.fn() },
      }),
    );
    expect(result.current.params).toEqual({
      pageIndex: 4,
      pageSize: 20,
      sorting: [],
      filter: "ddd",
    });
  });

  it("hands a committed search to the store as one change: new keyword, back on page 1", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useDataTableState({ list: { value: { pageIndex: 4 }, onChange } }),
    );
    act(() => result.current.commitSearch("orwell"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      pageIndex: 0,
      pageSize: 10,
      sorting: [],
      filter: "orwell",
    });
  });

  it("does not notify the store when nothing changed", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useDataTableState({ list: { value: {}, onChange } }));
    act(() => result.current.resetPaging());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("writes through searchListStore as a URL patch", () => {
    const setSearch = vi.fn();
    const { result } = renderHook(() =>
      useDataTableState({ list: searchListStore({ page: 3, q: "ddd" }, setSearch) }),
    );
    expect(result.current.params).toMatchObject({ pageIndex: 2, filter: "ddd" });
    act(() => result.current.onSortingChange([{ id: "name", desc: true }]));
    expect(setSearch).toHaveBeenCalledWith({ page: 3, size: undefined, sort: "-name", q: "ddd" });
  });
});

describe("view preferences", () => {
  it("remembers density and page size for the next mount", () => {
    const first = renderHook(() =>
      useDataTableState({ preferences: localStoragePreferences("prefs-remember") }),
    );
    act(() => first.result.current.setDensity("compact"));
    act(() => first.result.current.onPaginationChange((p) => ({ ...p, pageSize: 50 })));
    first.unmount();

    const second = renderHook(() =>
      useDataTableState({ preferences: localStoragePreferences("prefs-remember") }),
    );
    expect(second.result.current.density).toBe("compact");
    expect(second.result.current.params.pageSize).toBe(50);
  });

  it("keeps tables with different keys apart", () => {
    const a = renderHook(() =>
      useDataTableState({ preferences: localStoragePreferences("prefs-a") }),
    );
    act(() => a.result.current.setDensity("compact"));
    const b = renderHook(() =>
      useDataTableState({ preferences: localStoragePreferences("prefs-b") }),
    );
    expect(b.result.current.density).toBe("comfortable");
  });

  it("ignores stored content it does not recognize", () => {
    window.localStorage.setItem(
      "data-table:prefs-garbage",
      JSON.stringify({ density: "huge", pageSize: "many", columnVisibility: { name: "no" } }),
    );
    const { result } = renderHook(() =>
      useDataTableState({ preferences: localStoragePreferences("prefs-garbage") }),
    );
    expect(result.current.density).toBe("comfortable");
    expect(result.current.params.pageSize).toBe(10);
    expect(result.current.columnVisibility).toEqual({});
  });

  it("lets the page size in the link win over the remembered one", () => {
    window.localStorage.setItem("data-table:prefs-link", JSON.stringify({ pageSize: 50 }));
    const { result } = renderHook(() =>
      useDataTableState({
        preferences: localStoragePreferences("prefs-link"),
        list: { value: { pageSize: 20 }, onChange: vi.fn() },
      }),
    );
    expect(result.current.params.pageSize).toBe(20);
  });
});

interface Row {
  id: string;
  name: string;
}
const columns: TableColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "id", header: "ID" },
];
const data: Row[] = [{ id: "1", name: "Alpha" }];

function PersistedTable() {
  const state = useDataTableState({ preferences: localStoragePreferences("prefs-columns") });
  const dt = useDataTable({ state, columns, data });
  return (
    <DataTable table={dt}>
      <DataTableToolbar table={dt}>
        <DataTableViewMenu table={dt} />
      </DataTableToolbar>
    </DataTable>
  );
}

describe("column visibility with a preference store", () => {
  it("keeps a hidden column hidden after the table is mounted again", async () => {
    const first = renderWithProviders(<PersistedTable />, { messages });
    expect(await screen.findByRole("columnheader", { name: "ID" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "View settings" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "ID" }));
    expect(screen.queryByRole("columnheader", { name: "ID" })).toBeNull();
    first.unmount();

    renderWithProviders(<PersistedTable />, { messages });
    expect(await screen.findByRole("columnheader", { name: "Name" })).toBeDefined();
    expect(screen.queryByRole("columnheader", { name: "ID" })).toBeNull();
  });

  it("forgets the remembered view when the default is restored", async () => {
    const first = renderWithProviders(<PersistedTable />, { messages });
    fireEvent.click(await screen.findByRole("button", { name: "View settings" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "ID" }));
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore default view" }));
    first.unmount();

    renderWithProviders(<PersistedTable />, { messages });
    expect(await screen.findByRole("columnheader", { name: "ID" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "View settings" }));
    expect(
      (await screen.findByRole("button", { name: "Comfortable" })).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("search box clear button", () => {
  function SearchTable() {
    const state = useDataTableState({ initialFilter: "orwell" });
    const dt = useDataTable({ state, columns, data });
    return (
      <div>
        <span data-testid="filter">{state.params.filter}</span>
        <DataTable table={dt}>
          <DataTableToolbar table={dt} />
        </DataTable>
      </div>
    );
  }

  it("clears the keyword at once and disappears with it", async () => {
    renderWithProviders(<SearchTable />, { messages });
    fireEvent.click(await screen.findByRole("button", { name: "Clear search" }));

    expect(screen.getByTestId("filter").textContent).toBe("");
    expect((screen.getByPlaceholderText("Search…") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });
});
