/**
 * Load Balancer
 * 
 * Intelligent load balancing across multiple AI providers with:
 * - Multiple load balancing algorithms
 * - Automatic failover
 * - Health checking
 * - Provider fallback chains
 * - Cost-based routing
 * - Latency-based routing
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { ProxilionRequest, ProxilionResponse } from '../types/index.js';

export type LoadBalancingAlgorithm = 
  | 'round-robin'
  | 'least-connections'
  | 'least-latency'
  | 'least-cost'
  | 'weighted-round-robin'
  | 'random';

export interface ProviderEndpoint {
  id: string;
  provider: string;  // 'openai', 'anthropic', 'google', 'cohere'
  baseUrl: string;
  apiKey: string;
  weight: number;    // For weighted algorithms
  maxConnections: number;
  enabled: boolean;
  priority: number;  // Lower = higher priority for failover
}

export interface LoadBalancerConfig {
  algorithm: LoadBalancingAlgorithm;
  endpoints: ProviderEndpoint[];
  healthCheckInterval: number;  // ms
  failoverEnabled: boolean;
  maxRetries: number;
  retryDelay: number;  // ms
}

export interface EndpointStats {
  id: string;
  provider: string;
  activeConnections: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  lastHealthCheck: number;
  healthy: boolean;
  lastError?: string;
}

interface ConnectionPoolEntry {
  endpointId: string;
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
}

export class LoadBalancer {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<LoadBalancerConfig>;
  private endpointStats: Map<string, EndpointStats> = new Map();
  private currentIndex = 0;  // For round-robin
  private healthCheckTimer?: NodeJS.Timeout;
  private connectionPool: Map<string, ConnectionPoolEntry[]> = new Map();
  private maxPoolSize = 100; // Maximum connections per endpoint
  private connectionTimeout = 60000; // 1 minute idle timeout

  constructor(config: LoadBalancerConfig) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      algorithm: config.algorithm,
      endpoints: config.endpoints,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
      failoverEnabled: config.failoverEnabled ?? true,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };

    // Initialize stats for each endpoint
    for (const endpoint of this.config.endpoints) {
      this.endpointStats.set(endpoint.id, {
        id: endpoint.id,
        provider: endpoint.provider,
        activeConnections: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        lastHealthCheck: Date.now(),
        healthy: true,
      });
    }

    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Select the best endpoint for a request
   */
  async selectEndpoint(request: ProxilionRequest): Promise<ProviderEndpoint | null> {
    const availableEndpoints = this.getAvailableEndpoints();

    if (availableEndpoints.length === 0) {
      this.logger.error('No available endpoints');
      this.metrics.increment('loadbalancer_no_endpoints_total');
      return null;
    }

    let selectedEndpoint: ProviderEndpoint | null = null;

    switch (this.config.algorithm) {
      case 'round-robin':
        selectedEndpoint = this.selectRoundRobin(availableEndpoints);
        break;

      case 'least-connections':
        selectedEndpoint = this.selectLeastConnections(availableEndpoints);
        break;

      case 'least-latency':
        selectedEndpoint = this.selectLeastLatency(availableEndpoints);
        break;

      case 'least-cost':
        selectedEndpoint = this.selectLeastCost(availableEndpoints);
        break;

      case 'weighted-round-robin':
        selectedEndpoint = this.selectWeightedRoundRobin(availableEndpoints);
        break;

      case 'random':
        selectedEndpoint = this.selectRandom(availableEndpoints);
        break;

      default:
        selectedEndpoint = this.selectRoundRobin(availableEndpoints);
    }

    if (selectedEndpoint) {
      this.logger.info('Endpoint selected', {
        endpointId: selectedEndpoint.id,
        provider: selectedEndpoint.provider,
        algorithm: this.config.algorithm,
      });

      this.metrics.increment('loadbalancer_endpoint_selected_total', 1, {
        endpoint: selectedEndpoint.id,
        provider: selectedEndpoint.provider,
        algorithm: this.config.algorithm,
      });
    }

    return selectedEndpoint;
  }

  /**
   * Execute request with failover
   */
  async executeWithFailover(
    request: ProxilionRequest,
    executor: (endpoint: ProviderEndpoint) => Promise<ProxilionResponse>
  ): Promise<ProxilionResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    // Get endpoints sorted by priority
    const endpoints = this.getEndpointsByPriority();

    for (const endpoint of endpoints) {
      if (attempts >= this.config.maxRetries) {
        break;
      }

      attempts++;

      try {
        this.logger.info('Attempting request', {
          endpointId: endpoint.id,
          provider: endpoint.provider,
          attempt: attempts,
        });

        // Acquire connection from pool
        const connection = this.acquireConnection(endpoint.id);

        // Track active connection
        this.incrementConnections(endpoint.id);

        try {
          const response = await executor(endpoint);

          // Release connection back to pool
          this.releaseConnection(connection);

          // Track success
          this.recordSuccess(endpoint.id, Date.now() - startTime);

          this.logger.info('Request successful', {
            endpointId: endpoint.id,
            provider: endpoint.provider,
            attempt: attempts,
            duration: Date.now() - startTime,
          });

          return response;
        } catch (error) {
          // Release connection on error
          this.releaseConnection(connection);
          throw error;
        }
      } catch (error) {
        lastError = error as Error;

        // Track failure
        this.recordFailure(endpoint.id, lastError.message);

        this.logger.warn('Request failed, trying next endpoint', {
          endpointId: endpoint.id,
          provider: endpoint.provider,
          attempt: attempts,
          error: lastError.message,
        });

        // Wait before retry
        if (attempts < this.config.maxRetries) {
          await this.sleep(this.config.retryDelay);
        }
      } finally {
        this.decrementConnections(endpoint.id);
      }
    }

    // All attempts failed
    this.logger.error('All endpoints failed', lastError || undefined, {
      attempts,
    });

    this.metrics.increment('loadbalancer_all_endpoints_failed_total');

    throw new Error(`All endpoints failed after ${attempts} attempts: ${lastError?.message}`);
  }

  /**
   * Get available endpoints (enabled and healthy)
   */
  private getAvailableEndpoints(): ProviderEndpoint[] {
    return this.config.endpoints.filter(endpoint => {
      const stats = this.endpointStats.get(endpoint.id);
      return endpoint.enabled && stats?.healthy;
    });
  }

  /**
   * Get endpoints sorted by priority
   */
  private getEndpointsByPriority(): ProviderEndpoint[] {
    return [...this.config.endpoints]
      .filter(e => e.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(endpoints: ProviderEndpoint[]): ProviderEndpoint {
    const endpoint = endpoints[this.currentIndex % endpoints.length];
    this.currentIndex++;
    return endpoint;
  }

  /**
   * Least connections selection
   */
  private selectLeastConnections(endpoints: ProviderEndpoint[]): ProviderEndpoint {
    return endpoints.reduce((best, current) => {
      const bestStats = this.endpointStats.get(best.id)!;
      const currentStats = this.endpointStats.get(current.id)!;
      return currentStats.activeConnections < bestStats.activeConnections ? current : best;
    });
  }

  /**
   * Least latency selection
   */
  private selectLeastLatency(endpoints: ProviderEndpoint[]): ProviderEndpoint {
    return endpoints.reduce((best, current) => {
      const bestStats = this.endpointStats.get(best.id)!;
      const currentStats = this.endpointStats.get(current.id)!;
      return currentStats.averageLatency < bestStats.averageLatency ? current : best;
    });
  }

  /**
   * Least cost selection (placeholder - would need cost data)
   */
  private selectLeastCost(endpoints: ProviderEndpoint[]): ProviderEndpoint {
    // For now, just use round-robin
    // In production, this would consider provider pricing
    return this.selectRoundRobin(endpoints);
  }

  /**
   * Weighted round-robin selection
   */
  private selectWeightedRoundRobin(endpoints: ProviderEndpoint[]): ProviderEndpoint {
    const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return endpoints[0];
  }

  /**
   * Random selection
   */
  private selectRandom(endpoints: ProviderEndpoint[]): ProviderEndpoint {
    return endpoints[Math.floor(Math.random() * endpoints.length)];
  }

  /**
   * Increment active connections
   */
  private incrementConnections(endpointId: string): void {
    const stats = this.endpointStats.get(endpointId);
    if (stats) {
      stats.activeConnections++;
      stats.totalRequests++;
    }
  }

  /**
   * Decrement active connections
   */
  private decrementConnections(endpointId: string): void {
    const stats = this.endpointStats.get(endpointId);
    if (stats) {
      stats.activeConnections = Math.max(0, stats.activeConnections - 1);
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(endpointId: string, latency: number): void {
    const stats = this.endpointStats.get(endpointId);
    if (stats) {
      stats.successfulRequests++;
      // Update average latency (exponential moving average)
      stats.averageLatency = stats.averageLatency * 0.9 + latency * 0.1;
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(endpointId: string, error: string): void {
    const stats = this.endpointStats.get(endpointId);
    if (stats) {
      stats.failedRequests++;
      stats.lastError = error;
      
      // Mark as unhealthy if too many failures
      const failureRate = stats.failedRequests / stats.totalRequests;
      if (failureRate > 0.5 && stats.totalRequests > 10) {
        stats.healthy = false;
        this.logger.warn('Endpoint marked unhealthy', {
          endpointId,
          failureRate,
        });
      }
    }
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health checks on all endpoints
   */
  private async performHealthChecks(): Promise<void> {
    for (const endpoint of this.config.endpoints) {
      const stats = this.endpointStats.get(endpoint.id);
      if (!stats) continue;

      // Simple health check: if failure rate is low, mark as healthy
      const failureRate = stats.totalRequests > 0 
        ? stats.failedRequests / stats.totalRequests 
        : 0;

      const wasHealthy = stats.healthy;
      stats.healthy = failureRate < 0.5 || stats.totalRequests < 10;
      stats.lastHealthCheck = Date.now();

      if (wasHealthy !== stats.healthy) {
        this.logger.info('Endpoint health changed', {
          endpointId: endpoint.id,
          healthy: stats.healthy,
          failureRate,
        });
      }
    }
  }

  /**
   * Get statistics for all endpoints
   */
  getStats(): EndpointStats[] {
    return Array.from(this.endpointStats.values());
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }

  /**
   * Acquire a connection from the pool
   */
  private acquireConnection(endpointId: string): ConnectionPoolEntry {
    let pool = this.connectionPool.get(endpointId);

    if (!pool) {
      pool = [];
      this.connectionPool.set(endpointId, pool);
    }

    // Try to find an available connection
    const available = pool.find(conn => !conn.inUse);

    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      available.requestCount++;
      this.metrics.increment('connection_pool_reuse_total');
      return available;
    }

    // Create new connection if pool not full
    if (pool.length < this.maxPoolSize) {
      const newConn: ConnectionPoolEntry = {
        endpointId,
        inUse: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        requestCount: 1,
      };
      pool.push(newConn);
      this.metrics.increment('connection_pool_create_total');
      this.metrics.gauge('connection_pool_size', pool.length);
      return newConn;
    }

    // Pool is full, wait for oldest connection
    const oldest = pool.reduce((prev, curr) =>
      curr.lastUsed < prev.lastUsed ? curr : prev
    );
    oldest.inUse = true;
    oldest.lastUsed = Date.now();
    oldest.requestCount++;
    return oldest;
  }

  /**
   * Release a connection back to the pool
   */
  private releaseConnection(connection: ConnectionPoolEntry): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();

    // Clean up idle connections
    this.cleanupIdleConnections(connection.endpointId);
  }

  /**
   * Clean up idle connections
   */
  private cleanupIdleConnections(endpointId: string): void {
    const pool = this.connectionPool.get(endpointId);
    if (!pool) return;

    const now = Date.now();
    const activeConnections = pool.filter(conn => {
      const isIdle = !conn.inUse && (now - conn.lastUsed) > this.connectionTimeout;
      if (isIdle) {
        this.metrics.increment('connection_pool_cleanup_total');
      }
      return !isIdle;
    });

    if (activeConnections.length !== pool.length) {
      this.connectionPool.set(endpointId, activeConnections);
      this.metrics.gauge('connection_pool_size', activeConnections.length);
      this.logger.debug('Cleaned up idle connections', {
        endpointId,
        removed: pool.length - activeConnections.length,
        remaining: activeConnections.length,
      });
    }
  }

  /**
   * Get connection pool statistics
   */
  getConnectionPoolStats(): Record<string, { total: number; inUse: number; idle: number }> {
    const stats: Record<string, { total: number; inUse: number; idle: number }> = {};

    for (const [endpointId, pool] of this.connectionPool.entries()) {
      const inUse = pool.filter(conn => conn.inUse).length;
      stats[endpointId] = {
        total: pool.length,
        inUse,
        idle: pool.length - inUse,
      };
    }

    return stats;
  }
}

