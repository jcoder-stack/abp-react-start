import { describe, expect, it } from "vitest";
import { resolveConfig, scopeEnabled } from "../../src/logger/config";
import { DEFAULT_REDACT_KEYS } from "../../src/logger/redact";

describe("resolveConfig", () => {
  it("defaults: enabled true, info, all scopes", () => {
    const c = resolveConfig({});
    expect(c.enabled).toBe(true);
    expect(c.level).toBe("info");
    expect(c.scopes).toBeNull();
  });

  it("parses LOG_LEVEL and LOG_SCOPES", () => {
    const c = resolveConfig({ LOG_LEVEL: "debug", LOG_SCOPES: "http, auth" });
    expect(c.level).toBe("debug");
    expect(c.scopes).toEqual(["http", "auth"]);
  });

  it("invalid LOG_LEVEL falls back to info", () => {
    expect(resolveConfig({ LOG_LEVEL: "bogus" }).level).toBe("info");
  });

  it("returns a fresh redactKeys array, not the shared constant", () => {
    const a = resolveConfig({}).redactKeys;
    const b = resolveConfig({}).redactKeys;
    expect(a).not.toBe(b);
    expect(a).toEqual(DEFAULT_REDACT_KEYS);
  });

  it('only the exact string "false" disables; other values keep enabled', () => {
    expect(resolveConfig({ LOG_ENABLED: "false" }).enabled).toBe(false);
    expect(resolveConfig({ LOG_ENABLED: "0" }).enabled).toBe(true);
    expect(resolveConfig({ LOG_ENABLED: "FALSE" }).enabled).toBe(true);
    expect(resolveConfig({ LOG_ENABLED: "true" }).enabled).toBe(true);
  });
});

describe("scopeEnabled", () => {
  it("null scopes means all enabled", () => {
    expect(scopeEnabled("anything", null)).toBe(true);
  });
  it("matches listed scope", () => {
    expect(scopeEnabled("http", ["http", "auth"])).toBe(true);
    expect(scopeEnabled("i18n", ["http", "auth"])).toBe(false);
  });
  it("prefix-cascades a parent scope to its child scopes", () => {
    expect(scopeEnabled("http:auth", ["http"])).toBe(true);
    expect(scopeEnabled("http", ["http"])).toBe(true);
    expect(scopeEnabled("i18n", ["http"])).toBe(false);
  });
  it("requires a colon boundary (does not match a mere string prefix)", () => {
    expect(scopeEnabled("httpx", ["http"])).toBe(false);
  });
});
