import { LEVEL_ORDER, type LogThreshold } from "./levels";

const VALID_LEVELS = new Set(Object.keys(LEVEL_ORDER));

/** Parses a browser log override into the pieces that override the resolved config. Accepts
 *  `"level"`, `"level:scope,scope"` or a bare `"scope,scope"`. Returns null for an empty value;
 *  `scopes: null` means "no scope filter". */
export function parseBrowserOverride(
  raw: string | null,
): { level?: LogThreshold; scopes?: string[] | null } | null {
  if (!raw) return null;
  // 只在首个冒号切分：child() 会产生 "http:auth" 这类冒号嵌套 scope，不能被再次切开。
  const sepIndex = raw.indexOf(":");
  const levelPart = sepIndex === -1 ? raw : raw.slice(0, sepIndex);
  const hasLevel = VALID_LEVELS.has(levelPart);
  // 首段不是 level 就把整串当 scope：否则 "http,auth" 会被整体读成非法 level，落成谁也不过滤不掉的空操作。
  const scopePart = hasLevel ? raw.slice(levelPart.length + 1) : raw;
  const result: { level?: LogThreshold; scopes?: string[] | null } = {};

  if (hasLevel) {
    result.level = levelPart as LogThreshold;
  }

  const scopes = scopePart
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  result.scopes = scopes.length ? scopes : null;

  return result;
}
