import { describe, expect, it } from "vitest";
import { isLevelEnabled, type LogLevel } from "../../src/logger/levels";

/** 严格升序的严重度阶梯；相邻两级的可见性决定了整个 LEVEL_ORDER 的排序契约。 */
const LADDER: LogLevel[] = ["trace", "debug", "info", "warn", "error"];

describe("levels", () => {
  it("emits at or above the threshold and suppresses everything below it", () => {
    for (const [index, threshold] of LADDER.entries()) {
      expect(isLevelEnabled(threshold, threshold)).toBe(true);
      expect(isLevelEnabled(LADDER[index + 1] ?? threshold, threshold)).toBe(true);
      if (index > 0) expect(isLevelEnabled(LADDER[index - 1] as LogLevel, threshold)).toBe(false);
    }
  });

  it("silent threshold suppresses everything", () => {
    expect(isLevelEnabled("error", "silent")).toBe(false);
  });
});
