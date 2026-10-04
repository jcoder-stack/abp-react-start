import { describe, expect, it, vi } from "vitest";
import {
  isSafeRelativeUrl,
  localizeText,
  parseNotification,
} from "@/features/signalr/notification";

describe("parseNotification", () => {
  it("accepts the full contract and ignores extra fields", () => {
    expect(
      parseNotification({
        id: "n1",
        severity: "warning",
        title: { key: "Approvals:NewRequest", resource: "MyProject", args: { name: "Alice" } },
        message: "Please review",
        url: "/approvals/7",
        extra: true,
      }),
    ).toEqual({
      id: "n1",
      severity: "warning",
      title: { key: "Approvals:NewRequest", resource: "MyProject", args: { name: "Alice" } },
      message: "Please review",
      url: "/approvals/7",
    });
  });

  it("accepts null resource and args, which the SignalR JSON protocol sends for unset C# members", () => {
    const title = { key: "Some:Key", resource: null, args: null };
    expect(parseNotification({ id: "n", title })?.title).toEqual(title);
    expect(parseNotification({ id: "n", title: "t", message: title })?.message).toEqual(title);
  });

  it("downgrades an unknown or missing severity to info", () => {
    expect(parseNotification({ id: "n", severity: "fatal", title: "t" })?.severity).toBe("info");
    expect(parseNotification({ id: "n", title: "t" })?.severity).toBe("info");
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "approvals/7",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    " /approvals/7",
  ])("drops the unsafe url %j but keeps the notification", (url) => {
    const parsed = parseNotification({ id: "n", severity: "info", title: "t", url });
    expect(parsed).not.toBeNull();
    expect(parsed?.url).toBeUndefined();
  });

  it("drops a malformed message but keeps the notification", () => {
    expect(parseNotification({ id: "n", title: "t", message: 42 })).toEqual({
      id: "n",
      severity: "info",
      title: "t",
    });
  });

  it.each([
    ["no id", { title: "t" }],
    ["empty id", { id: "", title: "t" }],
    ["no title", { id: "n" }],
    ["numeric title", { id: "n", title: 3 }],
    ["title object without key", { id: "n", title: { resource: "R" } }],
    ["not an object", "hello"],
    ["null", null],
  ])("rejects a payload with %s", (_, raw) => {
    expect(parseNotification(raw)).toBeNull();
  });
});

describe("isSafeRelativeUrl", () => {
  it("only accepts same-origin absolute paths", () => {
    expect(isSafeRelativeUrl("/approvals/7?tab=1#c")).toBe(true);
    expect(isSafeRelativeUrl("//evil.example")).toBe(false);
    expect(isSafeRelativeUrl("/\\evil.example")).toBe(false);
  });

  it("rejects characters the URL parser strips, which would make /<tab>/host protocol-relative", () => {
    expect(isSafeRelativeUrl("/\t/evil.example")).toBe(false);
    expect(isSafeRelativeUrl("/\n/evil.example")).toBe(false);
    expect(isSafeRelativeUrl("/approvals/7?tab=1#c")).toBe(true);
  });
});

describe("localizeText", () => {
  const L = vi.fn((key: string, ...args: unknown[]) => `${key}|${JSON.stringify(args)}`);

  it("passes plain text through untouched", () => {
    expect(localizeText("Done", L)).toBe("Done");
  });

  it("looks up a resource-qualified key with named args", () => {
    expect(
      localizeText(
        { key: "Approvals:NewRequest", resource: "MyProject", args: { name: "Alice" } },
        L,
      ),
    ).toBe('MyProject::Approvals:NewRequest|[{"name":"Alice"}]');
  });

  it("looks up a bare key without args", () => {
    expect(localizeText({ key: "Notifications:View" }, L)).toBe("Notifications:View|[]");
  });

  it("treats a null resource and null args like absent ones", () => {
    expect(localizeText({ key: "Notifications:View", resource: null, args: null }, L)).toBe(
      "Notifications:View|[]",
    );
  });
});
