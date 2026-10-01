import { afterEach, describe, expect, it, vi } from "vitest";
import { isRowDeletable, warnIfUnpaged } from "@/components/abp/table/use-abp-table";

afterEach(() => vi.restoreAllMocks());

describe("warnIfUnpaged", () => {
  it("一页收到的行数超过 MaxResultCount 时告警一次，带上端点；同一端点不重复刷屏", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = () => ["/api/app/unpaged-books"] as const;
    warnIfUnpaged(188, 10, key);
    warnIfUnpaged(188, 10, key);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("/api/app/unpaged-books");
  });

  it("正好一整页不算越界", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfUnpaged(10, 10, () => ["/api/app/full-page"] as const);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isRowDeletable", () => {
  const locked = { id: "a", locked: true };
  const open = { id: "b", locked: false };
  const unlocked = (row: { locked: boolean }) => !row.locked;

  it("行级判定为假的行不出删除项", () => {
    expect(isRowDeletable(true, locked, unlocked)).toBe(false);
    expect(isRowDeletable(true, open, unlocked)).toBe(true);
  });

  it("只能收窄：表级不许删时判定为真也不出", () => {
    expect(isRowDeletable(false, open, unlocked)).toBe(false);
  });

  it("没给行级判定时沿用表级结论", () => {
    expect(isRowDeletable(true, locked)).toBe(true);
  });
});
