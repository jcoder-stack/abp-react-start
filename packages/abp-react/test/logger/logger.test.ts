import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../../src/logger/config";
import { createLogger, createMemorySink } from "../../src/logger/logger";

describe("createLogger", () => {
  it("writes records at/above threshold with redacted fields", () => {
    const { sink, records } = createMemorySink();
    const log = createLogger({ scope: "http", config: resolveConfig({ LOG_LEVEL: "info" }), sink });

    log.debug("skipped");
    log.warn("request", { Authorization: "Bearer x", url: "/api" });

    expect(records).toHaveLength(1);
    expect(records[0]?.level).toBe("warn");
    expect(records[0]?.scope).toBe("http");
    expect(records[0]?.fields).toEqual({ Authorization: "***REDACTED***", url: "/api" });
  });

  it("no-ops entirely when disabled", () => {
    const { sink, records } = createMemorySink();
    const log = createLogger({
      scope: "http",
      config: resolveConfig({ LOG_ENABLED: "false" }),
      sink,
    });
    log.error("boom", { access_token: "x" });
    expect(records).toHaveLength(0);
  });

  it("filters by scope", () => {
    const { sink, records } = createMemorySink();
    const log = createLogger({
      scope: "i18n",
      config: resolveConfig({ LOG_SCOPES: "http" }),
      sink,
    });
    log.error("nope");
    expect(records).toHaveLength(0);
  });

  it("child derives nested scope", () => {
    const { sink, records } = createMemorySink();
    const log = createLogger({ scope: "http", config: resolveConfig({}), sink });
    log.child({ scope: "auth" }).info("login");
    expect(records[0]?.scope).toBe("http:auth");
  });

  describe("without an explicit config", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("reads LOG_* switches from process.env", () => {
      vi.stubEnv("LOG_LEVEL", "error");
      const { sink, records } = createMemorySink();
      const log = createLogger({ scope: "t", sink });
      log.info("skipped");
      expect(records).toHaveLength(0);
      log.error("boom");
      expect(records).toHaveLength(1);
      expect(records[0]?.level).toBe("error");
    });
  });

  it("child binds fields that merge with per-call fields (keeping the scope when omitted)", () => {
    const { sink, records } = createMemorySink();
    const log = createLogger({ scope: "http", config: resolveConfig({}), sink });
    log.child({ fields: { requestId: "r1" } }).info("hit", { url: "/api" });
    expect(records[0]?.scope).toBe("http");
    expect(records[0]?.fields).toEqual({ requestId: "r1", url: "/api" });
  });
});
