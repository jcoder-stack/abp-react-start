export const REDACT_MASK = "***REDACTED***";

/**
 * Field names masked by `redact` unless the caller passes its own list.
 *
 * Deliberately limited to actual credentials. Names that merely *appear* in an auth flow but are
 * not secret stay off the list. The OAuth `state` nonce is the notable one: it travels in plain
 * sight in the browser URL, and as the default of a published package, masking a name as common
 * as `state` costs far more in unreadable logs than it buys in protection. Add domain-specific names through
 * the `redactKeys` option instead.
 */
export const DEFAULT_REDACT_KEYS: string[] = [
  "authorization",
  "cookie",
  "set-cookie",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "code_verifier",
  "password",
];

function isPlainObject(val: object): boolean {
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

/** Returns a deep copy of `value` with any property whose name matches `keys` (case-insensitive) replaced by `mask`; walks arrays, plain objects, Maps and Sets, renders Error/Date readably, and marks cycles as `[Circular]`. Never mutates the input. */
export function redact(
  value: unknown,
  keys: string[] = DEFAULT_REDACT_KEYS,
  mask: string = REDACT_MASK,
): unknown {
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new WeakSet<object>();

  const walk = (val: unknown): unknown => {
    if (val === null || typeof val !== "object") return val;

    // Non-plain objects: represent safely instead of collapsing to {}
    if (val instanceof Error) {
      return { name: val.name, message: val.message, stack: val.stack };
    }
    if (val instanceof Date) return val.toISOString();
    const isWalkable =
      Array.isArray(val) || val instanceof Map || val instanceof Set || isPlainObject(val);
    if (!isWalkable) return String(val);

    // Ancestor-path circular guard: only guards the current recursion path
    if (seen.has(val)) return "[Circular]";
    seen.add(val);
    try {
      if (Array.isArray(val)) return val.map((v) => walk(v));
      if (val instanceof Set) return [...val].map((v) => walk(v));
      const entries =
        val instanceof Map
          ? [...val].map(([k, v]) => [String(k), v] as const)
          : Object.entries(val);
      const out: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        out[k] = keySet.has(k.toLowerCase()) ? mask : walk(v);
      }
      return out;
    } finally {
      seen.delete(val);
    }
  };

  return walk(value);
}
