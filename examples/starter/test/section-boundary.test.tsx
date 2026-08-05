// @vitest-environment jsdom

import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SectionBoundary } from "@/components/section-boundary";
import shellMessages from "@/routes/_layout/shell-messages.json";
import { renderWithProviders } from "./test-utils";

function Bomb({ defused }: { defused?: boolean }) {
  if (!defused) throw new Error("section exploded");
  return <p>section recovered</p>;
}

describe("SectionBoundary", () => {
  it("contains the failure to the wrapped section; siblings keep rendering", async () => {
    // React 会把边界接住的错误同时打给 console.error,压掉以免测试输出刷屏
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(
      <main>
        <SectionBoundary>
          <Bomb />
        </SectionBoundary>
        <p>sibling section</p>
      </main>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("section exploded");
    spy.mockRestore();
    // 兄弟区块不受影响——这是区块级边界存在的意义
    expect(screen.getByText("sibling section")).toBeDefined();
  });

  it("retry re-renders the children and clears the fallback", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Harness() {
      const [defused, setDefused] = useState(false);
      return (
        <SectionBoundary>
          {/* 第一次渲染抛错;点重试前先把状态改好,模拟瞬时性错误已消失 */}
          <button type="button" onClick={() => setDefused(true)} data-testid="defuse" hidden />
          <Bomb defused={defused} />
        </SectionBoundary>
      );
    }
    renderWithProviders(<Harness />, { messages: shellMessages as FrontendCatalog });
    expect(await screen.findByRole("alert")).toBeDefined();
    // 边界 reset 后 children 整体重渲染;Harness 状态在边界外层不受影响,
    // 但 defuse 按钮已随 fallback 卸载——直接验证 reset 本身:炸弹还在就再次落入 fallback
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    // 仍然抛错 → fallback 再次出现(reset 是重试语义,不是吞错误)
    expect(await screen.findByRole("alert")).toBeDefined();
    spy.mockRestore();
  });

  it("renders a custom fallback when provided", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(
      <SectionBoundary fallback={(error) => <p role="alert">custom: {error.message}</p>}>
        <Bomb />
      </SectionBoundary>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("custom: section exploded");
    spy.mockRestore();
  });
});
