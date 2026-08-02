import { describe, expect, it } from "vitest";
import { isGranted } from "../../src/permissions/is-granted";

describe("isGranted", () => {
  it("single policy: true only when granted", () => {
    expect(isGranted({ A: true }, "A")).toBe(true);
    expect(isGranted({ A: false }, "A")).toBe(false);
    expect(isGranted({}, "A")).toBe(false);
  });

  it("array with default strategy all", () => {
    expect(isGranted({ A: true, B: true }, ["A", "B"])).toBe(true);
    expect(isGranted({ A: true, B: false }, ["A", "B"])).toBe(false);
  });

  it("array with strategy any", () => {
    expect(isGranted({ A: false, B: true }, ["A", "B"], { strategy: "any" })).toBe(true);
    expect(isGranted({ A: false, B: false }, ["A", "B"], { strategy: "any" })).toBe(false);
  });

  it("empty array: all is vacuously true, any is false", () => {
    expect(isGranted({}, [], { strategy: "all" })).toBe(true);
    expect(isGranted({}, [], { strategy: "any" })).toBe(false);
  });
});
