// @vitest-environment jsdom

import { revalidateLogic } from "@tanstack/react-form";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FieldRow, ReadOnlyFields, useAppForm } from "@/components/form/form-hook";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

const messages = formMessages;

function Harness(props: {
  onSubmit?: () => void;
  onSubmitAsync?: (arg: { value: { name: string } }) => Promise<unknown>;
}) {
  const form = useAppForm({
    defaultValues: { name: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: z.object({ name: z.string().min(1, "NAME_REQUIRED") }),
      onSubmitAsync: props.onSubmitAsync ?? (async () => null),
    },
    onSubmit: () => props.onSubmit?.(),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" required />}
      </form.AppField>
      <button type="submit">go</button>
    </form>
  );
}

describe("TextField", () => {
  it("渲染 label、必填星号与 aria-required,输入可写回", async () => {
    renderWithProviders(<Harness />, { messages });
    const input = await screen.findByLabelText(/Name/);
    expect(input.getAttribute("aria-required")).toBe("true");
    fireEvent.change(input, { target: { value: "abc" } });
    expect((input as HTMLInputElement).value).toBe("abc");
  });

  it("提交前不打扰,提交失败后字段错误内联可见", async () => {
    renderWithProviders(<Harness />, { messages });
    expect(screen.queryByText("NAME_REQUIRED")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "go" }));
    expect(await screen.findByText("NAME_REQUIRED")).toBeTruthy();
  });

  it("字段无效时输入标记 aria-invalid,初始不标记(a11y)", async () => {
    renderWithProviders(<Harness />, { messages });
    const input = await screen.findByLabelText(/Name/);
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
  });
});

function SelectHarness() {
  const form = useAppForm({ defaultValues: { kind: "0" } });
  return (
    <form.AppField name="kind">
      {(field) => (
        <field.SelectField
          label="Kind"
          options={[
            { value: "0", label: "Zero" },
            { value: "1", label: "One" },
          ]}
        />
      )}
    </form.AppField>
  );
}

function ChipsHarness() {
  const form = useAppForm({ defaultValues: { roles: ["admin", "user"] } });
  return (
    <form.AppField name="roles">
      {(field) => <field.MultiComboboxField label="Roles" options={[]} editable={false} />}
    </form.AppField>
  );
}

function SwitchHarness() {
  const form = useAppForm({ defaultValues: { active: false } });
  return (
    <form.AppField name="active">
      {(field) => <field.SwitchField label="Active" required description="TOGGLE_HELP" />}
    </form.AppField>
  );
}

describe("SwitchField", () => {
  it("说明文案可见,required 落成开关的 aria-required", async () => {
    renderWithProviders(<SwitchHarness />, { messages });
    const toggle = await screen.findByRole("switch", { name: /Active/ });
    expect(toggle.getAttribute("aria-required")).toBe("true");
    expect(screen.getByText("TOGGLE_HELP")).toBeTruthy();
  });
});

describe("FieldRow", () => {
  it("渲染键值行,空值显示「未填写」文案", async () => {
    renderWithProviders(
      <ReadOnlyFields>
        <dl>
          <FieldRow label="Total" display="42" />
          <FieldRow label="Note" display={null} />
        </dl>
      </ReadOnlyFields>,
      { messages },
    );
    expect(await screen.findByText("Total")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText(messages.en[""]["Form:Empty"])).toBeTruthy();
  });
});

describe("SelectField", () => {
  it("渲染当前值对应 label", async () => {
    renderWithProviders(<SelectHarness />, { messages });
    expect(await screen.findByText("Zero")).toBeTruthy();
  });
});

describe("MultiComboboxField 只读态", () => {
  it("渲染 Badge chips", async () => {
    renderWithProviders(<ChipsHarness />, { messages });
    expect(await screen.findByText("admin")).toBeTruthy();
    expect(screen.getByText("user")).toBeTruthy();
  });
});

function ComboboxEmptyHarness() {
  const form = useAppForm({ defaultValues: { authorId: "" } });
  return (
    <form.AppField name="authorId">
      {(field) => <field.ComboboxField label="Author" options={[]} placeholder="PICK_ONE" />}
    </form.AppField>
  );
}

function ComboboxSeededHarness() {
  const form = useAppForm({ defaultValues: { authorId: "a1" } });
  return (
    <form.AppField name="authorId">
      {(field) => (
        <field.ComboboxField label="Author" options={[{ value: "a1", label: "Author One" }]} />
      )}
    </form.AppField>
  );
}

