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
  private connectionPool: ConnectionPool;

  constructor(
    private config: RequestHandlerConfig,
    connectionPool: ConnectionPool
  ) {
    this.connectionPool = connectionPool;
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
      breaker = new CircuitBreaker(host, {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        monitoringPeriod: 10000,
      });
      this.circuitBreakers.set(host, breaker);
    }
    return breaker;
  }

  private prepareHeaders(headers: Record<string, string>): HeadersInit {
    const prepared: Record<string, string> = { ...headers };

    // Ensure required headers
    if (!prepared['user-agent']) {
      prepared['user-agent'] = 'Proxilion/0.1.0';
    }

    // Add proxy identification
    prepared['x-proxied-by'] = 'Proxilion';

    return prepared;
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const extracted: Record<string, string> = {};
    headers.forEach((value, key) => {
      extracted[key] = value;
    });
    return extracted;
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

