// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import formMessages from "@/components/form/form-messages.json";
import { SheetForm } from "@/components/form/sheet-form";
import { renderWithProviders } from "./test-utils";

// SheetForm 按钮文案断言需要 Form: 词条
const messages = formMessages;

describe("SheetForm", () => {
  const noop = () => {};

  it("create mode shows save/cancel and fires onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <SheetForm mode="create" open onOpenChange={noop} title="T" onSubmit={onSubmit}>
        <div>body</div>
      </SheetForm>,
      { messages },
    );
    fireEvent.click(await screen.findByRole("button", { name: /save/i }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("view mode shows the header edit icon button only when canEdit, and drops the footer", async () => {
    const onEdit = vi.fn();
    const { unmount } = renderWithProviders(
      <SheetForm mode="view" open onOpenChange={noop} title="T" canEdit onEdit={onEdit}>
        <div>body</div>
      </SheetForm>,
      { messages },
    );
    // 编辑按钮是无文字的图标按钮，可访问名全靠 aria-label={L("Form:Edit")}。
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
    // view 态的 footer（原「关闭」按钮）整块移除，只留 Sheet 内置的右上角 X。
    expect(document.querySelector('[data-slot="sheet-footer"]')).toBeNull();
    unmount();
    renderWithProviders(
      <SheetForm mode="view" open onOpenChange={noop} title="T" canEdit={false}>
        <div>body</div>
      </SheetForm>,
      { messages },
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
