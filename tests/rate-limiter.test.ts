/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/performance/rate-limiter.js';

describe('RateLimiter', () => {
  describe('Token Bucket Algorithm', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        algorithm: 'token-bucket',
        maxRequests: 10,
        windowMs: 1000, // 1 second
        burstSize: 15,
      });
    });

    it('should allow requests within burst size', async () => {
      const key = 'user:123';

      // Should allow 15 requests (burst size)
      for (let i = 0; i < 15; i++) {
        const result = await rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }

      // 16th request should be rejected
      const result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
    });

    it('should refill tokens over time', async () => {
      const key = 'user:123';

      // Consume all tokens
      for (let i = 0; i < 15; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Should be rate limited
      let result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);

      // Wait for refill (100ms = 1 token at 10 req/sec)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should allow one more request
      result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
    });

    it('should track remaining tokens', async () => {
      const key = 'user:123';

      const result1 = await rateLimiter.checkLimit(key);
      expect(result1.remaining).toBe(14); // 15 - 1

      const result2 = await rateLimiter.checkLimit(key);
      expect(result2.remaining).toBe(13); // 14 - 1
    });
  });

  describe('Sliding Window Algorithm', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        algorithm: 'sliding-window',
        maxRequests: 5,
        windowMs: 1000, // 1 second
      });
    });

    it('should allow requests within window', async () => {
      const key = 'user:456';

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }

      // 6th request should be rejected
      const result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
    });

    it('should allow requests after window expires', async () => {
      const key = 'user:456';

      // Consume all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Should be rate limited
      let result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should allow requests again
      result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
    });

    it('should provide retry after time', async () => {
      const key = 'user:456';

      // Consume all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key);
      }

      const result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1000);
    });
  });

  describe('Fixed Window Algorithm', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        algorithm: 'fixed-window',
        maxRequests: 3,
        windowMs: 1000, // 1 second
      });
    });

    it('should allow requests within window', async () => {
      const key = 'user:789';

      // Should allow 3 requests
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }

      // 4th request should be rejected
      const result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
    });

    it('should reset window after expiration', async () => {
      const key = 'user:789';

      // Consume all requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Should be rate limited
      let result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should allow requests again
      for (let i = 0; i < 3; i++) {
        result = await rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('Leaky Bucket Algorithm', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        algorithm: 'leaky-bucket',
        maxRequests: 5,
        windowMs: 1000, // 1 second
      });
    });

    it('should allow requests up to bucket size', async () => {
      const key = 'user:abc';

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }

      // 6th request should be rejected
      const result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
    });

    it('should leak requests over time', async () => {
      const key = 'user:abc';

      // Fill the bucket
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Should be rate limited
      let result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);

      // Wait for leak (200ms = 1 request at 5 req/sec)
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should allow one more request
      result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Multiple Keys', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        algorithm: 'token-bucket',
        maxRequests: 5,
        windowMs: 1000,
      });
    });

    it('should track limits independently per key', async () => {
      const key1 = 'user:1';
      const key2 = 'user:2';

      // Consume all requests for key1
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key1);
      }

      // key1 should be rate limited
      let result = await rateLimiter.checkLimit(key1);
      expect(result.allowed).toBe(false);

      // key2 should still be allowed
      result = await rateLimiter.checkLimit(key2);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Reset and Clear', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        algorithm: 'token-bucket',
        maxRequests: 3,
        windowMs: 1000,
      });
    });

    it('should reset limit for specific key', async () => {
      const key = 'user:reset';

      // Consume all requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Should be rate limited
      let result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);

      // Reset the key
      rateLimiter.reset(key);

      // Should allow requests again
      result = await rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
    });

    it('should clear all limits', async () => {
      const key1 = 'user:1';
      const key2 = 'user:2';

      // Consume requests for both keys
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(key1);
        await rateLimiter.checkLimit(key2);
      }

      // Both should be rate limited
      expect((await rateLimiter.checkLimit(key1)).allowed).toBe(false);
      expect((await rateLimiter.checkLimit(key2)).allowed).toBe(false);

      // Clear all
      rateLimiter.clear();

      // Both should allow requests again
      expect((await rateLimiter.checkLimit(key1)).allowed).toBe(true);
      expect((await rateLimiter.checkLimit(key2)).allowed).toBe(true);
    });
  });
});