describe("ComboboxField", () => {
  it("字段值为空串时,Combobox 收到 undefined 而非空串:触发器标记为未选中态(data-placeholder)", async () => {
    const { container } = renderWithProviders(<ComboboxEmptyHarness />, { messages });
    expect(await screen.findByPlaceholderText("PICK_ONE")).toBeTruthy();
    // base-ui Combobox 把非 undefined 的空串当作「选中了一个值为空串的项」,只有真正的
    // undefined 才会让内部 selected 落到 null、触发器进入 data-placeholder 未选中态，
    // 借这个属性断言归一化确实发生,而不只是 placeholder 文案的无条件透传。
    const trigger = container.querySelector('[data-slot="input-group-button"]');
    expect(trigger?.hasAttribute("data-placeholder")).toBe(true);
  });

  it("字段值命中 options 里的项时,渲染该项 label", async () => {
    renderWithProviders(<ComboboxSeededHarness />, { messages });
    expect(await screen.findByDisplayValue("Author One")).toBeTruthy();
  });
});

describe("服务端错误通道(onSubmitAsync)", () => {
  it("字段级/表单级错误分别落 FieldError 与 FormErrors,重提交自动清除且 onSubmit 再次触发", async () => {
    const onSubmit = vi.fn();
    let failNext = true;
    renderWithProviders(
      <Harness
        onSubmit={onSubmit}
        onSubmitAsync={async () => {
          if (failNext) {
            failNext = false;
            return { form: "server boom", fields: { name: "name taken" } };
          }
          return null;
        }}
      />,
      { messages },
    );
    const input = await screen.findByLabelText(/Name/);
    fireEvent.change(input, { target: { value: "ok" } });

    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(await screen.findByText("name taken")).toBeTruthy();
    expect(screen.getByText("server boom")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    // 无需任何 clearServerErrors，直接再提交,错误自动清除、onSubmit 触发
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("name taken")).toBeNull();
    expect(screen.queryByText("server boom")).toBeNull();
  });
});

function TwoFieldHarness() {
  const form = useAppForm({
    defaultValues: { name: "", email: "" },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      onDynamic: z.object({
        name: z.string().min(1, "NAME_REQ"),
        email: z.string().min(1, "EMAIL_REQ"),
      }),
      onSubmitAsync: async () => null,
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" required />}
      </form.AppField>
      <form.AppField name="email">
        {(field) => <field.TextField label="Email" required />}
      </form.AppField>
      <button type="submit">go</button>
    </form>
  );
}

describe("提交失败聚焦首错字段", () => {
  it("客户端校验失败后焦点落在第一个错误字段", async () => {
    renderWithProviders(<TwoFieldHarness />, { messages });
    fireEvent.click(await screen.findByRole("button", { name: "go" }));
    const nameInput = await screen.findByLabelText(/Name/);
    await waitFor(() => expect(document.activeElement).toBe(nameInput));
  });
});

function TimeHarness(props: { readOnly?: boolean; onValue?: (value: string) => void }) {
  const form = useAppForm({ defaultValues: { start: props.readOnly ? "08:30" : "" } });
  const fields = (
    <form.AppField name="start" listeners={{ onChange: ({ value }) => props.onValue?.(value) }}>
      {(field) => <field.TimeField label="Start" />}
    </form.AppField>
  );
  return props.readOnly ? (
    <ReadOnlyFields>
      <dl>{fields}</dl>
    </ReadOnlyFields>
  ) : (
    fields
  );
}

function DirtyTimeHarness() {
  const form = useAppForm({ defaultValues: { start: "08:00" } });
  return (
    <>
      <form.AppField name="start">{(field) => <field.TimeField label="Start" />}</form.AppField>
      <form.Subscribe selector={(state) => state.isDirty}>
        {(dirty) => <span data-testid="dirty">{String(dirty)}</span>}
      </form.Subscribe>
    </>
  );
}

describe("TimeField", () => {
  it("敲简写失焦后，表单值是 HH:mm", async () => {
    const onValue = vi.fn();
    renderWithProviders(<TimeHarness onValue={onValue} />, { messages });
    const input = await screen.findByLabelText("Start");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onValue).toHaveBeenLastCalledWith("09:00"));
  });

  it("只是 Tab 经过不改值，表单不算改过", async () => {
    renderWithProviders(<DirtyTimeHarness />, { messages });
    const input = await screen.findByLabelText("Start");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByTestId("dirty").textContent).toBe("false");
  });

  it("查看态显示时分文本", async () => {
    renderWithProviders(<TimeHarness readOnly />, { messages });
    expect(await screen.findByText("08:30")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

function NoteHarness() {
  const form = useAppForm({ defaultValues: { note: "" } });
  return (
    <form.AppField name="note">
      {(field) => <field.TextareaField label="Note" rows={3} />}
    </form.AppField>
  );
}

describe("TextareaField", () => {
  it("多行输入可写回", async () => {
    renderWithProviders(<NoteHarness />, { messages });
    const area = (await screen.findByLabelText("Note")) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "a\nb" } });
    expect(area.value).toBe("a\nb");
  });
});

