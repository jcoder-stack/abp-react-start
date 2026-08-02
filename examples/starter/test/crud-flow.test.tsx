// @vitest-environment jsdom
import { useMutation, useQuery } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import type { TableColumnDef } from "@/components/data-table/table-core";
import tableMessages from "@/components/data-table/table-messages.json";
import formMessages from "@/components/form/form-messages.json";
import { admin, renderWithProviders } from "./test-utils";

// CRUD 链路组件级冒烟：复刻 /books 页面（useAbpTable + useAbpSheet）的最小组合，字段仅 name，
// service 用内存 mock。三条序列各覆盖组合层真实运行时接线里的一处缺陷面，而非隔离单测的挂具。
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
interface BookFormValues {
  name: string;
}

const EMPTY_VALUES: BookFormValues = { name: "" };
const nameSchema = z.object({ name: z.string() });

function toRecordValues(record: Book): BookFormValues {
  return { name: record.name ?? "" };
}

function makeBook(id: string, name: string): Book {
  return { id, name };
}

/** 内存 CrudService：list 按调用次数逐页出结果（用于 C 序列断言失效重取后行消失）；create/update/delete 可脚本化 resolve/reject。 */
function createHarnessService(scripts: {
  create?: (data: { name: string }) => Promise<Book>;
  update?: (id: string, data: { name: string }) => Promise<Book>;
  del?: (id: string) => Promise<unknown>;
  listPages?: Book[][];
}) {
  const listPages = scripts.listPages ?? [[makeBook("1", "Book One"), makeBook("2", "Book Two")]];
  let listCall = 0;
  const list = vi.fn(async () => {
    const items = listPages[Math.min(listCall, listPages.length - 1)];
    listCall += 1;
    return { items, totalCount: items.length };
  });
  const create = vi.fn(scripts.create ?? (async (): Promise<Book> => makeBook("3", "New Book")));
  const update = vi.fn(scripts.update ?? (async (): Promise<Book> => makeBook("1", "Updated")));
  const del = vi.fn(scripts.del ?? (async (): Promise<undefined> => undefined));
  // 描述符不带 policy（对标 books.tsx 的 demo 后端无权限策略），source.can.* 全部解析为 true。
  // 假 hook 只脚本化最叶子 queryFn/mutationFn；facade 已把 {data}/{id,data}/{id} 拆回旧外观，
  // 故叶子仍按旧签名收参（vi.mock 在 ESM 下换不了 orval hook 内部对裸函数的局部引用，只能这样包）。
  const service = createCrudService<Book, { name: string }, { name: string }>({
    useList: (params, options) =>
      useQuery({ queryKey: ["books", params], queryFn: () => list(), ...options?.query }),
    useCreate: (options) =>
      useMutation({
        mutationFn: (v: { data: { name: string } }) => create(v.data),
        ...options?.mutation,
      }),
    useUpdate: (options) =>
      useMutation({
        mutationFn: (v: { id: string; data: { name: string } }) => update(v.id, v.data),
        ...options?.mutation,
      }),
    useDelete: (options) =>
      useMutation({ mutationFn: (v: { id: string }) => del(v.id), ...options?.mutation }),
    listKey: () => ["books"],
    supportsFilter: false,
  });
  return { service, list, create, update, del };
}

/** books.tsx 组合模式最小复刻：useAbpSheet（表单侧）先声明，useAbpTable 接 sheet.open。 */
function Harness({ service }: { service: ReturnType<typeof createHarnessService>["service"] }) {
  const sheet = useAbpSheet(service, {
    emptyValues: EMPTY_VALUES,
    toValues: (record: Book) => toRecordValues(record),
    toCreate: (value: BookFormValues) => ({ name: value.name }),
    toUpdate: (value: BookFormValues) => ({ name: value.name }),
    schema: () => nameSchema,
  });

  const columns: TableColumnDef<Book>[] = [{ accessorKey: "name", header: "Book" }];
  const t = useAbpTable(service, { columns, onOpen: sheet.open });

  return (
    <section>
      <t.Table />
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => <field.TextField label="Name" disabled={sheet.readOnly} />}
        </sheet.form.AppField>
      </sheet.Sheet>
    </section>
  );
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("tr");
  if (!row) throw new Error(`row containing "${text}" not found`);
  return row as HTMLElement;
}

describe("crud flow smoke", () => {
  it("A: open(edit, record) populates the form; close, then open(create) is empty again", async () => {
    const { service } = createHarnessService({});
    renderWithProviders(<Harness service={service} />, { identity: admin, messages });

    await screen.findByText("Book One");
    // 行操作已收进 "···" 菜单：Radix DropdownMenuTrigger 只在 onPointerDown 上开合
    fireEvent.pointerDown(within(rowOf("Book One")).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(nameInput.value).toBe("Book One");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    const nameInputAfterCreate = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(nameInputAfterCreate.value).toBe("");
  });

  it("B: server field error, then resubmit without editing calls create a second time and the error clears", async () => {
    let attempt = 0;
    const { service, create } = createHarnessService({
      create: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw { validationErrors: [{ message: "Name taken", members: ["name"] }] };
        }
        return makeBook("9", "Unique");
      },
    });
    renderWithProviders(<Harness service={service} />, { identity: admin, messages });

    await screen.findByText("Book One");
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Duplicate" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText("Name taken");
    expect(create).toHaveBeenCalledTimes(1);

    // 不改值、不做任何手动清理，直接再次提交：useAppForm 的 handleSubmit 在重跑校验前
    // 自动清掉上一轮服务端错误，残留的字段错误不会拦住这次重提交。
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenLastCalledWith({ name: "Duplicate" });
    await waitFor(() => expect(screen.queryByText("Name taken")).toBeNull());
  });

  it("C: delete resolves like a 204 (undefined body) and the row disappears after invalidate", async () => {
    const { service, del } = createHarnessService({
      del: async () => undefined,
      listPages: [
        [makeBook("1", "Book One"), makeBook("2", "Book Two")],
        [makeBook("2", "Book Two")],
      ],
    });
    renderWithProviders(<Harness service={service} />, { identity: admin, messages });

    await screen.findByText("Book One");
    // 行操作已收进 "···" 菜单：Radix DropdownMenuTrigger 只在 onPointerDown 上开合
    fireEvent.pointerDown(within(rowOf("Book One")).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del).toHaveBeenCalledWith("1");
    await waitFor(() => expect(screen.queryByText("Book One")).toBeNull());
    expect(screen.getByText("Book Two")).toBeDefined();
  });
});
