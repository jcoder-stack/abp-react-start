// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionUnavailableStore } from "../../src/realtime/unavailable";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("sessionUnavailableStore", () => {
  it("remembers a hub for the rest of the tab session", () => {
    const store = sessionUnavailableStore();
    expect(store.has("notifications")).toBe(false);
    store.mark("notifications");
    expect(sessionUnavailableStore().has("notifications")).toBe(true);
    expect(store.has("dashboard")).toBe(false);
  });

  it("degrades to forgetting when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const store = sessionUnavailableStore();
    expect(() => store.mark("notifications")).not.toThrow();
    expect(store.has("notifications")).toBe(false);
  });
});