function NullableHarness(props: { readOnly?: boolean; initial: number | null }) {
  const form = useAppForm({ defaultValues: { grace: props.initial } });
  const field = (
    <form.AppField name="grace">{(f) => <f.NumberField label="Grace" nullable />}</form.AppField>
  );
  return (
    <>
      {props.readOnly ? (
        <ReadOnlyFields>
          <dl>{field}</dl>
        </ReadOnlyFields>
      ) : (
        field
      )}
      <form.Subscribe selector={(s) => s.values.grace}>
        {/* JSON.stringify(NaN) 也是 "null"，必须分开写才能区分两者 */}
        {(v) => <span data-testid="value">{v === null ? "null" : String(v)}</span>}
      </form.Subscribe>
    </>
  );
}

describe("NumberField nullable", () => {
  it("从 null 起始时输入框为空；清空写回 null 而不是 NaN", async () => {
    renderWithProviders(<NullableHarness initial={null} />, { messages });
    const input = (await screen.findByLabelText("Grace")) as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "5" } });
    expect(screen.getByTestId("value").textContent).toBe("5");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("value").textContent).toBe("null");
  });

  it("查看态 null 显示「未填写」", async () => {
    renderWithProviders(<NullableHarness initial={null} readOnly />, { messages });
    expect(await screen.findByText(messages.en[""]["Form:Empty"])).toBeTruthy();
  });
});

function EmptyOptionHarness() {
  const form = useAppForm({ defaultValues: { status: "" } });
  return (
    <form.AppField name="status">
      {(f) => (
        <f.SelectField
          label="Status"
          options={[
            { value: "", label: "All" },
            { value: "on", label: "Enabled" },
          ]}
        />
      )}
    </form.AppField>
  );
}

describe("SelectField 空值选项", () => {
  it("当前值为空串时，触发器显示 value 为空的那个选项", async () => {
    renderWithProviders(<EmptyOptionHarness />, { messages });
    const trigger = await screen.findByRole("combobox", { name: "Status" });
    expect(trigger.textContent).toContain("All");
  });

  it("打开下拉不报错，空值选项可见可选", async () => {
    renderWithProviders(<EmptyOptionHarness />, { messages });
    const trigger = await screen.findByRole("combobox", { name: "Status" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Enabled" })).toBeTruthy();
  });
});

function MultiHarness(props: { editable?: boolean }) {
  const form = useAppForm({ defaultValues: { members: ["u1", "u9"] } });
  return (
    <ReadOnlyFields>
      <dl>
        <form.AppField name="members">
          {(f) => (
            <f.MultiComboboxField
              label="Members"
              editable={props.editable}
              options={[{ value: "u1", label: "Alice" }]}
            />
          )}
        </form.AppField>
      </dl>
    </ReadOnlyFields>
  );
}

describe("MultiComboboxField", () => {
  it("查看态把 id 换成 label，找不到的 id 原样显示", async () => {
    renderWithProviders(<MultiHarness />, { messages });
    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(screen.getByText("u9")).toBeTruthy();
    expect(screen.queryByText("u1")).toBeNull();
  });
});

function RequiredMultiHarness() {
  const form = useAppForm({ defaultValues: { members: [] as string[] } });
  return (
    <form.AppField name="members">
      {(f) => (
        <f.MultiComboboxField
          label="Members"
          required
          options={[{ value: "u1", label: "Alice" }]}
        />
      )}
    </form.AppField>
  );
}

describe("MultiComboboxField 必填", () => {
  it("label 关联到输入框，必填带 aria-required", async () => {
    renderWithProviders(<RequiredMultiHarness />, { messages });
    const input = await screen.findByLabelText(/Members/);
    expect(input.getAttribute("aria-required")).toBe("true");
  });
});

function RequiredComboHarness() {
  const form = useAppForm({ defaultValues: { authorId: "" } });
  return (
    <form.AppField name="authorId">
      {(f) => <f.ComboboxField label="Author" required options={[{ value: "a1", label: "A" }]} />}
    </form.AppField>
  );
}

describe("ComboboxField 必填", () => {
  it("label 关联到输入框，必填带 aria-required", async () => {
    renderWithProviders(<RequiredComboHarness />, { messages });
    const input = await screen.findByLabelText(/Author/);
    expect(input.getAttribute("aria-required")).toBe("true");
  });
});
