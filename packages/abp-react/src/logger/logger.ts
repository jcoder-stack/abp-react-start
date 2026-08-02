import { type LoggerConfig, resolveConfig, scopeEnabled } from "./config";
import { isLevelEnabled, type LogLevel } from "./levels";
import { redact } from "./redact";
import { consoleSink, type LogRecord, type LogSink } from "./sink";

/**
 * Scoped, level-filtered logger.
 *
 * Only `fields` go through redaction. The `message` string is written verbatim, so anything
 * sensitive (tokens, cookies, credential-bearing URLs) must be passed as a field rather than
 * interpolated into the message.
 */
export interface Logger {
  trace(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(opts: { scope?: string; fields?: Record<string, unknown> }): Logger;
}

export function createMemorySink(): { sink: LogSink; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return { sink: { write: (r) => records.push(r) }, records };
}

/** Creates a logger for `scope`, writing to `sink` (console by default) every record that passes the config's level and scope filters; `fields` are bound to every record and redacted, while message strings are logged as-is and must not carry secrets. */
export function createLogger(opts: {
  scope: string;
  config?: LoggerConfig;
  sink?: LogSink;
  fields?: Record<string, unknown>;
}): Logger {
  // 缺省时读 process.env，让 LOG_ENABLED/LOG_LEVEL/LOG_SCOPES 对未显式传 config 的调用生效；浏览器无 process 则回退默认。
  const config = opts.config ?? resolveConfig(typeof process !== "undefined" ? process.env : {});
  const sink = opts.sink ?? consoleSink;
  const scope = opts.scope;
  const boundFields = opts.fields;

  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>): void => {
    if (!config.enabled) return;
    if (!isLevelEnabled(level, config.level)) return;
    if (!scopeEnabled(scope, config.scopes)) return;
    const merged = boundFields || fields ? { ...boundFields, ...fields } : undefined;
    sink.write({
      level,
      scope,
      message,
      fields: merged ? (redact(merged, config.redactKeys) as Record<string, unknown>) : undefined,
      time: new Date().toISOString(),
    });
  };

  return {
    trace: (m, f) => emit("trace", m, f),
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (childOpts) =>
      createLogger({
        scope: childOpts.scope ? `${scope}:${childOpts.scope}` : scope,
        config,
        sink,
        fields: childOpts.fields ? { ...boundFields, ...childOpts.fields } : boundFields,
      }),
  };
}
