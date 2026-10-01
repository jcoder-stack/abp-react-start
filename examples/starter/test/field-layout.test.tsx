// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldHint, FieldLayout } from "@/components/form/field-layout";
import { ReadOnlyFields, useReadOnly } from "@/components/form/form-hook";

function Mode() {
  return <span data-testid="mode">{useReadOnly() ? "view" : "edit"}</span>;
}

describe("useReadOnly", () => {
  it("在 ReadOnlyFields 里为真，外面为假", () => {
    render(
      <>
        <Mode />
        <ReadOnlyFields>
          <Mode />
        </ReadOnlyFields>
      </>,
    );
    expect(screen.getAllByTestId("mode").map((n) => n.textContent)).toEqual(["edit", "view"]);
  });
});

describe("FieldHint", () => {
  it("录入态显示填写指引，查看态不显示", () => {
    const { rerender } = render(<FieldHint>Use 24-hour time</FieldHint>);
    expect(screen.getByText("Use 24-hour time")).toBeTruthy();
    rerender(
      <ReadOnlyFields>
        <FieldHint>Use 24-hour time</FieldHint>
      </ReadOnlyFields>,
    );
    expect(screen.queryByText("Use 24-hour time")).toBeNull();
  });
});

describe("FieldLayout", () => {
  // 查看态下键值行必须是 <dl> 的直系子节点：分隔线与对齐都以此为前提
  it("录入态包一层排版容器，查看态让子节点直接成为外层的子节点", () => {
    const { container, rerender } = render(
      <dl>
        <FieldLayout className="grid gap-4">
          <div data-testid="row" />
        </FieldLayout>
      </dl>,
    );
    expect(screen.getByTestId("row").parentElement?.tagName).toBe("DIV");
    rerender(
      <ReadOnlyFields>
        <dl>
          <FieldLayout className="grid gap-4">
            <div data-testid="row" />
          </FieldLayout>
        </dl>
      </ReadOnlyFields>,
    );
    expect(screen.getByTestId("row").parentElement).toBe(container.querySelector("dl"));
  });
});
