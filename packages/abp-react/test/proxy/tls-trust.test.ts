import { describe, expect, it } from "vitest";
import { tlsTrustFailureCode, tlsTrustFailureMessage } from "../../src/proxy/tls-trust";

function withCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("tlsTrustFailureCode", () => {
  it("finds the code undici buries under `fetch failed`", () => {
    const error = new TypeError("fetch failed", {
      cause: withCode("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT"),
    });
    expect(tlsTrustFailureCode(error)).toBe("DEPTH_ZERO_SELF_SIGNED_CERT");
  });

  it("finds the code inside an AggregateError from a dual-stack localhost attempt", () => {
    const error = new TypeError("fetch failed", {
      cause: new AggregateError([
        withCode("connect ECONNREFUSED ::1:44316", "ECONNREFUSED"),
        withCode("unable to verify the first certificate", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"),
      ]),
    });
    expect(tlsTrustFailureCode(error)).toBe("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
  });

  it.each(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"])(
    "leaves a transient network failure retryable (%s)",
    (code) => {
      expect(
        tlsTrustFailureCode(new TypeError("fetch failed", { cause: withCode("x", code) })),
      ).toBe(null);
    },
  );

  it("returns null for errors that carry no code at all", () => {
    expect(tlsTrustFailureCode(new Error("boom"))).toBe(null);
    expect(tlsTrustFailureCode("boom")).toBe(null);
    expect(tlsTrustFailureCode(null)).toBe(null);
  });

  it("terminates on a cyclic cause chain", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.assign(a, { cause: b });
    expect(tlsTrustFailureCode(a)).toBe(null);
  });
});

describe("tlsTrustFailureMessage", () => {
  it("names the origin, the code, and the variable that fixes it", () => {
    const message = tlsTrustFailureMessage(
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "https://localhost:44316/api/abp/application-configuration",
    );
    expect(message).toContain("https://localhost:44316");
    expect(message).toContain("DEPTH_ZERO_SELF_SIGNED_CERT");
    expect(message).toContain("NODE_EXTRA_CA_CERTS");
    // 路径可能带 token/租户查询串，日志与错误页都不该复述它。
    expect(message).not.toContain("/api/abp/application-configuration");
  });
});
