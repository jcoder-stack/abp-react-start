/** Levels a log record can actually carry. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** Levels accepted as a configured threshold; `silent` only ever suppresses, it is never emitted. */
export type LogThreshold = LogLevel | "silent";

export const LEVEL_ORDER: Record<LogThreshold, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100,
};

export function isLevelEnabled(messageLevel: LogLevel, threshold: LogThreshold): boolean {
  return LEVEL_ORDER[messageLevel] >= LEVEL_ORDER[threshold];
}
