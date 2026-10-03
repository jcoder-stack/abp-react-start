import { describe, expect, it } from "vitest";
import { bulkDeleteNotice, partitionDeletable } from "@/components/abp/table/abp-bulk-delete";

describe("partitionDeletable", () => {
  const unlocked = (row: { locked: boolean }) => !row.locked;

  it("行级判定为假的行不进删除请求，计入跳过", () => {
    const rows = [
      { id: "a", locked: false },
      { id: "b", locked: true },
      { id: "c", locked: false },
    ];
    expect(partitionDeletable(rows, unlocked)).toEqual({ ids: ["a", "c"], skipped: 1 });
  });

  it("没有 id 的行进不了删除端点，计入跳过", () => {
    expect(partitionDeletable([{ locked: false }, { id: "a", locked: false }], unlocked)).toEqual({
      ids: ["a"],
      skipped: 1,
    });
  });

  it("没给行级判定时全部可删", () => {
    expect(partitionDeletable([{ id: "a", locked: true }])).toEqual({ ids: ["a"], skipped: 0 });
  });
});

describe("bulkDeleteNotice", () => {
  it("无跳过时沿用成功 / 全败 / 部分失败三种结局", () => {
    expect(bulkDeleteNotice(3, 0, 0)).toEqual({ kind: "success", key: "Crud:Deleted", args: [] });
    expect(bulkDeleteNotice(3, 3, 0)).toEqual({
      kind: "error",
      key: "Crud:OperationFailed",
      args: [],
    });
    expect(bulkDeleteNotice(3, 1, 0)).toEqual({
      kind: "warning",
      key: "Crud:BulkDeletePartialFailure",
      args: [2, 1],
    });
  });

  it("有跳过就不报纯成功，删了几条、跳过几条都要交代", () => {
    expect(bulkDeleteNotice(2, 0, 1)).toEqual({
      kind: "warning",
      key: "Crud:BulkDeleteSkipped",
      args: [2, 0, 1],
    });
  });

  it("一条都没删成时是错误，不是警告", () => {
    expect(bulkDeleteNotice(2, 2, 1)).toEqual({
      kind: "error",
      key: "Crud:BulkDeleteSkipped",
      args: [0, 2, 1],
    });
  });

  it("所选全部不可删时不发请求，直接说明", () => {
    expect(bulkDeleteNotice(0, 0, 2)).toEqual({
      kind: "error",
      key: "Crud:BulkDeleteNoneDeletable",
      args: [2],
    });
  });

  it("有失败时把后端理由逐行附上，全删成功时不附", () => {
    expect(
      bulkDeleteNotice(2, 2, 0, ["Still referenced", "Default calendar cannot be deleted"]),
    ).toEqual({
      kind: "error",
      key: "Crud:OperationFailed",
      args: [],
      description: "Still referenced\nDefault calendar cannot be deleted",
    });
    expect(bulkDeleteNotice(3, 1, 0, ["Still referenced"]).description).toBe("Still referenced");
    expect(bulkDeleteNotice(2, 0, 0, ["Still referenced"]).description).toBeUndefined();
  });

  it("空选择时不报成功", () => {
    expect(bulkDeleteNotice(0, 0, 0)).toEqual({
      kind: "error",
      key: "Crud:OperationFailed",
      args: [],
    });
  });
});
