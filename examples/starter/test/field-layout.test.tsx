// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldHint, FieldLayout } from "@/components/form/field-layout";
import { FieldRow, ReadOnlyFields, useReadOnly } from "@/components/form/form-hook";
import formMessages from "@/components/form/form-messages.json";
import { renderWithProviders } from "./test-utils";

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
  const rows = (
    <FieldLayout className="grid gap-4">
      <FieldRow label="Start" display="08:00" />
      <FieldRow label="End" display="17:00" />
    </FieldLayout>
  );
  // 查看态下键值行必须是 <dl> 的直系子节点：分隔线与对齐都以此为前提
  const rowsSitDirectlyInList = () => {
    const labels = [screen.getByText("Start"), screen.getByText("End")];
    const list = labels[0]?.closest("dl");
    return labels.every((label) => label.parentElement?.parentElement === list);
  };

  it("录入态包一层排版容器", async () => {
    renderWithProviders(<dl>{rows}</dl>, { messages: formMessages });
    await screen.findByText("Start");
    expect(rowsSitDirectlyInList()).toBe(false);
  });

  it("查看态退场，键值行直接落在 dl 里", async () => {
    renderWithProviders(
      <ReadOnlyFields>
        <dl>{rows}</dl>
      </ReadOnlyFields>,
      { messages: formMessages },
    );
    await screen.findByText("Start");
    expect(rowsSitDirectlyInList()).toBe(true);
  });
});
