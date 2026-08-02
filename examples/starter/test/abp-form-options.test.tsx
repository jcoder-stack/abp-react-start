// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AbpApiError } from "@/api/mutator";
import { abpFormOptions } from "@/components/abp/crud/abp-form-options";
import { useAppForm } from "@/components/form/form-hook";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

const messages = formMessages;

function makeAbpError(body: unknown): AbpApiError {
  return new AbpApiError(400, body, "POST", "/api/test");
}

function OptionsHarness(props: {
  submit: (value: { name: string }) => Promise<void>;
  onSuccess?: () => void;
  extraOnChange?: z.ZodType;
}) {
  const form = useAppForm(
    abpFormOptions({
      defaultValues: { name: "" },
      schema: z.object({ name: z.string().min(1, "NAME_REQUIRED") }),
      submit: props.submit,
      onSuccess: props.onSuccess,
      validators: props.extraOnChange ? { onChange: props.extraOnChange } : undefined,
    }),
  );
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

describe("abpFormOptions", () => {
  it("预设 submit 时机:空必填提交不调 submit,schema 错误内联可见", async () => {
    const submit = vi.fn(async () => {});
    renderWithProviders(<OptionsHarness submit={submit} />, { messages });
    fireEvent.click(await screen.findByRole("button", { name: "go" }));
    expect(await screen.findByText("NAME_REQUIRED")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("submit 抛 ABP validationErrors 落字段;修正后重提交触发 onSuccess(覆盖裸重提交死锁链路)", async () => {
    let fail = true;
    const submit = vi.fn(async () => {
      if (fail) {
        throw makeAbpError({
          error: { validationErrors: [{ message: "TAKEN", members: ["Name"] }] },
        });
      }
    });
    const onSuccess = vi.fn();
    renderWithProviders(<OptionsHarness submit={submit} onSuccess={onSuccess} />, { messages });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(await screen.findByText("TAKEN")).toBeTruthy();
    fail = false;
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("validators 逃生舱:onChange zod 校验与预设通道并存", async () => {
    renderWithProviders(
      <OptionsHarness
        submit={async () => {}}
        extraOnChange={z.object({ name: z.string().refine((v) => v !== "x", "NO_X") })}
      />,
      { messages },
    );
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "x" } });
    expect(await screen.findByText("NO_X")).toBeTruthy();
  });

  it("提交前用 schema transform 归一化:去掉首尾空格再交给 submit(绕开校验不回写转换值)", async () => {
    const submit = vi.fn(async (_v: { name: string }) => {});
    function TrimHarness() {
      const form = useAppForm(
        abpFormOptions({
          defaultValues: { name: "" },
          schema: z.object({ name: z.string().trim().min(1, "NAME_REQUIRED") }),
          submit,
        }),
      );
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
          <button type="submit">go</button>
        </form>
      );
    }
    renderWithProviders(<TrimHarness />, { messages });
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "  Alice  " } });
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ name: "Alice" }));
  });
});
