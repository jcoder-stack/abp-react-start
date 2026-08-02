import { describe, expect, it } from "vitest";
import { HttpError, toHttpError } from "../../src/core/errors";

describe("toHttpError", () => {
  it("extracts message/code from an ABP error envelope", () => {
    const err = toHttpError(403, { error: { code: "Abp.Authorization", message: "Forbidden" } });
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("Abp.Authorization");
    expect(err.message).toBe("Forbidden");
  });

  it("captures ABP validation errors", () => {
    const err = toHttpError(400, {
      error: {
        message: "Validation",
        validationErrors: [{ message: "Name required", members: ["name"] }],
      },
    });
    expect(err.validationErrors).toEqual([{ message: "Name required", members: ["name"] }]);
  });

  it.each([
    ["a string", "boom"],
    ["an object", { name: ["required"] }],
    ["entries without a message", [{ members: ["name"] }]],
    ["entries with a non-string message", [{ message: 42 }]],
  ])("drops malformed validationErrors (%s) instead of exposing them", (_label, malformed) => {
    const err = toHttpError(400, { error: { message: "Validation", validationErrors: malformed } });
    expect(err.validationErrors).toBeUndefined();
    expect(err.message).toBe("Validation");
  });

  it("keeps entries whose members list is null (ABP sends it for form-level errors)", () => {
    const err = toHttpError(400, {
      error: {
        message: "Validation",
        validationErrors: [{ message: "Name required", members: null }],
      },
    });
    expect(err.validationErrors).toEqual([{ message: "Name required" }]);
  });

  it("falls back to a generic message for a non-ABP body", () => {
    const err = toHttpError(500, "Internal Server Error");
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/500/);
    expect(err.body).toBe("Internal Server Error");
  });

  it("falls back gracefully when error is null (does not throw)", () => {
    const err = toHttpError(500, { error: null });
    expect(err.status).toBe(500);
    expect(err.message).toBe("HTTP 500");
    expect(err.body).toEqual({ error: null });
    expect(err.code).toBeUndefined();
  });

  it("treats an array body as non-ABP", () => {
    const err = toHttpError(400, [{ error: { message: "x" } }]);
    expect(err.message).toBe("HTTP 400");
  });
});
