import type { LogLevel } from "./levels";

/** One emitted log entry handed to a sink; `level` never carries the `silent` threshold. */
export interface LogRecord {
  level: LogLevel;
  scope: string;
  message: string;
  fields?: Record<string, unknown>;
  time: string;
}

export interface LogSink {
  write(record: LogRecord): void;
}

export const consoleSink: LogSink = {
  write(record) {
    const line = `[${record.time}] ${record.level.toUpperCase()} [${record.scope}] ${record.message}`;
    const method = record.level === "error" ? "error" : record.level === "warn" ? "warn" : "log";
    if (record.fields) console[method](line, record.fields);
    else console[method](line);
  },
};
