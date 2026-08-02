// @vitest-environment jsdom

import { revalidateLogic } from "@tanstack/react-form";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import { useAppForm } from "@/components/form/form-hook";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

// 日历默认显示「当前月」，与字段值无关。夹具月份若写死（如 2026-07），套件在别的月份跑时
// 点到的 "21" 是当前月的 21 号，断言的却是写死那个月的 21 号，一到月初就变红。
// 夹具跟着系统时钟走，任何月份跑都自洽（15/21 号每个月都存在）。
const TODAY = new Date();
const MONTH_PREFIX = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;

function mergeMessages() {
  return {
    en: { "": { ...formMessages.en[""], ...datePickerMessages.en[""] } },
    "zh-Hans": { "": { ...formMessages["zh-Hans"][""], ...datePickerMessages["zh-Hans"][""] } },
  };
}

function DateHarness(props: {
  defaultValue?: string;
  onSubmit?: (value: { publishDate: string }) => void;
}) {
  const form = useAppForm({
    defaultValues: { publishDate: props.defaultValue ?? `${MONTH_PREFIX}-15` },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: { onDynamic: z.object({ publishDate: z.string().min(1, "required") }) },
    onSubmit: ({ value }) => props.onSubmit?.(value),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="publishDate">
        {(f) => <f.DateField label="Publish" required />}
      </form.AppField>
      <button type="submit">go</button>
    </form>
  );
}

describe("DateField", () => {
  it("点选日期后字段值是 yyyy-MM-dd 字符串", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<DateHarness onSubmit={onSubmit} />, { messages: mergeMessages() });
    // 触发器按钮的可访问名来自关联的 <label for>（"Publish"），不是按钮内展示的日期文案，
    // 所以用 findByLabelText 定位，与 TextField 测试的既有查询方式一致。DatePicker 走
    // lazy + Suspense,全量套件并行跑时首次 dynamic import 可能超过默认 1s 查询超时,
    // 故查询与整条用例都放宽超时。
    await user.click(await screen.findByLabelText(/Publish/, {}, { timeout: 5000 }));
    await user.click(screen.getByText("21"));
    await user.click(screen.getByRole("button", { name: "go" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ publishDate: `${MONTH_PREFIX}-21` });
  }, 8000);

  it("required：label 有星号且提交空值走校验链", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DateHarness defaultValue="" />, { messages: mergeMessages() });
    expect(await screen.findByText("*")).toBeTruthy();
    const trigger = await screen.findByLabelText(/Publish/, {}, { timeout: 5000 });
    expect(trigger.getAttribute("aria-required")).toBe("true");
    expect(screen.queryByText("required")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "go" }));
    expect(await screen.findByText("required")).toBeTruthy();
  }, 8000);
});

function DateTimeHarness(props: {
  defaultValue?: string;
  onSubmit?: (value: { eventAt: string }) => void;
}) {
  const form = useAppForm({
    defaultValues: { eventAt: props.defaultValue ?? `${MONTH_PREFIX}-15T09:30` },
    onSubmit: ({ value }) => props.onSubmit?.(value),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="eventAt">{(f) => <f.DateTimeField label="Event at" />}</form.AppField>
      <button type="submit">go</button>
    </form>
  );
}

describe("DateTimeField", () => {
  it("点选日期后保留原时间，字段值是 yyyy-MM-ddTHH:mm 字符串", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<DateTimeHarness onSubmit={onSubmit} />, { messages: mergeMessages() });
    await user.click(await screen.findByLabelText(/Event at/, {}, { timeout: 5000 }));
    await user.click(screen.getByText("21"));
    await user.click(screen.getByRole("button", { name: "go" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ eventAt: `${MONTH_PREFIX}-21T09:30` });
  }, 8000);
});

function RangeHarness(props: {
  onSubmit: (value: { range: { from: string; to: string } }) => void;
}) {
  const form = useAppForm({
    defaultValues: { range: { from: "", to: "" } },
    onSubmit: ({ value }) => props.onSubmit(value),
  });
  return (
    <>
      <form.AppField name="range">{(f) => <f.DateRangeField label="Range" />}</form.AppField>
      <button type="button" onClick={() => form.handleSubmit()}>
        submit
      </button>
    </>
  );
}

describe("DateRangeField", () => {
  it("区间选择后字段值是 {from, to} ISO 字符串对", async () => {
    const user = userEvent.setup();
    let value: { range: { from: string; to: string } } | undefined;
    renderWithProviders(<RangeHarness onSubmit={(v) => (value = v)} />, {
      messages: mergeMessages(),
    });
    // 触发器的可访问名来自关联的 <label for>（"Range"），不是按钮内展示的占位文案，
    // 与 DateField 测试的既有取元素方式一致；DateRangePicker 走 lazy + Suspense，
    // 首次 dynamic import 放宽超时。
    await user.click(await screen.findByLabelText(/Range/, {}, { timeout: 5000 }));
    // numberOfMonths=2 时同一天数字在两个月历各出现一次，取第一个匹配（与
    // date-range-picker.test.tsx 的既有取元素方式一致）。
    await user.click(screen.getAllByText("10")[0]);
    await user.click(screen.getAllByText("20")[0]);
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(value?.range.from).toMatch(/^\d{4}-\d{2}-10$/);
    expect(value?.range.to).toMatch(/^\d{4}-\d{2}-20$/);
  }, 8000);
});
