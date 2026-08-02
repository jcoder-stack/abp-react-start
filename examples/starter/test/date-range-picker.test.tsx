// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import { DateRangePicker } from "@/components/date-picker/date-range-picker";
import { monthCaption, monthsAgo, renderWithProviders } from "./test-utils";

describe("DateRangePicker", () => {
  it("依次点选起止两天：onChange 最终收到 from/to", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const from = monthsAgo(14, 1);
    renderWithProviders(<DateRangePicker value={{ from }} onChange={onChange} />, {
      messages: datePickerMessages,
    });
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${from.getFullYear()}`) }),
    );
    // numberOfMonths=2 时两个月历并排渲染，同一天数在两个月各出现一次；起始月在 DOM 中排
    // 第一，取第一个匹配即为起始月的那天。
    await user.click(screen.getAllByText("10")[0]);
    await user.click(screen.getAllByText("20")[0]);
    const last = onChange.mock.calls.at(-1)?.[0] as { from?: Date; to?: Date };
    expect([last.from?.getMonth(), last.from?.getDate()]).toEqual([from.getMonth(), 10]);
    expect([last.to?.getMonth(), last.to?.getDate()]).toEqual([from.getMonth(), 20]);
  });

  it("打开弹层落在起始日所在月，而非当前月", async () => {
    const user = userEvent.setup();
    const from = monthsAgo(14, 3);
    renderWithProviders(
      <DateRangePicker value={{ from, to: monthsAgo(14, 20) }} onChange={vi.fn()} />,
      { messages: datePickerMessages },
    );
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${from.getFullYear()}`) }),
    );
    expect(screen.getAllByRole("grid")[0].getAttribute("aria-label")).toMatch(monthCaption(from));
  });

  it("无值时显示区间 placeholder，弹层落在当前月", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DateRangePicker onChange={vi.fn()} />, { messages: datePickerMessages });
    const trigger = await screen.findByRole("button", { name: /pick a date range/i });
    await user.click(trigger);
    expect(screen.getAllByRole("grid")[0].getAttribute("aria-label")).toMatch(
      monthCaption(new Date()),
    );
  });

  it("并排两月不渲染溢出日：同一天不会在两个月里各画一次", async () => {
    const user = userEvent.setup();
    const from = monthsAgo(14, 25);
    renderWithProviders(
      <DateRangePicker value={{ from, to: monthsAgo(13, 6) }} onChange={vi.fn()} />,
      {
        messages: datePickerMessages,
      },
    );
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${from.getFullYear()}`) }),
    );
    // 关掉溢出日后格子仍在 DOM 里补齐周网格，只是不画任何内容，故按「画出来的天」判定。
    const painted = screen.getAllByRole("gridcell").filter((cell) => cell.textContent !== "");
    expect(painted.some((cell) => cell.hasAttribute("data-outside"))).toBe(false);
    const days = painted.map((cell) => cell.getAttribute("data-day"));
    expect(new Set(days).size).toBe(days.length);
  });

  it("有值时触发器 title 给出完整区间；无值时不给 title", async () => {
    const from = monthsAgo(14, 3);
    const to = monthsAgo(13, 6);
    const { unmount } = renderWithProviders(
      <DateRangePicker value={{ from, to }} onChange={vi.fn()} />,
      { messages: datePickerMessages },
    );
    const trigger = await screen.findByRole("button", {
      name: new RegExp(`${from.getFullYear()}`),
    });
    expect(trigger.getAttribute("title")).toBe(`${format(from, "PP")} – ${format(to, "PP")}`);
    unmount();

    renderWithProviders(<DateRangePicker onChange={vi.fn()} />, { messages: datePickerMessages });
    const empty = await screen.findByRole("button", { name: /pick a date range/i });
    expect(empty.getAttribute("title")).toBeNull();
  });
});
