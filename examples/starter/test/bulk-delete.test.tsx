// @vitest-environment jsdom
import { useMutation, useQuery } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { admin, renderWithProviders } from "./test-utils";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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

const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Book" }];
const ALL: Book[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
  { id: "3", name: "Gamma" },
];

/** 内存 service：`del` 可脚本化成逐 id 成功或抛错；list 每次返回未被删掉的行。 */
function makeService(del: (id: string) => Promise<unknown>) {
  const deleted = new Set<string>();
  const spy = vi.fn(async (id: string) => {
    const result = await del(id);
    deleted.add(id);
    return result;
  });
  const service = createCrudService<Book, { name: string }, { name: string }>({
    useList: (params, options) =>
      useQuery({
        queryKey: ["books", params],
        queryFn: async () => {
          const items = ALL.filter((b) => !deleted.has(b.id));
          return { items, totalCount: items.length };
        },
        ...options?.query,
      }),
    useDelete: (options) =>
      useMutation({ mutationFn: (v: { id: string }) => spy(v.id), ...options?.mutation }),
    listKey: () => ["books"],
    supportsFilter: false,
  });
  return { service, spy };
}

function ServiceHarness({ service }: { service: ReturnType<typeof makeService>["service"] }) {
  const t = useAbpTable(service, { columns, selectable: true });
  return (
    <t.Table>
      <t.BulkBar>
        <t.BulkDelete />
      </t.BulkBar>
    </t.Table>
  );
}

/** 自实现数据源（L1 回调），刻意不给 `delete.many`，用来锁「数据源不支持批量删就不渲染按钮」。 */
function CallbackHarness() {
  const t = useAbpTable<Book>(
    () => ({
      listQuery: {
        data: { items: ALL, totalCount: ALL.length },
        isPending: false,
        isFetching: false,
        isError: false,
      },
      pageCount: 1,
      totalCount: ALL.length,
      delete: { mutate: () => {} },
      can: { create: false, update: false, delete: true },
      supportsFilter: false,
    }),
    { columns, selectable: true },
  );
  return (
    <t.Table>
      <t.BulkBar>
        <t.BulkDelete />
        <button type="button">sentinel</button>
      </t.BulkBar>
    </t.Table>
  );
}

async function selectAllAndConfirm() {
  const checkboxes = await screen.findAllByRole("checkbox");
  fireEvent.click(checkboxes[0]); // 表头全选
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
}

describe("t.BulkDelete", () => {
  // toast 的 spy 是模块级的，不清会让前一条用例的调用泄漏进后面的 not.toHaveBeenCalled 断言。
  beforeEach(() => vi.clearAllMocks());

  it("删 N 条只发一条成功提示，而不是每条一条", async () => {
    const { service, spy } = makeService(async () => undefined);
    renderWithProviders(<ServiceHarness service={service} />, { identity: admin, messages });
    await screen.findByText("Alpha");

    await selectAllAndConfirm();

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(spy.mock.calls.map(([id]) => id)).toEqual(["1", "2", "3"]);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("部分失败给汇总提示，失败的行留在勾选里", async () => {
    const { service, spy } = makeService(async (id) => {
      if (id === "2") throw new Error("409");
      return undefined;
    });
    renderWithProviders(<ServiceHarness service={service} />, { identity: admin, messages });
    await screen.findByText("Alpha");

    await selectAllAndConfirm();

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(toast.warning).toHaveBeenCalledWith("Deleted 2, 1 failed");
    expect(toast.success).not.toHaveBeenCalled();
    // 成功的两行随失效重取离场；失败的 Beta 留下且仍勾着，用户能直接重试而不用重新框选。
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    expect(screen.queryByText("Gamma")).toBeNull();
    const betaRow = screen.getByText("Beta").closest("tr") as HTMLElement;
    expect(within(betaRow).getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("整批失败给失败提示", async () => {
    const { service } = makeService(async () => {
      throw new Error("500");
    });
    renderWithProviders(<ServiceHarness service={service} />, { identity: admin, messages });
    await screen.findByText("Alpha");

    await selectAllAndConfirm();

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("数据源没提供 delete.many 时不渲染按钮", async () => {
    renderWithProviders(<CallbackHarness />, { identity: admin, messages });
    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    // sentinel 在位 = 批量条确实渲染了，缺的只是删除按钮本身。
    expect(await screen.findByRole("button", { name: "sentinel" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
