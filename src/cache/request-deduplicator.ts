/**
 * Request Deduplicator
 * 
 * Prevents duplicate concurrent requests to AI services by:
 * - Detecting identical in-flight requests
 * - Sharing responses across waiting requests
 * - Reducing load on AI services
 * - Improving response times
 */

import { UnifiedAIRequest, ProxilionResponse } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

interface PendingRequest {
  key: string;
  promise: Promise<ProxilionResponse>;
  resolvers: Array<(value: ProxilionResponse) => void>;
  rejectors: Array<(error: Error) => void>;
  timestamp: number;
  requestCount: number;
}

export class RequestDeduplicator {
  private pending: Map<string, PendingRequest>;
  private logger: Logger;
  private metrics: MetricsCollector;
  private timeout: number;

  constructor(timeout: number = 30000) {
    this.pending = new Map();
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.timeout = timeout;
  }

  /**
   * Generate deduplication key from request
   */
  private generateKey(request: UnifiedAIRequest): string {
    // Create deterministic key from request parameters
    const keyData = {
      provider: request.provider,
      model: request.model,
      messages: request.messages,
      parameters: {
        temperature: request.parameters.temperature,
        maxTokens: request.parameters.maxTokens,
        topP: request.parameters.topP,
        topK: request.parameters.topK,
      },
      tools: request.tools,
    };

    // Simple hash function
    const str = JSON.stringify(keyData);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return `dedup:${request.provider}:${request.model}:${hash.toString(36)}`;
  }

  /**
   * Check if request should be deduplicated
   */
  private shouldDeduplicate(request: UnifiedAIRequest): boolean {
    // Don't deduplicate streaming requests
    if (request.streaming) {
      return false;
    }

    // Don't deduplicate requests with high temperature (non-deterministic)
    if (request.parameters.temperature && request.parameters.temperature > 0.3) {
      return false;
    }

    // Don't deduplicate if explicitly disabled
    if (request.metadata.deduplicationDisabled) {
      return false;
    }

    return true;
  }

  /**
   * Execute request with deduplication
   */
  async execute(
    request: UnifiedAIRequest,
    executor: () => Promise<ProxilionResponse>
  ): Promise<ProxilionResponse> {
    if (!this.shouldDeduplicate(request)) {
      // Execute directly without deduplication
      return await executor();
    }

    const key = this.generateKey(request);
    const existing = this.pending.get(key);

    if (existing) {
      // Request is already in flight, wait for it
      this.logger.debug('Request deduplicated', { key, waitingRequests: existing.requestCount });
      this.metrics.increment('request_deduplicated_total');

      existing.requestCount++;

      // Create a new promise that will be resolved when the original completes
      return new Promise<ProxilionResponse>((resolve, reject) => {
        existing.resolvers.push(resolve);
        existing.rejectors.push(reject);

        // Set timeout
        setTimeout(() => {
          reject(new Error('Deduplication timeout'));
        }, this.timeout);
      });
    }

    // This is the first request with this key, execute it
    const resolvers: Array<(value: ProxilionResponse) => void> = [];
    const rejectors: Array<(error: Error) => void> = [];

    const promise = this.executeWithCleanup(key, executor, resolvers, rejectors);

    const pendingRequest: PendingRequest = {
      key,
      promise,
      resolvers,
      rejectors,
      timestamp: Date.now(),
      requestCount: 1,
    };

    this.pending.set(key, pendingRequest);
    this.metrics.gauge('pending_deduplicated_requests', this.pending.size);

    return promise;
  }

  /**
   * Execute request and cleanup
   */
  private async executeWithCleanup(
    key: string,
    executor: () => Promise<ProxilionResponse>,
    resolvers: Array<(value: ProxilionResponse) => void>,
    rejectors: Array<(error: Error) => void>
  ): Promise<ProxilionResponse> {
    try {
      const startTime = Date.now();
      const response = await executor();
      const duration = Date.now() - startTime;

      // Resolve all waiting requests
      for (const resolve of resolvers) {
        resolve(response);
      }

      const pendingRequest = this.pending.get(key);
      if (pendingRequest) {
        this.logger.info('Request completed, resolved waiting requests', {
          key,
          waitingRequests: pendingRequest.requestCount - 1,
          duration,
        });

        this.metrics.histogram('deduplicated_request_duration_ms', duration);
        this.metrics.increment('deduplicated_request_saved_total', pendingRequest.requestCount - 1);
      }

      // Cleanup
      this.pending.delete(key);
      this.metrics.gauge('pending_deduplicated_requests', this.pending.size);

      return response;
    } catch (error) {
      // Reject all waiting requests
      const err = error instanceof Error ? error : new Error(String(error));

      for (const reject of rejectors) {
        reject(err);
      }

      this.logger.error('Request failed, rejected waiting requests', err instanceof Error ? err : undefined, {
        key,
      });

      // Cleanup
      this.pending.delete(key);
      this.metrics.gauge('pending_deduplicated_requests', this.pending.size);

      throw error;
    }
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    // Reject all pending requests
    for (const [key, pending] of this.pending.entries()) {
      const error = new Error('Deduplicator cleared');
      for (const reject of pending.rejectors) {
        reject(error);
      }
    }

    this.pending.clear();
    this.metrics.gauge('pending_deduplicated_requests', 0);
    this.logger.info('Deduplicator cleared');
  }

  /**
   * Cleanup expired pending requests
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, pending] of this.pending.entries()) {
      if (now - pending.timestamp > this.timeout) {
        const error = new Error('Deduplication timeout');
        for (const reject of pending.rejectors) {
          reject(error);
        }
        this.pending.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.warn('Cleaned up expired pending requests', { removed });
      this.metrics.gauge('pending_deduplicated_requests', this.pending.size);
    }
  }
}

