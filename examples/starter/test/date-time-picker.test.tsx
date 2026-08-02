// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import datePickerMessages from "@/components/date-picker/date-picker-messages.json";
import { DateTimePicker } from "@/components/date-picker/date-time-picker";
import { monthCaption, monthsAgo, renderWithProviders } from "./test-utils";

/** 逐键录入要求输入框留住已敲进去的字符；只挂 spy 而不回写 value 的话，受控 Input
 * 每敲一下就被拽回初始值，测到的就不是用户的输入路径。 */
function ControlledDateTimePicker(props: { onChange: (date: Date | undefined) => void }) {
  const [value, setValue] = useState<Date | undefined>();
  return (
    <DateTimePicker
      value={value}
      onChange={(date) => {
        setValue(date);
        props.onChange(date);
      }}
    />
  );
}

describe("DateTimePicker", () => {
  it("点选日期保留已有时分；改时间输入合并到日期", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = monthsAgo(14);
    value.setHours(9, 30, 0, 0);
    renderWithProviders(<DateTimePicker value={value} onChange={onChange} />, {
      messages: datePickerMessages,
    });
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${value.getFullYear()}`) }),
    );
    await user.click(screen.getByText("21"));
    const afterDay = onChange.mock.calls.at(-1)?.[0] as Date;
    expect([
      afterDay.getMonth(),
      afterDay.getDate(),
      afterDay.getHours(),
      afterDay.getMinutes(),
    ]).toEqual([value.getMonth(), 21, 9, 30]);

    const time = screen.getByLabelText(/time/i);
    fireEvent.change(time, { target: { value: "14:45" } });
    const afterTime = onChange.mock.calls.at(-1)?.[0] as Date;
    expect([afterTime.getHours(), afterTime.getMinutes()]).toEqual([14, 45]);
  });

  // 原生时钟指示器被隐藏后，键盘是唯一的时间录入方式，这条路径必须自成覆盖。
  it("键盘敲入时分即可改值：不依赖原生时间弹层", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<ControlledDateTimePicker onChange={onChange} />, {
      messages: datePickerMessages,
    });
    await user.click(await screen.findByRole("button", { name: /pick a date/i }));
    await user.type(screen.getByLabelText(/time/i), "0715");
    const merged = onChange.mock.calls.at(-1)?.[0] as Date;
    expect([merged.getHours(), merged.getMinutes()]).toEqual([7, 15]);
  });

  it("打开弹层落在 value 所在月，而非当前月", async () => {
    const user = userEvent.setup();
    const value = monthsAgo(14);
    renderWithProviders(<DateTimePicker value={value} onChange={vi.fn()} />, {
      messages: datePickerMessages,
    });
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`${value.getFullYear()}`) }),
    );
    expect(screen.getByRole("grid", { name: monthCaption(value) })).toBeDefined();
  });
});
