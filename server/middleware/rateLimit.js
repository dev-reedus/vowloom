// Tiny in-memory, per-key failure limiter for auth endpoints. Single-process
// only (state resets on restart), which is fine for this single-container app -
// it exists to blunt online password/key guessing, not as a distributed quota.
//
// A key (typically the client IP) accrues failures within a rolling window;
// once it exceeds `max`, it is blocked for `blockMs`. A success clears it.
export function createFailureLimiter({ max = 10, windowMs = 15 * 60 * 1000, blockMs = 15 * 60 * 1000 } = {}) {
  const entries = new Map() // key -> { count, firstAt, blockedUntil }

  function prune(now) {
    for (const [key, e] of entries) {
      const expired = (!e.blockedUntil || e.blockedUntil <= now) && now - e.firstAt > windowMs
      if (expired) entries.delete(key)
    }
  }

  return {
    // Seconds to wait if currently blocked, else 0.
    retryAfter(key, now = Date.now()) {
      const e = entries.get(key)
      if (e?.blockedUntil && e.blockedUntil > now) return Math.ceil((e.blockedUntil - now) / 1000)
      return 0
    },

    recordFailure(key, now = Date.now()) {
      prune(now)
      const e = entries.get(key)
      if (!e || now - e.firstAt > windowMs) {
        entries.set(key, { count: 1, firstAt: now, blockedUntil: 0 })
        return
      }
      e.count += 1
      if (e.count >= max) e.blockedUntil = now + blockMs
    },

    recordSuccess(key) {
      entries.delete(key)
    },
  }
}
