// @vitest-environment jsdom

import { revalidateLogic } from "@tanstack/react-form";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useAppForm } from "@/components/form/form-hook";
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
