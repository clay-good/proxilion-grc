/**
 * Provider Quota Manager
 * 
 * Manages rate limits and quotas across multiple AI providers:
 * - Track requests per minute/hour/day
 * - Enforce provider-specific rate limits
 * - Token usage tracking
 * - Quota exhaustion detection
 * - Automatic quota reset
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type Provider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'azure-openai';
export type QuotaWindow = 'minute' | 'hour' | 'day';

export interface ProviderQuota {
  provider: Provider;
  model?: string;              // Optional: per-model quotas
  
  // Request limits
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  
  // Token limits
  tokensPerMinute?: number;
  tokensPerHour?: number;
  tokensPerDay?: number;
  
  // Current usage
  currentRequests: {
    minute: number;
    hour: number;
    day: number;
  };
  currentTokens: {
    minute: number;
    hour: number;
    day: number;
  };
  
  // Reset timestamps
  resetAt: {
    minute: number;
    hour: number;
    day: number;
  };
  
  // Status
  exhausted: boolean;
  exhaustedUntil?: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;        // Seconds until quota resets
  remainingRequests?: {
    minute?: number;
    hour?: number;
    day?: number;
  };
  remainingTokens?: {
    minute?: number;
    hour?: number;
    day?: number;
  };
}

export class ProviderQuotaManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Quota tracking
  private quotas: Map<string, ProviderQuota> = new Map();
  
  // Cleanup interval
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    // Initialize default quotas
    this.initializeDefaultQuotas();
    
    // Start cleanup task
    this.startCleanup();
  }

  /**
   * Initialize default provider quotas
   */
  private initializeDefaultQuotas(): void {
    // OpenAI quotas (Tier 1)
    this.setQuota({
      provider: 'openai',
      requestsPerMinute: 500,
      requestsPerHour: 10000,
      requestsPerDay: 200000,
      tokensPerMinute: 150000,
      tokensPerHour: 3000000,
      tokensPerDay: 50000000,
      currentRequests: { minute: 0, hour: 0, day: 0 },
      currentTokens: { minute: 0, hour: 0, day: 0 },
      resetAt: {
        minute: Date.now() + 60000,
        hour: Date.now() + 3600000,
        day: Date.now() + 86400000,
      },
      exhausted: false,
    });

    // Anthropic quotas
    this.setQuota({
      provider: 'anthropic',
      requestsPerMinute: 50,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      tokensPerMinute: 100000,
      tokensPerHour: 2000000,
      tokensPerDay: 25000000,
      currentRequests: { minute: 0, hour: 0, day: 0 },
      currentTokens: { minute: 0, hour: 0, day: 0 },
      resetAt: {
        minute: Date.now() + 60000,
        hour: Date.now() + 3600000,
        day: Date.now() + 86400000,
      },
      exhausted: false,
    });

    // Google AI quotas
    this.setQuota({
      provider: 'google',
      requestsPerMinute: 60,
      requestsPerHour: 1500,
      requestsPerDay: 15000,
      tokensPerMinute: 120000,
      tokensPerHour: 2500000,
      tokensPerDay: 30000000,
      currentRequests: { minute: 0, hour: 0, day: 0 },
      currentTokens: { minute: 0, hour: 0, day: 0 },
      resetAt: {
        minute: Date.now() + 60000,
        hour: Date.now() + 3600000,
        day: Date.now() + 86400000,
      },
      exhausted: false,
    });

    // Cohere quotas
    this.setQuota({
      provider: 'cohere',
      requestsPerMinute: 100,
      requestsPerHour: 2000,
      requestsPerDay: 20000,
      tokensPerMinute: 100000,
      tokensPerHour: 2000000,
      tokensPerDay: 20000000,
      currentRequests: { minute: 0, hour: 0, day: 0 },
      currentTokens: { minute: 0, hour: 0, day: 0 },
      resetAt: {
        minute: Date.now() + 60000,
        hour: Date.now() + 3600000,
        day: Date.now() + 86400000,
      },
      exhausted: false,
    });
  }

  /**
   * Set quota for provider
   */
  setQuota(quota: ProviderQuota): void {
    const key = quota.model ? `${quota.provider}:${quota.model}` : quota.provider;
    this.quotas.set(key, quota);
  }

  /**
   * Check if request is allowed
   */
  checkQuota(
    provider: Provider,
    model?: string,
    estimatedTokens?: number
  ): QuotaCheckResult {
    const key = model ? `${provider}:${model}` : provider;
    const quota = this.quotas.get(key);

    if (!quota) {
      // No quota configured, allow
      return { allowed: true };
    }

    // Check if exhausted
    if (quota.exhausted && quota.exhaustedUntil) {
      if (Date.now() < quota.exhaustedUntil) {
        const retryAfter = Math.ceil((quota.exhaustedUntil - Date.now()) / 1000);
        
        this.metrics.increment('quota_manager_quota_exhausted_total', 1, {
          provider,
          model: model || 'all',
        });
        
        return {
          allowed: false,
          reason: 'Quota exhausted',
          retryAfter,
        };
      } else {
        // Quota should have reset
        quota.exhausted = false;
        quota.exhaustedUntil = undefined;
      }
    }

    // Reset counters if needed
    this.resetIfNeeded(quota);

    // Check request limits
    if (quota.requestsPerMinute && quota.currentRequests.minute >= quota.requestsPerMinute) {
      const retryAfter = Math.ceil((quota.resetAt.minute - Date.now()) / 1000);
      return {
        allowed: false,
        reason: 'Requests per minute limit exceeded',
        retryAfter,
      };
    }

    if (quota.requestsPerHour && quota.currentRequests.hour >= quota.requestsPerHour) {
      const retryAfter = Math.ceil((quota.resetAt.hour - Date.now()) / 1000);
      return {
        allowed: false,
        reason: 'Requests per hour limit exceeded',
        retryAfter,
      };
    }

    if (quota.requestsPerDay && quota.currentRequests.day >= quota.requestsPerDay) {
      const retryAfter = Math.ceil((quota.resetAt.day - Date.now()) / 1000);
      return {
        allowed: false,
        reason: 'Requests per day limit exceeded',
        retryAfter,
      };
    }

    // Check token limits if provided
    if (estimatedTokens) {
      if (quota.tokensPerMinute && quota.currentTokens.minute + estimatedTokens > quota.tokensPerMinute) {
        const retryAfter = Math.ceil((quota.resetAt.minute - Date.now()) / 1000);
        return {
          allowed: false,
          reason: 'Tokens per minute limit exceeded',
          retryAfter,
        };
      }

      if (quota.tokensPerHour && quota.currentTokens.hour + estimatedTokens > quota.tokensPerHour) {
        const retryAfter = Math.ceil((quota.resetAt.hour - Date.now()) / 1000);
        return {
          allowed: false,
          reason: 'Tokens per hour limit exceeded',
          retryAfter,
        };
      }

      if (quota.tokensPerDay && quota.currentTokens.day + estimatedTokens > quota.tokensPerDay) {
        const retryAfter = Math.ceil((quota.resetAt.day - Date.now()) / 1000);
        return {
          allowed: false,
          reason: 'Tokens per day limit exceeded',
          retryAfter,
        };
      }
    }

    // Calculate remaining
    const remainingRequests = {
      minute: quota.requestsPerMinute ? quota.requestsPerMinute - quota.currentRequests.minute : undefined,
      hour: quota.requestsPerHour ? quota.requestsPerHour - quota.currentRequests.hour : undefined,
      day: quota.requestsPerDay ? quota.requestsPerDay - quota.currentRequests.day : undefined,
    };

    const remainingTokens = {
      minute: quota.tokensPerMinute ? quota.tokensPerMinute - quota.currentTokens.minute : undefined,
      hour: quota.tokensPerHour ? quota.tokensPerHour - quota.currentTokens.hour : undefined,
      day: quota.tokensPerDay ? quota.tokensPerDay - quota.currentTokens.day : undefined,
    };

    return {
      allowed: true,
      remainingRequests,
      remainingTokens,
    };
  }

  /**
   * Record request usage
   */
  recordUsage(provider: Provider, model?: string, tokens?: number): void {
    const key = model ? `${provider}:${model}` : provider;
    const quota = this.quotas.get(key);

    if (!quota) {
      return;
    }

    // Reset if needed
    this.resetIfNeeded(quota);

    // Increment request counters
    quota.currentRequests.minute++;
    quota.currentRequests.hour++;
    quota.currentRequests.day++;

    // Increment token counters
    if (tokens) {
      quota.currentTokens.minute += tokens;
      quota.currentTokens.hour += tokens;
      quota.currentTokens.day += tokens;
    }

    this.metrics.increment('quota_manager_requests_total', 1, {
      provider,
      model: model || 'all',
    });

    if (tokens) {
      this.metrics.histogram('quota_manager_tokens_used', tokens, {
        provider,
        model: model || 'all',
      });
    }
  }

  /**
   * Mark quota as exhausted
   */
  markExhausted(provider: Provider, model?: string, exhaustedUntil?: number): void {
    const key = model ? `${provider}:${model}` : provider;
    const quota = this.quotas.get(key);

    if (quota) {
      quota.exhausted = true;
      quota.exhaustedUntil = exhaustedUntil || Date.now() + 3600000; // Default 1 hour
      
      this.logger.warn('Provider quota exhausted', {
        provider,
        model,
        exhaustedUntil: new Date(quota.exhaustedUntil).toISOString(),
      });

      this.metrics.increment('quota_manager_exhausted_total', 1, {
        provider,
        model: model || 'all',
      });
    }
  }

  /**
   * Reset counters if time window has passed
   */
  private resetIfNeeded(quota: ProviderQuota): void {
    const now = Date.now();

    // Reset minute counter
    if (now >= quota.resetAt.minute) {
      quota.currentRequests.minute = 0;
      quota.currentTokens.minute = 0;
      quota.resetAt.minute = now + 60000;
    }

    // Reset hour counter
    if (now >= quota.resetAt.hour) {
      quota.currentRequests.hour = 0;
      quota.currentTokens.hour = 0;
      quota.resetAt.hour = now + 3600000;
    }

    // Reset day counter
    if (now >= quota.resetAt.day) {
      quota.currentRequests.day = 0;
      quota.currentTokens.day = 0;
      quota.resetAt.day = now + 86400000;
    }
  }

  /**
   * Get quota status
   */
  getQuotaStatus(provider: Provider, model?: string): ProviderQuota | undefined {
    const key = model ? `${provider}:${model}` : provider;
    return this.quotas.get(key);
  }

  /**
   * Get all quotas
   */
  getAllQuotas(): ProviderQuota[] {
    return Array.from(this.quotas.values());
  }

  /**
   * Start cleanup task
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      for (const quota of this.quotas.values()) {
        this.resetIfNeeded(quota);
      }
    }, 60000); // Check every minute
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

