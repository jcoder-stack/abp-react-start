// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { calendarBounds, widenBounds } from "@/components/date-picker/calendar-bounds";
import { DatePicker } from "@/components/date-picker/date-picker";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import { makeConfig, monthCaption, renderWithProviders } from "./test-utils";

describe("calendarBounds", () => {
  it("当年往前 10 年、往后 1 年", () => {
    const b = calendarBounds(new Date(2026, 5, 15));
    expect([b.startMonth.getFullYear(), b.startMonth.getMonth()]).toEqual([2016, 0]);
    expect([b.endMonth.getFullYear(), b.endMonth.getMonth()]).toEqual([2027, 11]);
  });
});

describe("widenBounds", () => {
  const base = calendarBounds(new Date(2026, 5, 15));

  it("值在范围内时原样返回同一个对象", () => {
    expect(widenBounds(base, [new Date(2020, 3, 1), undefined])).toBe(base);
  });

  it("值早于下界或晚于上界时把范围撑到该月", () => {
    const b = widenBounds(base, [new Date(1990, 6, 9), new Date(2030, 1, 2)]);
    expect([b.startMonth.getFullYear(), b.startMonth.getMonth()]).toEqual([1990, 6]);
    expect([b.endMonth.getFullYear(), b.endMonth.getMonth()]).toEqual([2030, 1]);
  });
});

describe("DatePicker 年月下拉", () => {
  it("中文界面的月份下拉显示中文月名", async () => {
    const user = userEvent.setup();
    const config = makeConfig({
      localization: {
        currentCulture: { name: "zh-Hans" },
        languages: [],
        values: {},
      },
    });
    renderWithProviders(<DatePicker onChange={vi.fn()} />, {
      config,
      messages: datePickerMessages,
    });
    await user.click(await screen.findByRole("button", { name: "选择日期" }));
    const month = screen.getByRole("combobox", { name: /month/i });
    const labels = within(month)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toContain("1月");
    expect(labels).not.toContain("Jan");
  });

  it("值早于十年前时，打开仍落在值所在月", async () => {
    const user = userEvent.setup();
    const value = new Date(new Date().getFullYear() - 15, 3, 10);
    renderWithProviders(<DatePicker value={value} onChange={vi.fn()} />, {
      messages: datePickerMessages,
    });
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${value.getFullYear()}`) }),
    );
    expect(screen.getByRole("grid", { name: monthCaption(value) })).toBeDefined();
  });
});
