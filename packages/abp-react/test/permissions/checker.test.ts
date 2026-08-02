import { describe, expect, it } from "vitest";
import { createPermissionChecker } from "../../src/permissions/checker";

const can = createPermissionChecker({ A: true, B: false, C: true });

describe("createPermissionChecker", () => {
  it("can(single) checks one policy", () => {
    expect(can("A")).toBe(true);
    expect(can("B")).toBe(false);
  });

  it("can(array) defaults to all", () => {
    expect(can(["A", "C"])).toBe(true);
    expect(can(["A", "B"])).toBe(false);
  });

  it("can.all is variadic and tolerates arrays (equivalent)", () => {
    expect(can.all("A", "C")).toBe(true);
    expect(can.all("A", "B")).toBe(false);
    expect(can.all(["A", "C"])).toBe(true);
    expect(can.all("A", ["C"])).toBe(true);
  });

  it("can.any is variadic and tolerates arrays", () => {
    expect(can.any("B", "A")).toBe(true);
    expect(can.any("B")).toBe(false);
    expect(can.any(["B", "A"])).toBe(true);
  });

  it("can.not negates", () => {
    expect(can.not("B")).toBe(true);
    expect(can.not("A")).toBe(false);
  });

  it("denies an empty policy set instead of allowing it vacuously", () => {
    expect(can.all()).toBe(false);
    expect(can.any()).toBe(false);
    expect(can.all([])).toBe(false);
    expect(can.any([])).toBe(false);
    expect(can([])).toBe(false);
  });
});
