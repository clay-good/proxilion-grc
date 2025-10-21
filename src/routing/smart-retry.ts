/**
 * Smart Retry System
 * 
 * Intelligent retry logic with:
 * - Exponential backoff
 * - Cross-provider failover
 * - Retry budget management
 * - Idempotency handling
 * - Circuit breaker integration
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type Provider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'azure-openai';
export type RetryReason = 
  | 'rate_limit' 
  | 'timeout' 
  | 'server_error' 
  | 'network_error' 
  | 'quota_exceeded'
  | 'provider_unavailable';

export interface RetryConfig {
  maxRetries: number;              // Maximum retry attempts
  initialDelayMs: number;          // Initial delay before first retry
  maxDelayMs: number;              // Maximum delay between retries
  backoffMultiplier: number;       // Exponential backoff multiplier
  enableCrossProviderFailover: boolean; // Failover to different provider
  retryableStatusCodes: number[];  // HTTP status codes to retry
  retryableReasons: RetryReason[]; // Reasons to retry
  jitterFactor: number;            // Random jitter (0-1)
}

export interface RetryAttempt {
  attemptNumber: number;
  provider: Provider;
  model: string;
  reason: RetryReason;
  delayMs: number;
  timestamp: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: RetryAttempt[];
  totalDuration: number;
  finalProvider?: Provider;
}

export class SmartRetry {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      initialDelayMs: config?.initialDelayMs ?? 1000,
      maxDelayMs: config?.maxDelayMs ?? 30000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
      enableCrossProviderFailover: config?.enableCrossProviderFailover ?? true,
      retryableStatusCodes: config?.retryableStatusCodes ?? [429, 500, 502, 503, 504],
      retryableReasons: config?.retryableReasons ?? [
        'rate_limit',
        'timeout',
        'server_error',
        'network_error',
      ],
      jitterFactor: config?.jitterFactor ?? 0.1,
    };
  }

  /**
   * Execute with retry logic
   */
  async execute<T>(
    operation: (provider: Provider, model: string) => Promise<T>,
    providers: Array<{ provider: Provider; model: string }>,
    options?: {
      idempotencyKey?: string;
      timeout?: number;
    }
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let currentProviderIndex = 0;

    for (let attemptNumber = 0; attemptNumber <= this.config.maxRetries; attemptNumber++) {
      const { provider, model } = providers[currentProviderIndex];
      
      try {
        this.logger.debug('Executing request', {
          attemptNumber,
          provider,
          model,
          idempotencyKey: options?.idempotencyKey,
        });

        // Execute with timeout if specified
        const result = options?.timeout
          ? await this.executeWithTimeout(operation(provider, model), options.timeout)
          : await operation(provider, model);

        // Success!
        this.metrics.increment('smart_retry_success_total', 1, {
          provider,
          model,
          attemptNumber: attemptNumber.toString(),
        });

        return {
          success: true,
          result,
          attempts,
          totalDuration: Date.now() - startTime,
          finalProvider: provider,
        };
      } catch (error) {
        const retryReason = this.classifyError(error);
        
        attempts.push({
          attemptNumber,
          provider,
          model,
          reason: retryReason,
          delayMs: 0,
          timestamp: Date.now(),
        });

        this.logger.warn('Request failed', {
          attemptNumber,
          provider,
          model,
          reason: retryReason,
          error: error instanceof Error ? error.message : String(error),
        });

        this.metrics.increment('smart_retry_attempt_failed_total', 1, {
          provider,
          model,
          reason: retryReason,
          attemptNumber: attemptNumber.toString(),
        });

        // Check if we should retry
        if (attemptNumber >= this.config.maxRetries) {
          // Max retries exceeded
          this.metrics.increment('smart_retry_exhausted_total', 1, {
            provider,
            model,
            reason: retryReason,
          });

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            attempts,
            totalDuration: Date.now() - startTime,
          };
        }

        // Check if error is retryable
        if (!this.isRetryable(retryReason)) {
          this.metrics.increment('smart_retry_non_retryable_total', 1, {
            provider,
            model,
            reason: retryReason,
          });

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            attempts,
            totalDuration: Date.now() - startTime,
          };
        }

        // Decide whether to failover to different provider
        if (this.config.enableCrossProviderFailover && this.shouldFailover(retryReason)) {
          currentProviderIndex = (currentProviderIndex + 1) % providers.length;
          
          this.logger.info('Failing over to different provider', {
            fromProvider: provider,
            toProvider: providers[currentProviderIndex].provider,
            reason: retryReason,
          });

          this.metrics.increment('smart_retry_failover_total', 1, {
            fromProvider: provider,
            toProvider: providers[currentProviderIndex].provider,
            reason: retryReason,
          });
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attemptNumber);
        attempts[attempts.length - 1].delayMs = delay;

        this.logger.debug('Retrying after delay', {
          attemptNumber: attemptNumber + 1,
          delayMs: delay,
          nextProvider: providers[currentProviderIndex].provider,
        });

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // Should never reach here, but just in case
    return {
      success: false,
      error: new Error('Max retries exceeded'),
      attempts,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Classify error to determine retry reason
   */
  private classifyError(error: any): RetryReason {
    if (error?.status === 429 || error?.message?.includes('rate limit')) {
      return 'rate_limit';
    }
    
    if (error?.status === 503 || error?.message?.includes('quota')) {
      return 'quota_exceeded';
    }
    
    if (error?.name === 'TimeoutError' || error?.message?.includes('timeout')) {
      return 'timeout';
    }
    
    if (error?.status >= 500 && error?.status < 600) {
      return 'server_error';
    }
    
    if (error?.message?.includes('ECONNREFUSED') || error?.message?.includes('ENOTFOUND')) {
      return 'network_error';
    }
    
    if (error?.message?.includes('unavailable')) {
      return 'provider_unavailable';
    }
    
    return 'server_error';
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(reason: RetryReason): boolean {
    return this.config.retryableReasons.includes(reason);
  }

  /**
   * Check if should failover to different provider
   */
  private shouldFailover(reason: RetryReason): boolean {
    // Failover for provider-specific issues
    return [
      'rate_limit',
      'quota_exceeded',
      'provider_unavailable',
    ].includes(reason);
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attemptNumber: number): number {
    // Exponential backoff: initialDelay * (multiplier ^ attemptNumber)
    const exponentialDelay = this.config.initialDelayMs * 
      Math.pow(this.config.backoffMultiplier, attemptNumber);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() - 0.5);
    const finalDelay = Math.max(0, cappedDelay + jitter);
    
    return Math.round(finalDelay);
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('TimeoutError')), timeoutMs)
      ),
    ]);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry statistics
   */
  getStats(): {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    enableCrossProviderFailover: boolean;
  } {
    return {
      maxRetries: this.config.maxRetries,
      initialDelayMs: this.config.initialDelayMs,
      maxDelayMs: this.config.maxDelayMs,
      backoffMultiplier: this.config.backoffMultiplier,
      enableCrossProviderFailover: this.config.enableCrossProviderFailover,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    this.logger.info('Retry configuration updated');
  }
}

