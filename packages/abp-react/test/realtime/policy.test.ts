import { describe, expect, it } from "vitest";
import { assertHubName, classifyStartError, nextReconnectDelay } from "../../src/realtime/policy";

describe("nextReconnectDelay", () => {
  it("backs off 0, 2s, 5s, 10s, 30s, then holds at 60s forever", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(nextReconnectDelay)).toEqual([
      0, 2_000, 5_000, 10_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });
});

describe("classifyStartError", () => {
  // 文本取自 @microsoft/signalr 10：HttpError 的 message 是 `${statusText}: Status code '${status}'`，
  // negotiate 失败再包一层 FailedToNegotiateWithServerError。
  it("reads a 404 negotiate failure as a missing hub", () => {
    const error = new Error(
      "Failed to complete negotiation with the server: Error: Not Found: Status code '404' Either this is not a SignalR endpoint or there is a proxy blocking the connection.",
    );
    expect(classifyStartError(error)).toBe("not-found");
  });

  it("reads a 401 as a rejected token", () => {
    expect(
      classifyStartError(
        new Error(
          "Failed to complete negotiation with the server: Error: Unauthorized: Status code '401'",
        ),
      ),
    ).toBe("unauthorized");
  });

  it("treats everything else as transient", () => {
    expect(classifyStartError(new Error("Failed to fetch"))).toBe("transient");
    expect(classifyStartError(new Error("Bad Gateway: Status code '502'"))).toBe("transient");
    expect(classifyStartError("weird")).toBe("transient");
  });
});

describe("assertHubName", () => {
  it("accepts lowercase letters, digits and dashes", () => {
    expect(() => assertHubName("notifications")).not.toThrow();
    expect(() => assertHubName("dashboard-2")).not.toThrow();
  });

  it.each(["Chat", "my_hub", "", "a/b", "../x"])(
    "rejects %j with the rule in the message",
    (name) => {
      expect(() => assertHubName(name)).toThrow(/lowercase letters, digits and dashes/);
    },
  );
});
