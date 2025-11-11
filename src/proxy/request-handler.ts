/**
 * Core request handling and proxying logic
 */

import { ProxilionRequest, ProxilionResponse, ProxilionError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { ConnectionPool } from './connection-pool.js';

export interface RequestHandlerConfig {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export class RequestHandler {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private circuitBreakerAccessTimes: Map<string, number> = new Map();
  private connectionPool: ConnectionPool;
  private static readonly MAX_CIRCUIT_BREAKERS = 1000;
  private static readonly CIRCUIT_BREAKER_IDLE_TIMEOUT = 3600000; // 1 hour
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: RequestHandlerConfig,
    connectionPool: ConnectionPool
  ) {
    this.connectionPool = connectionPool;
    this.startCleanup();
  }

  async handleRequest(request: ProxilionRequest): Promise<ProxilionResponse> {
    const startTime = Date.now();
    const correlationId = request.id;

    logger.setCorrelationId(correlationId);
    logger.info('Handling request', {
      method: request.method,
      url: request.url,
      correlationId,
    });

    try {
      const url = new URL(request.url);
      const host = url.hostname;

      // Get or create circuit breaker for this host
      const breaker = this.getCircuitBreaker(host);

      // Execute request through circuit breaker
      const response = await breaker.execute(async () => {
        return await this.executeRequest(request, host);
      });

      const duration = Date.now() - startTime;
      metrics.histogram('request.duration', duration, { host, status: String(response.status) });
      metrics.counter('request.success', 1, { host });

      logger.info('Request completed successfully', {
        correlationId,
        duration,
        status: response.status,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.histogram('request.duration', duration, { status: 'error' });
      metrics.counter('request.error', 1);

      logger.error('Request failed', error as Error, {
        correlationId,
        duration,
      });

      throw error;
    }
  }

  private async executeRequest(
    request: ProxilionRequest,
    host: string
  ): Promise<ProxilionResponse> {
    const connection = await this.connectionPool.acquire(host);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const fetchOptions: RequestInit = {
        method: request.method,
        headers: this.prepareHeaders(request.headers),
        signal: controller.signal,
      };

      // Add body for methods that support it
      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        fetchOptions.body = JSON.stringify(request.body);
      }

      const response = await fetch(request.url, fetchOptions);
      clearTimeout(timeoutId);

      // Handle streaming responses
      const isStreaming = this.isStreamingResponse(response);

      let body: unknown;
      if (isStreaming) {
        // For streaming, we'll pass through the ReadableStream
        body = response.body;
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await response.json();
        } else {
          body = await response.text();
        }
      }

      return {
        status: response.status,
        headers: this.extractHeaders(response.headers),
        body,
        streaming: isStreaming,
      };
    } finally {
      this.connectionPool.release(connection);
    }
  }

  private getCircuitBreaker(host: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(host);
    if (!breaker) {
      // Check if we need to evict LRU circuit breaker
      if (this.circuitBreakers.size >= RequestHandler.MAX_CIRCUIT_BREAKERS) {
        this.evictLRUCircuitBreaker();
      }

      breaker = new CircuitBreaker(host, {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        monitoringPeriod: 10000,
      });
      this.circuitBreakers.set(host, breaker);
    }

    // Update access time for LRU tracking
    this.circuitBreakerAccessTimes.set(host, Date.now());

    return breaker;
  }

  /**
   * Evict least recently used circuit breaker
   */
  private evictLRUCircuitBreaker(): void {
    let oldestHost: string | null = null;
    let oldestTime = Date.now();

    for (const [host, time] of this.circuitBreakerAccessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestHost = host;
      }
    }

    if (oldestHost) {
      this.circuitBreakers.delete(oldestHost);
      this.circuitBreakerAccessTimes.delete(oldestHost);
      logger.debug('Evicted LRU circuit breaker', { host: oldestHost });
      metrics.counter('circuit_breaker.evicted', 1);
    }
  }

  /**
   * Start periodic cleanup of idle circuit breakers
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleCircuitBreakers();
    }, 300000); // Run every 5 minutes
  }

  /**
   * Remove idle circuit breakers
   */
  private cleanupIdleCircuitBreakers(): void {
    const now = Date.now();
    let removed = 0;

    for (const [host, lastAccess] of this.circuitBreakerAccessTimes.entries()) {
      if (now - lastAccess > RequestHandler.CIRCUIT_BREAKER_IDLE_TIMEOUT) {
        this.circuitBreakers.delete(host);
        this.circuitBreakerAccessTimes.delete(host);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up idle circuit breakers', { removed });
      metrics.counter('circuit_breaker.cleanup', 1, { count: removed.toString() });
    }
  }

  /**
   * Stop request handler and cleanup resources
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.circuitBreakers.clear();
    this.circuitBreakerAccessTimes.clear();
    logger.info('Request handler stopped');
  }

  private prepareHeaders(headers: Record<string, string>): HeadersInit {
    // Only copy if we need to modify (optimize for common case)
    const hasUserAgent = 'user-agent' in headers;
    const hasProxiedBy = 'x-proxied-by' in headers;

    // If both headers exist, return as-is (no modification needed)
    if (hasUserAgent && hasProxiedBy) {
      return headers;
    }

    // Only create new object if modification needed
    return {
      ...headers,
      'user-agent': headers['user-agent'] || 'Proxilion/0.1.0',
      'x-proxied-by': 'Proxilion',
    };
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    // Use Object.fromEntries for better performance (2-3x faster)
    return Object.fromEntries(headers.entries());
  }

  private isStreamingResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type') || '';
    return (
      contentType.includes('text/event-stream') ||
      contentType.includes('application/stream+json') ||
      response.headers.get('transfer-encoding') === 'chunked'
    );
  }

  getCircuitBreakerStats() {
    const stats: Record<string, unknown> = {};
    for (const [host, breaker] of this.circuitBreakers.entries()) {
      stats[host] = breaker.getStats();
    }
    return stats;
  }
}

