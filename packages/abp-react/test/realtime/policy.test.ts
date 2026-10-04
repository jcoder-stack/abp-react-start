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

  it("reads a 403 negotiate failure as a hub the user may not use", () => {
    expect(
      classifyStartError(
        new Error(
          "Failed to complete negotiation with the server: Error: Forbidden: Status code '403'",
        ),
      ),
    ).toBe("forbidden");
  });

  it("trusts the error type when the message lacks the negotiate prefix", () => {
    const error = Object.assign(new Error("Error: Unauthorized: Status code '401'"), {
      errorType: "FailedToNegotiateWithServerError",
    });
    expect(classifyStartError(error)).toBe("unauthorized");
  });

  it("ignores a status from a transport failure: only negotiate decides about the hub", () => {
    const error = new Error(
      "Unable to connect to the server with any of the available transports. Error: LongPolling failed: Error: Not Found: Status code '404'",
    );
    expect(classifyStartError(error)).toBe("transient");
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
