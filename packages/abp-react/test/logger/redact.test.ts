import { describe, expect, it } from "vitest";
import { DEFAULT_REDACT_KEYS, REDACT_MASK, redact } from "../../src/logger/redact";

describe("redact", () => {
  it("masks default sensitive keys case-insensitively", () => {
    const input = { Authorization: "Bearer abc", url: "/api", access_token: "x" };
    expect(redact(input)).toEqual({
      Authorization: REDACT_MASK,
      url: "/api",
      access_token: REDACT_MASK,
    });
  });

  it("leaves the generic `state` field alone by default", () => {
    // The OAuth `state` is a CSRF nonce that already travels in plain sight in the browser URL,
    // while `state` as a field name is everywhere in ordinary domain logging.
    expect(redact({ state: "processing", access_token: "x" })).toEqual({
      state: "processing",
      access_token: REDACT_MASK,
    });
  });

  it("masks nested and array values", () => {
    const input = { headers: { Cookie: "a=1" }, items: [{ password: "p" }] };
    expect(redact(input)).toEqual({
      headers: { Cookie: REDACT_MASK },
      items: [{ password: REDACT_MASK }],
    });
  });

  it("does not mutate the input", () => {
    const input = { access_token: "x" };
    redact(input);
    expect(input.access_token).toBe("x");
  });

  it("handles circular references without throwing", () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;
    const out = redact(input) as Record<string, unknown>;
    expect(out.a).toBe(1);
    expect(out.self).toBe("[Circular]");
  });

  it("supports custom keys", () => {
    expect(redact({ ssn: "123" }, [...DEFAULT_REDACT_KEYS, "ssn"])).toEqual({ ssn: REDACT_MASK });
  });

  it("does not mark shared non-circular references as [Circular]", () => {
    const shared = { x: 1 };
    expect(redact({ a: shared, b: shared })).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });

  it("preserves Error fields instead of collapsing to {}", () => {
    const out = redact({ err: new Error("boom") }) as { err: { name: string; message: string } };
    expect(out.err.name).toBe("Error");
    expect(out.err.message).toBe("boom");
  });

  it("serializes Date to ISO string", () => {
    const out = redact({ when: new Date("2026-07-15T00:00:00.000Z") }) as { when: string };
    expect(out.when).toBe("2026-07-15T00:00:00.000Z");
  });

  it("walks Map entries and keeps masking sensitive keys", () => {
    const input = {
      headers: new Map([
        ["Authorization", "Bearer x"],
        ["url", "/api"],
      ]),
    };
    expect(redact(input)).toEqual({ headers: { Authorization: REDACT_MASK, url: "/api" } });
  });

  it("walks Set members instead of collapsing them", () => {
    const input = { tried: new Set(["a", { password: "p" }]) };
    expect(redact(input)).toEqual({ tried: ["a", { password: REDACT_MASK }] });
  });

  it("guards a cycle that runs through a Map", () => {
    const input: Record<string, unknown> = {};
    input.map = new Map([["self", input]]);
    const out = redact(input) as { map: { self: string } };
    expect(out.map.self).toBe("[Circular]");
  });

  it("still masks a matched key whose value is a non-plain object", () => {
    expect(redact({ access_token: new Error("leak") })).toEqual({ access_token: REDACT_MASK });
  });
});
