import { describe, expect, it } from "vitest";
import { isAbpTrue } from "../../src/core/abp-boolean";

describe("isAbpTrue", () => {
  it("accepts every casing ABP may persist", () => {
    expect(isAbpTrue("True")).toBe(true);
    expect(isAbpTrue("true")).toBe(true);
    expect(isAbpTrue("TRUE")).toBe(true);
  });

  it("rejects falsy, absent and non-boolean values", () => {
    expect(isAbpTrue("false")).toBe(false);
    expect(isAbpTrue("False")).toBe(false);
    expect(isAbpTrue(undefined)).toBe(false);
    expect(isAbpTrue(null)).toBe(false);
    expect(isAbpTrue("")).toBe(false);
    expect(isAbpTrue("1")).toBe(false);
  });
});
