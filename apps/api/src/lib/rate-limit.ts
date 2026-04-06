/**
 * rate-limit.ts
 *
 * In-memory sliding-window rate limiter.
 *
 * Suitable for the FAIRGO single-process custom server (server.ts).
 * Does NOT share state across replicas — each instance tracks its own
 * window independently, which is intentionally conservative (adds
 * protection, never subtracts from it).
 *
 * Usage:
 *   const result = checkRateLimit("ip:1.2.3.4:otp-request", 10 * 60_000, 10);
 *   if (!result.allowed) return errorResponse("Too many requests", 429);
 */

interface Bucket {
  /** Timestamps of requests within the sliding window. */
  hits: number[];
  /** Last access time — used for LRU eviction. */
  lastSeen: number;
}

const store = new Map<string, Bucket>();

/** Prune stale buckets every 5 minutes to avoid unbounded memory growth. */
const EVICTION_INTERVAL_MS = 5 * 60_000;
const MAX_IDLE_AGE_MS      = 60 * 60_000; // remove buckets idle for >1 h

// setInterval is safe here because this module is only loaded inside
// the long-lived Node.js server process (not an Edge runtime).
const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store.entries()) {
    if (now - bucket.lastSeen > MAX_IDLE_AGE_MS) {
      store.delete(key);
    }
  }
}, EVICTION_INTERVAL_MS);

// Prevent the timer from blocking process exit in tests
if (evictionTimer.unref) evictionTimer.unref();

// ── Public API ─────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** How long the caller must wait before retrying (ms). 0 if allowed. */
  retryAfterMs: number;
}

/**
 * Check whether `key` has exceeded `max` requests within the last `windowMs`.
 *
 * @param key      Unique rate-limit key, e.g. "ip:1.2.3.4:otp-request"
 * @param windowMs Sliding window length in milliseconds
 * @param max      Maximum requests allowed in the window
 */
export function checkRateLimit(
  key: string,
  windowMs: number,
  max: number
): RateLimitResult {
  const now        = Date.now();
  const windowStart = now - windowMs;

  let bucket = store.get(key);
  if (!bucket) {
    bucket = { hits: [], lastSeen: now };
    store.set(key, bucket);
  }

  // Prune hits outside the window
  bucket.hits = bucket.hits.filter((t) => t > windowStart);
  bucket.lastSeen = now;

  if (bucket.hits.length >= max) {
    const oldest       = bucket.hits[0]!;
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  bucket.hits.push(now);
  return { allowed: true, remaining: max - bucket.hits.length, retryAfterMs: 0 };
}

/**
 * Manually clear a rate-limit bucket (e.g. on successful auth to reset failed-attempts).
 */
export function clearRateLimit(key: string): void {
  store.delete(key);
}

/** For testing only — exposes internal store size. */
export function _storeSizeForTest(): number {
  return store.size;
}
