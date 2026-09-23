import assert from 'assert';
import { RateLimiter, parseRetryAfter } from './ratelimit';

describe('RateLimiter', () => {
  it('should let a burst through immediately', async () => {
    const limiter = new RateLimiter({ ratePerSecond: 10, burst: 5 });
    const start = Date.now();
    await Promise.all(Array.from({ length: 5 }, () => limiter.acquire()));
    assert.ok(Date.now() - start < 50);
  });

  it('should spread requests beyond the burst over time', async () => {
    const limiter = new RateLimiter({ ratePerSecond: 20, burst: 2 });
    const start = Date.now();
    // 2 from the burst, then 4 more at 50ms intervals
    await Promise.all(Array.from({ length: 6 }, () => limiter.acquire()));
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 190, `finished too early: ${elapsed}ms`);
    assert.ok(elapsed < 400, `finished too late: ${elapsed}ms`);
  });

  it('should hold back everyone while paused', async () => {
    const limiter = new RateLimiter({ ratePerSecond: 100, burst: 10 });
    limiter.pause(200);
    const start = Date.now();
    await Promise.all([limiter.acquire(), limiter.acquire()]);
    assert.ok(Date.now() - start >= 195);
  });
});

describe('parseRetryAfter', () => {
  it('should parse seconds', () => {
    assert.strictEqual(parseRetryAfter('1'), 1000);
    assert.strictEqual(parseRetryAfter('0'), 0);
  });

  it('should parse HTTP dates', () => {
    const date = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfter(date)!;
    assert.ok(ms > 3000 && ms <= 5000);
  });

  it('should ignore missing or invalid values', () => {
    assert.strictEqual(parseRetryAfter(undefined), undefined);
    assert.strictEqual(parseRetryAfter(''), undefined);
    assert.strictEqual(parseRetryAfter('soon'), undefined);
  });
});
