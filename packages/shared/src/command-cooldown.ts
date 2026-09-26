/**
 * Per-user/per-command rate limiting for Discord slash commands.
 *
 * The bot runs as a single process, so an in-memory window is authoritative;
 * no Redis round-trip is needed on the interaction hot path. Entries are
 * pruned lazily so a long-lived process cannot grow without bound.
 */
export type CooldownDecision = { allowed: true; retryAfterMs: 0 } | { allowed: false; retryAfterMs: number };

export type CommandCooldownOptions = {
  /** Minimum spacing between two accepted uses of the same key. */
  windowMs?: number;
  /** Hard cap on tracked keys; oldest entries are evicted beyond this. */
  maxEntries?: number;
};

export function createCommandCooldown(options: CommandCooldownOptions = {}) {
  const windowMs = Math.max(1, options.windowMs ?? 2_500);
  const maxEntries = Math.max(1, options.maxEntries ?? 10_000);
  const lastAccepted = new Map<string, number>();

  function prune(now: number) {
    for (const [key, acceptedAt] of lastAccepted) if (now - acceptedAt >= windowMs) lastAccepted.delete(key);
    while (lastAccepted.size > maxEntries) {
      const oldest = lastAccepted.keys().next();
      if (oldest.done) break;
      lastAccepted.delete(oldest.value);
    }
  }

  return {
    /** Checks the key and records it only when the call is accepted; blocked attempts never extend the window. */
    check(key: string, now = Date.now()): CooldownDecision {
      const previous = lastAccepted.get(key);
      if (previous !== undefined && now - previous < windowMs) {
        return { allowed: false, retryAfterMs: previous + windowMs - now };
      }
      lastAccepted.set(key, now);
      if (lastAccepted.size >= maxEntries) prune(now);
      return { allowed: true, retryAfterMs: 0 };
    },
    get size() {
      return lastAccepted.size;
    },
  };
}
