import { describe, expect, it } from "vitest";
import { getPageItems } from "../ui/blocks/data-table/data-table-footer";

describe("getPageItems", () => {
  it("总页数不超过阈值时全显", () => {
    expect(getPageItems(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(getPageItems(0, 1)).toEqual([0]);
  });

  it("首页：窗口贴左，省略号落在倒数第二槽", () => {
    expect(getPageItems(0, 20)).toEqual([0, 1, 2, 3, 4, "ellipsis", 19]);
  });

  it("第 4 页仍算贴左，第 5 页起窗口才居中", () => {
    expect(getPageItems(3, 20)).toEqual([0, 1, 2, 3, 4, "ellipsis", 19]);
    expect(getPageItems(4, 20)).toEqual([0, "ellipsis", 3, 4, 5, "ellipsis", 19]);
  });

  it("末页：与首页对称", () => {
    expect(getPageItems(19, 20)).toEqual([0, "ellipsis", 15, 16, 17, 18, 19]);
    expect(getPageItems(16, 20)).toEqual([0, "ellipsis", 15, 16, 17, 18, 19]);
  });

  it("槽位数恒为 7：翻页时页码不左右跳", () => {
    for (let pageCount = 8; pageCount <= 30; pageCount++) {
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        expect(getPageItems(pageIndex, pageCount)).toHaveLength(7);
      }
    }
  });

  it("越界页码被钳回有效范围", () => {
    expect(getPageItems(-5, 20)).toEqual(getPageItems(0, 20));
    expect(getPageItems(99, 20)).toEqual(getPageItems(19, 20));
  });
});
