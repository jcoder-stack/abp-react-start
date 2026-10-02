// @vitest-environment jsdom
import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import { admin, renderWithProviders } from "./test-utils";

interface Book {
  id: string;
  name: string;
}

const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Book" }];

describe("useAbpTable initialFilter", () => {
  it("深链预填：首个列表请求就带上搜索词，搜索框里也显示它", async () => {
    const seen = vi.fn();
    const service = createCrudService<Book, { name: string }, { name: string }>({
      useList: (params, options) =>
        useQuery({
          queryKey: ["books", params],
          queryFn: async () => {
            seen(params);
            return { items: [{ id: "1", name: "1984" }], totalCount: 1 };
          },
          ...options?.query,
        }),
      listKey: () => ["books"],
    });
    function Harness() {
      const t = useAbpTable(service, { columns, initialFilter: "orwell" });
      return <t.Table />;
    }
    renderWithProviders(<Harness />, { identity: admin, messages: tableMessages });

    await screen.findByText("1984");
    await waitFor(() => expect(seen).toHaveBeenCalled());
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ Filter: "orwell" });
    expect(screen.getByDisplayValue("orwell")).toBeTruthy();
  });
});
