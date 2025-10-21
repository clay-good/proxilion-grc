/**
 * Rate Limiter
 * 
 * Implements multiple rate limiting algorithms:
 * - Token Bucket (smooth rate limiting)
 * - Sliding Window (precise rate limiting)
 * - Fixed Window (simple rate limiting)
 * - Leaky Bucket (queue-based rate limiting)
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type RateLimitAlgorithm = 'token-bucket' | 'sliding-window' | 'fixed-window' | 'leaky-bucket';

export interface RateLimitConfig {
  algorithm: RateLimitAlgorithm;
  maxRequests: number; // Maximum requests per window
  windowMs: number; // Time window in milliseconds
  burstSize?: number; // Maximum burst size (for token bucket)
}

export interface UserQuota {
  userId: string;
  maxRequests: number;
  windowMs: number;
  burstSize?: number;
}

export interface TenantQuota {
  tenantId: string;
  maxRequests: number;
  windowMs: number;
  burstSize?: number;
  userQuotas?: Map<string, UserQuota>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  quotaType?: 'global' | 'tenant' | 'user';
}

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

interface SlidingWindowState {
  requests: number[];
}

interface FixedWindowState {
  count: number;
  windowStart: number;
}

interface LeakyBucketState {
  queue: number[];
  lastLeak: number;
}

type RateLimitState = TokenBucketState | SlidingWindowState | FixedWindowState | LeakyBucketState;

export class RateLimiter {
  private config: RateLimitConfig;
  private state: Map<string, RateLimitState>;
  private logger: Logger;
  private metrics: MetricsCollector;
  private tenantQuotas: Map<string, TenantQuota> = new Map();
  private userQuotas: Map<string, UserQuota> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      burstSize: config.burstSize || config.maxRequests,
    };
    this.state = new Map();
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(key: string): Promise<RateLimitResult> {
    switch (this.config.algorithm) {
      case 'token-bucket':
        return this.checkTokenBucket(key);
      case 'sliding-window':
        return this.checkSlidingWindow(key);
      case 'fixed-window':
        return this.checkFixedWindow(key);
      case 'leaky-bucket':
        return this.checkLeakyBucket(key);
      default:
        throw new Error(`Unknown rate limit algorithm: ${this.config.algorithm}`);
    }
  }

  /**
   * Token Bucket Algorithm
   * Allows bursts while maintaining average rate
   */
  private checkTokenBucket(key: string): RateLimitResult {
    const now = Date.now();
    let state = this.state.get(key) as TokenBucketState | undefined;

    if (!state) {
      state = {
        tokens: this.config.burstSize!,
        lastRefill: now,
      };
      this.state.set(key, state);
    }

    // Refill tokens based on time elapsed
    const elapsed = now - state.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    state.tokens = Math.min(this.config.burstSize!, state.tokens + tokensToAdd);
    state.lastRefill = now;

    // Check if we have tokens available
    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.metrics.increment('rate_limit_allowed_total');

      return {
        allowed: true,
        remaining: Math.floor(state.tokens),
        resetAt: now + (this.config.burstSize! - state.tokens) / refillRate,
      };
    }

    // Rate limited
    this.metrics.increment('rate_limit_rejected_total');
    const retryAfter = Math.ceil((1 - state.tokens) / refillRate);

    this.logger.warn('Rate limit exceeded (token bucket)', {
      key,
      tokens: state.tokens,
      retryAfter,
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + retryAfter,
      retryAfter,
    };
  }

  /**
   * Sliding Window Algorithm
   * Precise rate limiting with sliding time window
   */
  private checkSlidingWindow(key: string): RateLimitResult {
    const now = Date.now();
    let state = this.state.get(key) as SlidingWindowState | undefined;

    if (!state) {
      state = { requests: [] };
      this.state.set(key, state);
    }

    // Remove requests outside the window
    const windowStart = now - this.config.windowMs;
    state.requests = state.requests.filter((timestamp) => timestamp > windowStart);

    // Check if we can allow this request
    if (state.requests.length < this.config.maxRequests) {
      state.requests.push(now);
      this.metrics.increment('rate_limit_allowed_total');

      return {
        allowed: true,
        remaining: this.config.maxRequests - state.requests.length,
        resetAt: state.requests[0] + this.config.windowMs,
      };
    }

    // Rate limited
    this.metrics.increment('rate_limit_rejected_total');
    const oldestRequest = state.requests[0];
    const retryAfter = oldestRequest + this.config.windowMs - now;

    this.logger.warn('Rate limit exceeded (sliding window)', {
      key,
      requests: state.requests.length,
      retryAfter,
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestRequest + this.config.windowMs,
      retryAfter,
    };
  }

  /**
   * Fixed Window Algorithm
   * Simple rate limiting with fixed time windows
   */
  private checkFixedWindow(key: string): RateLimitResult {
    const now = Date.now();
    let state = this.state.get(key) as FixedWindowState | undefined;

    if (!state) {
      state = {
        count: 0,
        windowStart: now,
      };
      this.state.set(key, state);
    }

    // Check if we're in a new window
    if (now - state.windowStart >= this.config.windowMs) {
      state.count = 0;
      state.windowStart = now;
    }

    // Check if we can allow this request
    if (state.count < this.config.maxRequests) {
      state.count++;
      this.metrics.increment('rate_limit_allowed_total');

      return {
        allowed: true,
        remaining: this.config.maxRequests - state.count,
        resetAt: state.windowStart + this.config.windowMs,
      };
    }

    // Rate limited
    this.metrics.increment('rate_limit_rejected_total');
    const retryAfter = state.windowStart + this.config.windowMs - now;

    this.logger.warn('Rate limit exceeded (fixed window)', {
      key,
      count: state.count,
      retryAfter,
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt: state.windowStart + this.config.windowMs,
      retryAfter,
    };
  }

  /**
   * Leaky Bucket Algorithm
   * Queue-based rate limiting with constant output rate
   */
  private checkLeakyBucket(key: string): RateLimitResult {
    const now = Date.now();
    let state = this.state.get(key) as LeakyBucketState | undefined;

    if (!state) {
      state = {
        queue: [],
        lastLeak: now,
      };
      this.state.set(key, state);
    }

    // Leak requests based on time elapsed
    const elapsed = now - state.lastLeak;
    const leakRate = this.config.maxRequests / this.config.windowMs;
    const requestsToLeak = Math.floor(elapsed * leakRate);

    if (requestsToLeak > 0) {
      state.queue.splice(0, requestsToLeak);
      state.lastLeak = now;
    }

    // Check if we can add to the queue
    if (state.queue.length < this.config.maxRequests) {
      state.queue.push(now);
      this.metrics.increment('rate_limit_allowed_total');

      return {
        allowed: true,
        remaining: this.config.maxRequests - state.queue.length,
        resetAt: now + (state.queue.length / leakRate),
      };
    }

    // Rate limited
    this.metrics.increment('rate_limit_rejected_total');
    const retryAfter = Math.ceil(1 / leakRate);

    this.logger.warn('Rate limit exceeded (leaky bucket)', {
      key,
      queueSize: state.queue.length,
      retryAfter,
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + retryAfter,
      retryAfter,
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.state.delete(key);
    this.logger.debug('Rate limit reset', { key });
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.state.clear();
    this.logger.info('All rate limits cleared');
  }

  /**
   * Get current state for a key
   */
  getState(key: string): RateLimitState | undefined {
    return this.state.get(key);
  }

  /**
   * Cleanup old state entries
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, state] of this.state.entries()) {
      let shouldRemove = false;

      if ('windowStart' in state) {
        // Fixed window
        shouldRemove = now - state.windowStart > this.config.windowMs * 2;
      } else if ('lastRefill' in state) {
        // Token bucket
        shouldRemove = now - state.lastRefill > this.config.windowMs * 2;
      } else if ('lastLeak' in state) {
        // Leaky bucket
        shouldRemove = now - state.lastLeak > this.config.windowMs * 2 && state.queue.length === 0;
      } else if ('requests' in state) {
        // Sliding window
        shouldRemove = state.requests.length === 0;
      }

      if (shouldRemove) {
        this.state.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Rate limiter cleanup', { removed });
    }
  }

  /**
   * Set tenant quota
   */
  setTenantQuota(quota: TenantQuota): void {
    this.tenantQuotas.set(quota.tenantId, quota);
    this.logger.info('Tenant quota set', {
      tenantId: quota.tenantId,
      maxRequests: quota.maxRequests,
      windowMs: quota.windowMs,
    });
  }

  /**
   * Set user quota
   */
  setUserQuota(quota: UserQuota): void {
    this.userQuotas.set(quota.userId, quota);
    this.logger.info('User quota set', {
      userId: quota.userId,
      maxRequests: quota.maxRequests,
      windowMs: quota.windowMs,
    });
  }

  /**
   * Check limit with user/tenant context
   */
  async checkLimitWithContext(
    key: string,
    context: { userId?: string; tenantId?: string }
  ): Promise<RateLimitResult> {
    // Check user quota first (most specific)
    if (context.userId) {
      const userQuota = this.userQuotas.get(context.userId);
      if (userQuota) {
        const userKey = `user:${context.userId}:${key}`;
        const userConfig = {
          ...this.config,
          maxRequests: userQuota.maxRequests,
          windowMs: userQuota.windowMs,
          burstSize: userQuota.burstSize || userQuota.maxRequests,
        };
        const result = await this.checkLimitWithConfig(userKey, userConfig);
        if (!result.allowed) {
          return { ...result, quotaType: 'user' };
        }
      }
    }

    // Check tenant quota (less specific)
    if (context.tenantId) {
      const tenantQuota = this.tenantQuotas.get(context.tenantId);
      if (tenantQuota) {
        const tenantKey = `tenant:${context.tenantId}:${key}`;
        const tenantConfig = {
          ...this.config,
          maxRequests: tenantQuota.maxRequests,
          windowMs: tenantQuota.windowMs,
          burstSize: tenantQuota.burstSize || tenantQuota.maxRequests,
        };
        const result = await this.checkLimitWithConfig(tenantKey, tenantConfig);
        if (!result.allowed) {
          return { ...result, quotaType: 'tenant' };
        }
      }
    }

    // Check global limit
    const result = await this.checkLimit(key);
    return { ...result, quotaType: 'global' };
  }

  /**
   * Check limit with custom config
   */
  private async checkLimitWithConfig(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const originalConfig = this.config;
    this.config = config;
    const result = await this.checkLimit(key);
    this.config = originalConfig;
    return result;
  }

  /**
   * Get quota usage for user
   */
  getUserQuotaUsage(userId: string): {
    quota?: UserQuota;
    used: number;
    remaining: number;
    resetAt: number;
  } {
    const quota = this.userQuotas.get(userId);
    if (!quota) {
      return { used: 0, remaining: 0, resetAt: 0 };
    }

    const key = `user:${userId}`;
    const state = this.state.get(key);

    if (!state) {
      return {
        quota,
        used: 0,
        remaining: quota.maxRequests,
        resetAt: Date.now() + quota.windowMs,
      };
    }

    let used = 0;
    let resetAt = Date.now() + quota.windowMs;

    if ('tokens' in state) {
      used = (quota.burstSize || quota.maxRequests) - state.tokens;
      resetAt = state.lastRefill + quota.windowMs;
    } else if ('count' in state) {
      used = state.count;
      resetAt = state.windowStart + quota.windowMs;
    } else if ('requests' in state) {
      used = state.requests.length;
    }

    return {
      quota,
      used,
      remaining: Math.max(0, quota.maxRequests - used),
      resetAt,
    };
  }

  /**
   * Get quota usage for tenant
   */
  getTenantQuotaUsage(tenantId: string): {
    quota?: TenantQuota;
    used: number;
    remaining: number;
    resetAt: number;
  } {
    const quota = this.tenantQuotas.get(tenantId);
    if (!quota) {
      return { used: 0, remaining: 0, resetAt: 0 };
    }

    const key = `tenant:${tenantId}`;
    const state = this.state.get(key);

    if (!state) {
      return {
        quota,
        used: 0,
        remaining: quota.maxRequests,
        resetAt: Date.now() + quota.windowMs,
      };
    }

    let used = 0;
    let resetAt = Date.now() + quota.windowMs;

    if ('tokens' in state) {
      used = (quota.burstSize || quota.maxRequests) - state.tokens;
      resetAt = state.lastRefill + quota.windowMs;
    } else if ('count' in state) {
      used = state.count;
      resetAt = state.windowStart + quota.windowMs;
    } else if ('requests' in state) {
      used = state.requests.length;
    }

    return {
      quota,
      used,
      remaining: Math.max(0, quota.maxRequests - used),
      resetAt,
    };
  }
}

