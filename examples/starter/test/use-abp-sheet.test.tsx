// @vitest-environment jsdom

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AbpApiError } from "@/api/mutator";
import crudMessages from "@/components/abp/crud/crud-messages.json";
import type { WritableCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";
import formMessages from "@/components/form/form-messages.json";
import type { SheetFormMode } from "@/components/form/sheet-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { renderWithProviders } from "./test-utils";

const messages = {
  en: { "": { ...formMessages.en[""], ...crudMessages.en[""] } },
  "zh-Hans": { "": { ...formMessages["zh-Hans"][""], ...crudMessages["zh-Hans"][""] } },
};

interface Dto {
  id?: string;
  name?: string;
  concurrencyStamp?: string | null;
}
interface Values {
  name: string;
}
interface UpdateInput {
  name: string;
  concurrencyStamp?: string;
}

/** 假 service：`useCreate`/`useUpdate` 用 `vi.fn()` 驱动的 `mutateAsync`,取代原 `useAbpCrud` 时代
 * 手写的 crud bridge，断言直接盯 orval 变量形状（`{data}` / `{id,data}`),而不是 useAbpSheet
 * 内部 facade 拆包前的旧外观。 */
function makeService(overrides?: {
  update?: (vars: { id: string; data: UpdateInput }) => Promise<unknown>;
}): WritableCrudService<Dto, { name: string }, UpdateInput> {
  const createMutateAsync = vi.fn(async (_vars: { data: { name: string } }) => ({}));
  const updateMutateAsync = vi.fn(overrides?.update ?? (async () => ({})));
  return {
    useList: () => ({ data: undefined, isPending: false, isFetching: false, isError: false }),
    useCreate: () => ({ mutateAsync: createMutateAsync, isPending: false }),
    useUpdate: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
    listKey: () => ["test-service"],
    resolvedPolicies: {},
  } as WritableCrudService<Dto, { name: string }, UpdateInput>;
}
type Service = ReturnType<typeof makeService>;
type OpenFn = (mode: SheetFormMode, record?: Dto) => Promise<void>;

function Harness(props: {
  service: Service;
  openRef: { current: OpenFn | null };
  toValues?: (record: Dto, mode: SheetFormMode) => Values | Promise<Values | null>;
}) {
  const sheet = useAbpSheet<Dto, Values, { name: string }, UpdateInput>(props.service, {
    emptyValues: { name: "" },
    toValues: props.toValues ?? ((record) => ({ name: record.name ?? "" })),
    toCreate: (value) => ({ name: value.name }),
    toUpdate: (value) => ({ name: value.name }),
    schema: () => z.object({ name: z.string().min(1, "REQ") }),
  });
  props.openRef.current = sheet.open;
  return (
    <sheet.Sheet>
      <sheet.form.AppForm>
        <sheet.form.FormErrors />
      </sheet.form.AppForm>
      <sheet.form.AppField name="name">
        {(field) => <field.TextField label="Name" required disabled={sheet.readOnly} />}
      </sheet.form.AppField>
    </sheet.Sheet>
  );
}

/** `toValues`/`toCreate`/`toUpdate` 全部省略的挂具：`Values`={name:string} 与 `TCreate`/
 * `UpdateInput` 结构相同,三个映射的默认实现（identity 与 pick-and-coalesce）在这个组合下
 * 编译期本就允许省略（见 `abp-sheet-contract.test-d.ts` 的闸门三),这里补运行时证据，默认实现
 * 真的把值接对了，而不仅仅是「编译期允许省略」这一件事。 */
function DefaultMapperHarness(props: { service: Service; openRef: { current: OpenFn | null } }) {
  const sheet = useAbpSheet<Dto, Values, { name: string }, UpdateInput>(props.service, {
    emptyValues: { name: "" },
    schema: () => z.object({ name: z.string().min(1, "REQ") }),
  });
  props.openRef.current = sheet.open;
  return (
    <sheet.Sheet>
      <sheet.form.AppForm>
        <sheet.form.FormErrors />
      </sheet.form.AppForm>
      <sheet.form.AppField name="name">
        {(field) => <field.TextField label="Name" required disabled={sheet.readOnly} />}
      </sheet.form.AppField>
    </sheet.Sheet>
  );
}

/** 带真实打开入口的挂具：一个直接打开的按钮、一个行操作式的下拉菜单，用来验证焦点归还。 */
function OpenerHarness(props: { service: Service; record: Dto }) {
  const sheet = useAbpSheet<Dto, Values, { name: string }, UpdateInput>(props.service, {
    emptyValues: { name: "" },
    toValues: (record) => ({ name: record.name ?? "" }),
    toUpdate: (value) => ({ name: value.name }),
    toCreate: (value) => ({ name: value.name }),
  });
  return (
    <>
      <button type="button" onClick={() => void sheet.open("view", props.record)}>
        Open
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => void sheet.open("view", props.record)}>
            View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <sheet.Sheet>
        <sheet.form.AppField name="name">
          {(field) => <field.TextField label="Name" disabled={sheet.readOnly} />}
        </sheet.form.AppField>
      </sheet.Sheet>
    </>
  );
}

