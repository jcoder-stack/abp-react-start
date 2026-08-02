import { LEVEL_ORDER, type LogThreshold } from "./levels";
import { DEFAULT_REDACT_KEYS } from "./redact";

export interface LoggerConfig {
  enabled: boolean;
  level: LogThreshold;
  scopes: string[] | null;
  redactKeys: string[];
}

const VALID_LEVELS = new Set(Object.keys(LEVEL_ORDER));

function parseLevel(raw: string | undefined): LogThreshold {
  if (raw && VALID_LEVELS.has(raw)) return raw as LogThreshold;
  return "info";
}

function parseScopes(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

export function resolveConfig(env: Record<string, string | undefined>): LoggerConfig {
  return {
    enabled: env.LOG_ENABLED !== "false",
    level: parseLevel(env.LOG_LEVEL),
    scopes: parseScopes(env.LOG_SCOPES),
    redactKeys: [...DEFAULT_REDACT_KEYS],
  };
}

export function scopeEnabled(scope: string, scopes: string[] | null): boolean {
  if (scopes === null) return true;
  return scopes.some((s) => scope === s || scope.startsWith(`${s}:`));
}
