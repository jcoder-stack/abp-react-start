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

  it("view 模式:readOnly 生效,字段 disabled", async () => {
    const service = makeService();
    const openRef: { current: OpenFn | null } = { current: null };
    renderWithProviders(<Harness service={service} openRef={openRef} />, { messages });
    await callOpen(openRef, "view", { id: "1", name: "RO" });
    const input = await screen.findByLabelText(/Name/);
    expect((input as HTMLInputElement).disabled).toBe(true);
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
