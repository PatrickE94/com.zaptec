/**
 * Client side rate limiting for the Zaptec API.
 *
 * See https://docs.zaptec.com/docs/api-rate-limiting
 *
 * The API allows 10 requests/second with a burst of 15 per user, and
 * 1 request/second per IP address for the token endpoint. Requests over the
 * limit are rejected immediately with 429 rather than being queued.
 *
 * All devices and drivers run in the same app process, so the limiters here
 * are module level and shared between every ZaptecApi instance. That way an
 * installation with many chargers polling at the same time is spread out
 * instead of blowing the burst allowance.
 */

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface RateLimiterOptions {
  /** Sustained number of requests allowed per second */
  ratePerSecond: number;
  /** Number of requests which may be made back to back */
  burst: number;
}

/**
 * A token bucket which queues callers until they're allowed to proceed.
 *
 * Callers are served in FIFO order. The bucket can be paused, e.g. when the
 * server responds with 429, which delays everyone sharing the bucket.
 */
export class RateLimiter {
  private readonly intervalMs: number;
  private readonly burst: number;
  private tokens: number;
  private lastRefill: number;
  private pausedUntil = 0;
  private queue: (() => void)[] = [];
  private timer?: NodeJS.Timeout;

  constructor(options: RateLimiterOptions) {
    this.intervalMs = 1000 / options.ratePerSecond;
    this.burst = options.burst;
    this.tokens = options.burst;
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a request may be made.
   */
  public acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  /**
   * Stop handing out tokens for the given duration.
   *
   * Also empties the bucket, so requests are spread out after the pause
   * instead of bursting straight back into the limit.
   */
  public pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    this.tokens = 0;
    this.lastRefill = this.pausedUntil;
    this.schedule(ms);
  }

  private refill(now: number) {
    if (now <= this.lastRefill) return;
    const added = (now - this.lastRefill) / this.intervalMs;
    this.tokens = Math.min(this.burst, this.tokens + added);
    this.lastRefill = now;
  }

  private drain() {
    const now = Date.now();
    if (now < this.pausedUntil) {
      this.schedule(this.pausedUntil - now);
      return;
    }

    this.refill(now);
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      this.queue.shift()!();
    }

    if (this.queue.length > 0)
      this.schedule((1 - this.tokens) * this.intervalMs);
  }

  private schedule(ms: number) {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.drain();
    }, Math.max(0, Math.ceil(ms)));
  }
}

// Stay a bit below the documented limits to leave headroom for clock drift
// and requests in flight.
const API_LIMIT: RateLimiterOptions = { ratePerSecond: 8, burst: 10 };
const TOKEN_LIMIT: RateLimiterOptions = { ratePerSecond: 0.8, burst: 1 };

const apiLimiters = new Map<string, RateLimiter>();
const tokenLimiter = new RateLimiter(TOKEN_LIMIT);

/**
 * Get the limiter for regular API requests made by the given account.
 *
 * Zaptec limits per user, so devices using the same account share a bucket.
 */
export function apiLimiterFor(account: string): RateLimiter {
  const key = account.toLowerCase();
  let limiter = apiLimiters.get(key);
  if (limiter === undefined) {
    limiter = new RateLimiter(API_LIMIT);
    apiLimiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Get the limiter for the token endpoint, which is limited per IP address.
 */
export function tokenEndpointLimiter(): RateLimiter {
  return tokenLimiter;
}

/**
 * Parse a Retry-After header into milliseconds.
 *
 * Supports both delay-seconds and HTTP-date formats.
 */
export function parseRetryAfter(value: string | string[] | undefined) {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return undefined;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());

  return undefined;
}

/**
 * Exponential backoff with full jitter, so clients which were rejected at the
 * same time don't retry at the same time either.
 */
export function backoffWithJitter(attempt: number, baseMs = 500, maxMs = 30_000) {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return cap / 2 + Math.random() * (cap / 2);
}

export { sleep };
