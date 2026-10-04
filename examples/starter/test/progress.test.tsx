// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "@/components/ui/progress";

// 上游原语只拿 value 算填充宽度、不交给 Radix Root，读屏器永远读不到进度；这里锁住转交后的可达结果。
describe("Progress", () => {
  it("exposes the current value to assistive technology", () => {
    render(<Progress value={40} aria-label="下载进度" />);
    expect(
      screen.getByRole("progressbar", { name: "下载进度" }).getAttribute("aria-valuenow"),
    ).toBe("40");
  });

  it("announces no value while the total is unknown", () => {
    render(<Progress value={null} aria-label="下载进度" />);
    expect(
      screen.getByRole("progressbar", { name: "下载进度" }).hasAttribute("aria-valuenow"),
    ).toBe(false);
  });
});
