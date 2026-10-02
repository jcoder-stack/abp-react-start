import { describe, expect, it } from "vitest";
import { activeMenuPath } from "@/components/abp/layout/nav-active";

describe("activeMenuPath", () => {
  const menu = ["/", "/identity", "/identity/users", "/books"];

  it("详情页点亮它所属的列表项", () => {
    expect(activeMenuPath(menu, "/identity/users/123")).toBe("/identity/users");
  });

  it("只在段边界上匹配", () => {
    expect(activeMenuPath(menu, "/books-archive")).toBeUndefined();
  });

  it("多个命中取最长", () => {
    expect(activeMenuPath(menu, "/identity/users")).toBe("/identity/users");
    expect(activeMenuPath(menu, "/identity/roles")).toBe("/identity");
  });

  it("末尾斜杠不影响匹配", () => {
    expect(activeMenuPath(menu, "/books/")).toBe("/books");
  });

  it("根路径只在根上命中，不成为所有页面的前缀", () => {
    expect(activeMenuPath(menu, "/")).toBe("/");
    expect(activeMenuPath(["/", "/books"], "/settings")).toBeUndefined();
  });
});
