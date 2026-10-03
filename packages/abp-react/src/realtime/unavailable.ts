const KEY_PREFIX = "jc-abp:realtime:unavailable:";

export interface UnavailableStore {
  has(hub: string): boolean;
  mark(hub: string): void;
}

/**
 * Remembers, for the rest of the tab session, that a hub returned 404. Auth state changes are
 * full page loads, so without this every navigation would re-send a doomed negotiate.
 * Storage that throws (private mode, blocked site data) only costs that memory.
 */
export function sessionUnavailableStore(): UnavailableStore {
  return {
    has: (hub) => {
      try {
        return globalThis.sessionStorage?.getItem(KEY_PREFIX + hub) === "1";
      } catch {
        return false;
      }
    },
    mark: (hub) => {
      try {
        globalThis.sessionStorage?.setItem(KEY_PREFIX + hub, "1");
      } catch {
        // 见上：存储不可用时只丢跨跳转记忆，降级本身照常。
      }
    },
  };
}
