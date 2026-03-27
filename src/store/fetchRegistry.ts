/**
 * Lightweight registry to throttle redundant data fetches.
 *
 * Components call `fetchRegistry.isStale(key, ttlMs)` before dispatching a
 * store fetch in `useIonViewWillEnter` handlers. This avoids firing N API
 * requests every time the user switches tabs.
 *
 * Stores themselves do NOT depend on this module — they always execute when
 * called. The throttling decision lives in the component layer.
 */

const _timestamps: Record<string, number> = {};

export const fetchRegistry = {
  /** Mark a key as freshly fetched right now. */
  register(key: string): void {
    _timestamps[key] = Date.now();
  },

  /** Returns true if the key was never registered or is older than `ttlMs`. */
  isStale(key: string, ttlMs = 30_000): boolean {
    const ts = _timestamps[key];
    if (!ts) return true;
    return Date.now() - ts > ttlMs;
  },

  /** Invalidate specific keys (or all keys when called with no args). */
  invalidate(...keys: string[]): void {
    if (keys.length === 0) {
      for (const k of Object.keys(_timestamps)) delete _timestamps[k];
    } else {
      for (const k of keys) delete _timestamps[k];
    }
  },
};
