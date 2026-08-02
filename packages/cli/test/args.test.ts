import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/args";

describe("parseCliArgs", () => {
  it("parses gen with flags", () => {
    expect(parseCliArgs(["gen", "--input", "./s.json", "--output", "src/api"])).toEqual({
      command: "gen",
      positionals: [],
      flags: { input: "./s.json", output: "src/api" },
    });
  });

  it("parses add with a positional name and flags", () => {
    const result = parseCliArgs(["add", "auth", "--dest", "app/src"]);
    expect(result.command).toBe("add");
    expect(result.positionals).toEqual(["auth"]);
    expect(result.flags.dest).toBe("app/src");
  });

  it("defaults to help for no args, help, and -h", () => {
    expect(parseCliArgs([]).command).toBe("help");
    expect(parseCliArgs(["help"]).command).toBe("help");
    expect(parseCliArgs(["-h"]).command).toBe("help");
  });

  it("throws on unknown commands and unknown flags", () => {
    expect(() => parseCliArgs(["frobnicate"])).toThrow(/unknown command/i);
    expect(() => parseCliArgs(["gen", "--bogus"])).toThrow();
  });

  it("rejects flags that belong to a different command", () => {
    expect(() => parseCliArgs(["gen", "--no-admin"])).toThrow(/--no-admin/);
    expect(() => parseCliArgs(["gen", "--dest", "x"])).toThrow(/--dest/);
    expect(() => parseCliArgs(["add", "auth", "--input", "x"])).toThrow(/--input/);
    expect(() => parseCliArgs(["init", "--output", "x"])).toThrow(/--output/);
  });

  it("keeps --no-admin working for init only", () => {
    expect(parseCliArgs(["init", "--no-admin"]).flags.admin).toBe(false);
    expect(parseCliArgs(["init"]).flags.admin).toBe(true);
  });
});
