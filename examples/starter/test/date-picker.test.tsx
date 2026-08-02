// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "@/components/date-picker/date-picker";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import { monthCaption, monthsAgo, renderWithProviders } from "./test-utils";

// 夹具月份若写死（如 2026-07），套件在别的月份跑时点到的 "21" 是别的月的 21 号，断言的年月却
// 停在写死的那个月，一到月初就整片变红。夹具一律由 monthsAgo 跟着系统时钟推出来。
const TODAY = new Date();
const FIXTURE_YEAR = TODAY.getFullYear();
const FIXTURE_MONTH = TODAY.getMonth();

describe("DatePicker", () => {
  it("无值时按钮显示 placeholder 词条", async () => {
    renderWithProviders(<DatePicker onChange={vi.fn()} />, { messages: datePickerMessages });
    expect(await screen.findByRole("button", { name: /pick a date/i })).toBeDefined();
  });

  it("打开弹层点选日期：onChange 收到当天本地 Date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <DatePicker value={new Date(FIXTURE_YEAR, FIXTURE_MONTH, 15)} onChange={onChange} />,
      { messages: datePickerMessages },
    );
    await user.click(await screen.findByRole("button", { name: new RegExp(`${FIXTURE_YEAR}`) }));
    await user.click(screen.getByText("21"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0][0] as Date;
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([
      FIXTURE_YEAR,
      FIXTURE_MONTH,
      21,
    ]);
  });

  it("有值时触发器 title 给出完整日期；无值时不给 title", async () => {
    const value = monthsAgo(14);
    const { unmount } = renderWithProviders(<DatePicker value={value} onChange={vi.fn()} />, {
      messages: datePickerMessages,
    });
    const trigger = await screen.findByRole("button", {
      name: new RegExp(`${value.getFullYear()}`),
    });
    expect(trigger.getAttribute("title")).toBe(format(value, "PPP"));
    unmount();

    renderWithProviders(<DatePicker onChange={vi.fn()} />, { messages: datePickerMessages });
    expect(
      (await screen.findByRole("button", { name: /pick a date/i })).getAttribute("title"),
    ).toBeNull();
  });

  it("打开弹层落在 value 所在月，而非当前月", async () => {
    const user = userEvent.setup();
    const value = monthsAgo(14);
    renderWithProviders(<DatePicker value={value} onChange={vi.fn()} />, {
      messages: datePickerMessages,
    });
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${value.getFullYear()}`) }),
    );
    expect(screen.getByRole("grid", { name: monthCaption(value) })).toBeDefined();
  });

  it("无值时打开弹层落在当前月", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DatePicker onChange={vi.fn()} />, { messages: datePickerMessages });
    await user.click(await screen.findByRole("button", { name: /pick a date/i }));
    expect(screen.getByRole("grid", { name: monthCaption(TODAY) })).toBeDefined();
  });

  it("翻月后关闭再打开：重新按 value 定位，不停在上次翻到的月", async () => {
    const user = userEvent.setup();
    const value = monthsAgo(14);
    renderWithProviders(<DatePicker value={value} onChange={vi.fn()} />, {
      messages: datePickerMessages,
    });
    const trigger = await screen.findByRole("button", {
      name: new RegExp(`${value.getFullYear()}`),
    });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByRole("grid", { name: monthCaption(monthsAgo(15)) })).toBeDefined();

    await user.keyboard("{Escape}");
    await user.click(trigger);
    expect(screen.getByRole("grid", { name: monthCaption(value) })).toBeDefined();
  });
});