function submitSheetForm() {
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

/** renderWithProviders 挂在 RouterProvider 下,首次挂载在 render() 返回后的微任务才提交;
 * 提前调用 openRef.current 会读到尚未赋值的 null(可选链静默吞掉),须等它就绪再触发。 */
async function callOpen(openRef: { current: OpenFn | null }, mode: SheetFormMode, record?: Dto) {
  await waitFor(() => expect(openRef.current).not.toBeNull());
  await act(async () => {
    await openRef.current?.(mode, record);
  });
}

describe("useAbpSheet", () => {
  it("create 流:open→填写→提交调 useCreate 的 mutateAsync,成功后 sheet 关闭", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "create");
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "abc" } });
    submitSheetForm();
    await waitFor(() =>
      expect(service.useCreate().mutateAsync).toHaveBeenCalledWith({ data: { name: "abc" } }),
    );
    await waitFor(() => expect(screen.queryByLabelText(/Name/)).toBeNull());
  });

  it("edit 流:record 带 concurrencyStamp 时自动注入 update input", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "edit", { id: "1", name: "Old", concurrencyStamp: "S1" });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    await waitFor(() =>
      expect(service.useUpdate().mutateAsync).toHaveBeenCalledWith({
        id: "1",
        data: { name: "New", concurrencyStamp: "S1" },
      }),
    );
  });

  it("edit 流:record 无 stamp 时 input 不带 concurrencyStamp 键", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "edit", { id: "2", name: "Old" });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    await waitFor(() => expect(service.useUpdate().mutateAsync).toHaveBeenCalled());
    const arg = (service.useUpdate().mutateAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.data).toEqual({ name: "New" });
    expect("concurrencyStamp" in arg.data).toBe(false);
  });

  it("toValues 返回 null:sheet 不打开", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(
      <Harness service={service} openRef={openRef} toValues={async () => null} />,
      { messages },
    );
    await callOpen(openRef, "edit", { id: "1", name: "X" });
    expect(screen.queryByLabelText(/Name/)).toBeNull();
  });

  it("view 模式:字段渲染成键值行而不是禁用控件", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "view", { id: "1", name: "RO" });
    // 值以文本呈现：禁用控件的对比度是 WCAG 豁免的，豁免的前提就是它不承载内容
    expect(await screen.findByText("RO")).toBeTruthy();
    // 且不再有可聚焦的输入框——查看一条记录不该让人以为能改
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("从查看态进入编辑后取消：回到查看态而不是关掉抽屉，改动被丢弃", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "view", { id: "1", name: "Old" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // 有改动先确认；确认放弃后退回查看态，显示的仍是原值
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(await screen.findByText("Old")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("从查看态进入编辑后保存：回到查看态并换上服务端返回的记录", async () => {
    const service = makeService({
      update: async ({ id, data }) => ({ id, name: data.name, concurrencyStamp: "S2" }),
    });
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "view", { id: "1", name: "Old", concurrencyStamp: "S1" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    expect(await screen.findByText("New")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    // 再改一次要带新的 stamp，旧的会撞并发冲突
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Newer" } });
    submitSheetForm();
    await waitFor(() =>
      expect(service.useUpdate().mutateAsync).toHaveBeenLastCalledWith({
        id: "1",
        data: { name: "Newer", concurrencyStamp: "S2" },
      }),
    );
  });

  it("从查看态保存但服务端没回记录：关闭抽屉，不拿旧记录充数", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "view", { id: "1", name: "Old", concurrencyStamp: "S1" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("关闭后焦点回到打开它的按钮", async () => {
    renderWithProviders(<OpenerHarness service={makeService()} record={{ id: "1", name: "R" }} />, {
      messages,
    });
    const opener = await screen.findByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("从下拉菜单打开时，关闭后焦点回到菜单的触发钮", async () => {
    renderWithProviders(<OpenerHarness service={makeService()} record={{ id: "1", name: "R" }} />, {
      messages,
    });
    const trigger = await screen.findByRole("button", { name: "Actions" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "View" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("服务端校验错误落字段,sheet 保持打开", async () => {
    const service = makeService({
      update: async () => {
        throw new AbpApiError(
          400,
          { error: { validationErrors: [{ message: "TAKEN", members: ["Name"] }] } },
          "PUT",
          "/api/test",
        );
      },
    });
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "edit", { id: "1", name: "Old", concurrencyStamp: "S1" });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    expect(await screen.findByText("TAKEN")).toBeTruthy();
    expect(screen.queryByLabelText(/Name/)).toBeTruthy();
  });

  it("提交进行中 submit 按钮禁用:pending 由 form.isSubmitting 驱动(不依赖 mutation.isPending 标志)", async () => {
    let resolveUpdate: (() => void) | null = null;
    const service = makeService({
      update: () =>
        new Promise<void>((resolve) => {
          resolveUpdate = () => resolve();
        }),
    });
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, {
      messages,
    });
    await callOpen(openRef, "edit", { id: "1", name: "Old", concurrencyStamp: "S1" });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    // Sheet 内容经 Radix Portal 挂在 document.body,不在 RTL render() 返回的 container 子树内。
    const saveBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(true));
    // resolveUpdate 要等 onSubmitAsync 真正跑到 mutateAsync 才会被赋值。早于
    // 此的 resolveUpdate?.() 是静默空调用,永远 resolve 不了 update promise。
    await waitFor(() => expect(resolveUpdate).not.toBeNull());
    await act(async () => {
      resolveUpdate?.();
    });
    await waitFor(() => expect(screen.queryByLabelText(/Name/)).toBeNull());
  });

  it("省略 toCreate 时走默认 identity 映射创建", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<DefaultMapperHarness service={service} openRef={openRef} />, {
      messages,
    });
    await callOpen(openRef, "create");
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Dune" } });
    submitSheetForm();
    await waitFor(() =>
      expect(service.useCreate().mutateAsync).toHaveBeenCalledWith({ data: { name: "Dune" } }),
    );
  });

  it("省略 toValues 时走默认 pick-and-coalesce 回填", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<DefaultMapperHarness service={service} openRef={openRef} />, {
      messages,
    });
    await callOpen(openRef, "edit", { id: "1", name: "Existing", concurrencyStamp: "S1" });
    const nameInput = (await screen.findByLabelText(/Name/)) as HTMLInputElement;
    expect(nameInput.value).toBe("Existing");
  });
});

type SheetApi = ReturnType<typeof useAbpSheet<Dto, Values, { name: string }, UpdateInput>>;

/** 把整个返回值交给测试：close / open 的返回值 / onSaved 都要从外面断言。 */
function ApiHarness(props: {
  service: Service;
  apiRef: { current: SheetApi | null };
  toValues?: (record: Dto, mode: SheetFormMode) => Values | Promise<Values | null>;
  onSaved?: (saved: Dto | undefined, mode: "create" | "edit") => void;
  continueCreate?: boolean;
}) {
  const sheet = useAbpSheet<Dto, Values, { name: string }, UpdateInput>(props.service, {
    emptyValues: { name: "" },
    toValues: props.toValues ?? ((record) => ({ name: record.name ?? "" })),
    toCreate: (value) => ({ name: value.name }),
    toUpdate: (value) => ({ name: value.name }),
    onSaved: props.onSaved,
    continueCreate: props.continueCreate,
  });
  props.apiRef.current = sheet;
  return (
    <sheet.Sheet
      footerStart={<button type="button">Remove record</button>}
      footerEnd={<button type="button">Duplicate record</button>}
    >
      <sheet.form.AppField name="name">
        {(field) => <field.TextField label="Name" disabled={sheet.readOnly} />}
      </sheet.form.AppField>
    </sheet.Sheet>
  );
}

async function ready(apiRef: { current: SheetApi | null }): Promise<SheetApi> {
  await waitFor(() => expect(apiRef.current).not.toBeNull());
  return apiRef.current as SheetApi;
}

describe("useAbpSheet 打开与关闭的边界", () => {
  it("连点两条记录、先点的预取更慢：抽屉里是后点的那一条", async () => {
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(
      <ApiHarness
        service={makeService()}
        apiRef={apiRef}
        toValues={async (record) => {
          if (record.id === "slow") await slow;
          return { name: record.name ?? "" };
        }}
      />,
      { messages },
    );
    const api = await ready(apiRef);
    let first: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      first = api.open("view", { id: "slow", name: "Slow" });
      await api.open("view", { id: "fast", name: "Fast" });
    });
    await act(async () => {
      releaseSlow();
      expect(await first).toBe(false);
    });
    expect(screen.getByText("Fast")).toBeTruthy();
    expect(screen.queryByText("Slow")).toBeNull();
  });

  it("toValues 抛错：不打开，open 返回 false 而不是抛出", async () => {
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(
      <ApiHarness
        service={makeService()}
        apiRef={apiRef}
        toValues={async () => {
          throw new Error("network");
        }}
      />,
      { messages },
    );
    const api = await ready(apiRef);
    let opened = true;
    await act(async () => {
      opened = await api.open("view", { id: "1", name: "X" });
    });
    expect(opened).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("从查看态切到编辑会按 edit 重算表单值", async () => {
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(
      <ApiHarness
        service={makeService()}
        apiRef={apiRef}
        toValues={(record, mode) => ({ name: mode === "edit" ? "" : (record.name ?? "") })}
      />,
      { messages },
    );
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("view", { id: "1", name: "Secret" });
    });
    expect(screen.getByText("Secret")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const input = (await screen.findByLabelText(/Name/)) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("从查看态进入编辑后按 Esc：回到查看态而不是关掉抽屉", async () => {
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={makeService()} apiRef={apiRef} />, { messages });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("view", { id: "1", name: "Kept" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText(/Name/);
    // 只走 Radix 在 document 捕获阶段的那条路径，不经抽屉自己的 onKeyDown 兜底。
    fireEvent.keyDown(document, { key: "Escape" });
    expect(await screen.findByText("Kept")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("close() 遇到未保存改动先确认；force 直接关", async () => {
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={makeService()} apiRef={apiRef} />, { messages });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("create");
    });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "typed" } });
    act(() => apiRef.current?.close());
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe("typed");
    act(() => apiRef.current?.close({ force: true }));
    await waitFor(() => expect(screen.queryByLabelText(/Name/)).toBeNull());
  });

  it("没有新建权限时 create 打不开；没有编辑权限时 edit 降级为查看", async () => {
    const service = {
      ...makeService(),
      resolvedPolicies: { create: "Books.Create", update: "Books.Edit" },
    };
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={service} apiRef={apiRef} />, { messages });
    const api = await ready(apiRef);
    let created = true;
    await act(async () => {
      created = await api.open("create");
    });
    expect(created).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      await api.open("edit", { id: "1", name: "Locked" });
    });
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("toValues 要等时先滑出抽屉显示加载，值到了再显示字段", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(
      <ApiHarness
        service={makeService()}
        apiRef={apiRef}
        toValues={async (record) => {
          await gate;
          return { name: record.name ?? "" };
        }}
      />,
      { messages },
    );
    const api = await ready(apiRef);
    let opening: Promise<boolean> = Promise.resolve(false);
    act(() => {
      opening = api.open("view", { id: "1", name: "Arrived" });
    });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Arrived")).toBeNull();
    await act(async () => {
      release();
      await opening;
    });
    expect(screen.getByText("Arrived")).toBeTruthy();
  });

  it("查看态底栏显示页面给的操作，编辑态不显示", async () => {
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={makeService()} apiRef={apiRef} />, { messages });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("view", { id: "1", name: "R" });
    });
    expect(screen.getByRole("button", { name: "Remove record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Duplicate record" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText(/Name/);
    expect(screen.queryByRole("button", { name: "Remove record" })).toBeNull();
  });

  it("打开新建时焦点在第一个字段；从查看态点编辑后焦点也接到第一个字段", async () => {
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={makeService()} apiRef={apiRef} />, { messages });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("create");
    });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Name/)));
    act(() => api.close({ force: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => {
      await api.open("view", { id: "1", name: "R" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Name/)));
  });

  it("⌘/Ctrl+Enter 提交表单", async () => {
    const service = makeService();
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={service} apiRef={apiRef} />, { messages });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("create");
    });
    const input = await screen.findByLabelText(/Name/);
    fireEvent.change(input, { target: { value: "Quick" } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    await waitFor(() =>
      expect(service.useCreate().mutateAsync).toHaveBeenCalledWith({ data: { name: "Quick" } }),
    );
  });

  it("保存并继续新建：抽屉不关，表单清空，可以接着录下一条", async () => {
    const service = makeService();
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={service} apiRef={apiRef} continueCreate />, {
      messages,
    });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("create");
    });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and add another" }));
    await waitFor(() =>
      expect(service.useCreate().mutateAsync).toHaveBeenCalledWith({ data: { name: "First" } }),
    );
    await waitFor(() => expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe(""));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("保存成功后把服务端记录交给 onSaved", async () => {
    const onSaved = vi.fn();
    const service = makeService({
      update: async ({ id, data }) => ({ id, name: data.name, concurrencyStamp: "S2" }),
    });
    const apiRef: { current: SheetApi | null } = { current: null };
    renderWithProviders(<ApiHarness service={service} apiRef={apiRef} onSaved={onSaved} />, {
      messages,
    });
    const api = await ready(apiRef);
    await act(async () => {
      await api.open("edit", { id: "1", name: "Old" });
    });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "New" } });
    submitSheetForm();
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        { id: "1", name: "New", concurrencyStamp: "S2" },
        "edit",
      ),
    );
  });
});

/** 编译期护栏(文档性质,非本文件运行时断言)：`useAbpSheet` 要求可写 service,只读 service
 * (未传 useCreate/useUpdate)必须编译期报错，`examples/starter/tsconfig.json` 的 include 只覆盖
 * `src/**`,`test/` 下的类型错误不进 `npm run typecheck`,真正的强制闸门是 use-abp-sheet.tsx 里
 * `WritableCrudService` 这个入参类型本身;这里保留一份可读探针供人工核对/未来收紧。 */
function useReadOnlyServiceRejectionProbe() {
  const readOnlyService = {
    useList: () => ({ data: undefined, isPending: false, isFetching: false, isError: false }),
    listKey: () => ["ro"] as const,
    resolvedPolicies: {},
  };
  // @ts-expect-error 只读 service 缺 useCreate/useUpdate,useAbpSheet 的入参类型是 WritableCrudService
  useAbpSheet(readOnlyService, { emptyValues: { name: "" } });
}
void useReadOnlyServiceRejectionProbe;
