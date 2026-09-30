// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  maskTimeInput,
  normalizeTime,
  resolveTimeOnBlur,
  TimeInput,
} from "@/components/date-picker/time-input";

describe("maskTimeInput", () => {
  it("只留数字，满两位补冒号，最多四位", () => {
    expect(maskTimeInput("9")).toBe("9");
    expect(maskTimeInput("093")).toBe("09:3");
    expect(maskTimeInput("09a30b")).toBe("09:30");
    expect(maskTimeInput("093015")).toBe("09:30");
  });
});

describe("normalizeTime", () => {
  it("一两位数字按小时理解，三四位按时分", () => {
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("17")).toBe("17:00");
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("09:30")).toBe("09:30");
  });

  it("越界或为空返回 null", () => {
    expect(normalizeTime("2400")).toBeNull();
    expect(normalizeTime("0960")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });
});

describe("resolveTimeOnBlur", () => {
  it("整理不出来时保留原值，不静默清空", () => {
    expect(resolveTimeOnBlur("25:00", "08:00")).toBe("08:00");
    expect(resolveTimeOnBlur("1.07:00", "1.07:00")).toBe("1.07:00");
  });

  it("空输入是明确要清掉", () => {
    expect(resolveTimeOnBlur("  ", "08:00")).toBe("");
  });

  it("能整理的按整理结果落值", () => {
    expect(resolveTimeOnBlur("9", "")).toBe("09:00");
  });
});

function Controlled(props: { initial?: string; onChange: (value: string) => void }) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <TimeInput
      aria-label="time"
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange(next);
      }}
    />
  );
}

describe("TimeInput", () => {
  it("敲满四位才往外发，半截不发", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByLabelText("time");
    await user.type(input, "093");
    expect(onChange).not.toHaveBeenCalled();
    await user.type(input, "0");
    expect(onChange).toHaveBeenLastCalledWith("09:30");
    expect((input as HTMLInputElement).value).toBe("09:30");
  });

  it("失焦时把简写整理成 HH:mm", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByLabelText("time");
    await user.type(input, "9");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("09:00");
    expect((input as HTMLInputElement).value).toBe("09:00");
  });

  it("已有值时聚焦即全选，直接敲简写整体替换", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial="00:00" onChange={onChange} />);
    const input = screen.getByLabelText("time");
    await user.click(input);
    await user.keyboard("930");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("09:30");
  });

  it("外部改了值，输入框跟上", () => {
    const { rerender } = render(<TimeInput aria-label="time" value="08:00" onChange={vi.fn()} />);
    rerender(<TimeInput aria-label="time" value="17:45" onChange={vi.fn()} />);
    expect((screen.getByLabelText("time") as HTMLInputElement).value).toBe("17:45");
  });
});
