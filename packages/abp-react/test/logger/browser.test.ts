import { describe, expect, it } from "vitest";
import { parseBrowserOverride } from "../../src/logger/browser";

describe("parseBrowserOverride", () => {
  it("returns null for empty", () => {
    expect(parseBrowserOverride(null)).toBeNull();
    expect(parseBrowserOverride("")).toBeNull();
  });

  it("parses level only", () => {
    expect(parseBrowserOverride("debug")).toEqual({ level: "debug", scopes: null });
  });

  it("parses level:scopes", () => {
    expect(parseBrowserOverride("debug:http,auth")).toEqual({
      level: "debug",
      scopes: ["http", "auth"],
    });
  });

  it("parses a level-less value as a scope filter", () => {
    expect(parseBrowserOverride("http,auth")).toEqual({ scopes: ["http", "auth"] });
  });

  it("keeps a nested scope whole when no level prefixes it", () => {
    expect(parseBrowserOverride("http:auth")).toEqual({ scopes: ["http:auth"] });
  });

  it("keeps colons inside scopes by splitting only at the first colon", () => {
    expect(parseBrowserOverride("debug:http:auth,ui")).toEqual({
      level: "debug",
      scopes: ["http:auth", "ui"],
    });
  });
});
