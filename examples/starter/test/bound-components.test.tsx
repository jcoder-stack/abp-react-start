// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useBoundComponents } from "@/components/abp/crud/create-bound-components";

function Harness() {
  const [n, setN] = useState(0);
  const bound = useBoundComponents({ n }, (read) => ({
    Show: () => <span data-testid="v">{read().n}</span>,
  }));
  return (
    <>
      <bound.Show />
      <input data-testid="in" />
      <button type="button" onClick={() => setN((x) => x + 1)}>
        +
      </button>
    </>
  );
}

describe("useBoundComponents", () => {
  it("接线值读活且重渲染不重挂（输入不失焦）", async () => {
    render(<Harness />);
    screen.getByTestId("in").focus();
    await act(async () => screen.getByRole("button").click());
    expect(screen.getByTestId("v").textContent).toBe("1"); // 读活
    expect(document.activeElement).toBe(screen.getByTestId("in")); // 未重挂
  });
});
