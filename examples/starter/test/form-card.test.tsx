// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormCard } from "@/components/form/form-card";
import { FieldRow } from "@/components/form/form-hook";
import formMessages from "@/components/form/form-messages.json";
import { SheetForm } from "@/components/form/sheet-form";
import { renderWithProviders } from "./test-utils";

function Sheet(props: { mode: "edit" | "view" }) {
  return (
    <SheetForm mode={props.mode} open onOpenChange={vi.fn()} title="Group">
      <FormCard title="Basics" description="Name and code">
        <FieldRow label="Name" display="Day shift" />
      </FormCard>
      <FormCard title="Rules">
        <FieldRow label="Grace" display="5" />
      </FormCard>
    </SheetForm>
  );
}

describe("FormCard", () => {
  it("编辑态渲染分区标题、说明与内容", async () => {
    renderWithProviders(<Sheet mode="edit" />, { messages: formMessages });
    expect(await screen.findByRole("heading", { name: "Basics" })).toBeTruthy();
    expect(screen.getByText("Name and code")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Rules" })).toBeTruthy();
  });

  it("查看态里分区与键值行都在，每个分区自成一组", async () => {
    renderWithProviders(<Sheet mode="view" />, { messages: formMessages });
    const basics = await screen.findByRole("heading", { name: "Basics" });
    const rules = screen.getByRole("heading", { name: "Rules" });
    expect(screen.getByText("Day shift")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    // 两个分区不是同一个容器：各自装着自己的键值行
    expect(basics.closest("[data-form-card]")).not.toBe(rules.closest("[data-form-card]"));
    expect(basics.closest("[data-form-card]")?.textContent).toContain("Day shift");
    expect(rules.closest("[data-form-card]")?.textContent).not.toContain("Day shift");
  });
});
