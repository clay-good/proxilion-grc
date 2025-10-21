/**
 * Provider Health Monitor
 * 
 * Monitors AI provider health, availability, latency, and error rates.
 * Automatically routes around unhealthy providers and tracks SLA compliance.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type ProviderStatus = 'healthy' | 'degraded' | 'unhealthy' | 'offline';

export interface ProviderHealthMetrics {
  provider: string;
  status: ProviderStatus;
  availability: number;        // 0-1 (percentage)
  averageLatency: number;      // ms
  p95Latency: number;          // ms
  errorRate: number;           // 0-1 (percentage)
  requestCount: number;        // Total requests in window
  successCount: number;        // Successful requests
  errorCount: number;          // Failed requests
  timeoutCount: number;        // Timeout errors
  rateLimitCount: number;      // Rate limit errors
  lastSuccessTime: number;     // Timestamp of last success
  lastErrorTime: number;       // Timestamp of last error
  lastHealthCheck: number;     // Timestamp of last health check
  consecutiveFailures: number; // Consecutive failures
  slaCompliance: number;       // 0-1 (percentage)
}

export interface ProviderHealthConfig {
  healthCheckInterval: number;     // ms
  healthCheckTimeout: number;      // ms
  unhealthyThreshold: number;      // Consecutive failures before unhealthy
  degradedErrorRate: number;       // Error rate threshold for degraded (0-1)
  unhealthyErrorRate: number;      // Error rate threshold for unhealthy (0-1)
  degradedLatency: number;         // Latency threshold for degraded (ms)
  unhealthyLatency: number;        // Latency threshold for unhealthy (ms)
  metricsWindow: number;           // Time window for metrics (ms)
  slaTarget: number;               // SLA target availability (0-1)
}

export interface HealthCheckResult {
  provider: string;
  success: boolean;
  latency: number;
  error?: string;
  timestamp: number;
}

export class ProviderHealthMonitor {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<ProviderHealthConfig>;
  private providerMetrics: Map<string, ProviderHealthMetrics> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private requestHistory: Map<string, Array<{ success: boolean; latency: number; timestamp: number }>> = new Map();

  constructor(config?: Partial<ProviderHealthConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      healthCheckInterval: config?.healthCheckInterval ?? 30000, // 30 seconds
      healthCheckTimeout: config?.healthCheckTimeout ?? 5000,    // 5 seconds
      unhealthyThreshold: config?.unhealthyThreshold ?? 3,
      degradedErrorRate: config?.degradedErrorRate ?? 0.05,      // 5%
      unhealthyErrorRate: config?.unhealthyErrorRate ?? 0.15,    // 15%
      degradedLatency: config?.degradedLatency ?? 2000,          // 2 seconds
      unhealthyLatency: config?.unhealthyLatency ?? 5000,        // 5 seconds
      metricsWindow: config?.metricsWindow ?? 300000,            // 5 minutes
      slaTarget: config?.slaTarget ?? 0.999,                     // 99.9%
    };

    this.initializeProviders();
    this.startHealthChecks();
  }

  /**
   * Initialize health metrics for known providers
   */
  private initializeProviders(): void {
    const providers = ['openai', 'anthropic', 'google', 'cohere'];
    
    for (const provider of providers) {
      this.providerMetrics.set(provider, {
        provider,
        status: 'healthy',
        availability: 1.0,
        averageLatency: 0,
        p95Latency: 0,
        errorRate: 0,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        timeoutCount: 0,
        rateLimitCount: 0,
        lastSuccessTime: Date.now(),
        lastErrorTime: 0,
        lastHealthCheck: Date.now(),
        consecutiveFailures: 0,
        slaCompliance: 1.0,
      });

      this.requestHistory.set(provider, []);
    }

    this.logger.info('Initialized provider health monitoring', { 
      providers: providers.length 
    });
  }

  /**
   * Record a request result
   */
  recordRequest(provider: string, success: boolean, latency: number, errorType?: string): void {
    const providerMetrics = this.providerMetrics.get(provider);
    if (!providerMetrics) {
      this.logger.warn('Unknown provider for health tracking', { provider });
      return;
    }

    // Update request history
    const history = this.requestHistory.get(provider) || [];
    history.push({ success, latency, timestamp: Date.now() });
    this.requestHistory.set(provider, history);

    // Clean old history
    this.cleanOldHistory(provider);

    // Update metrics
    providerMetrics.requestCount++;
    
    if (success) {
      providerMetrics.successCount++;
      providerMetrics.lastSuccessTime = Date.now();
      providerMetrics.consecutiveFailures = 0;
    } else {
      providerMetrics.errorCount++;
      providerMetrics.lastErrorTime = Date.now();
      providerMetrics.consecutiveFailures++;

      if (errorType === 'timeout') {
        providerMetrics.timeoutCount++;
      } else if (errorType === 'rate_limit') {
        providerMetrics.rateLimitCount++;
      }
    }

    // Recalculate metrics
    this.recalculateMetrics(provider);

    // Update status
    this.updateProviderStatus(provider);

    // Emit metrics
    this.metrics.gauge(`provider_health_availability_${provider}`, providerMetrics.availability);
    this.metrics.gauge(`provider_health_latency_${provider}`, providerMetrics.averageLatency);
    this.metrics.gauge(`provider_health_error_rate_${provider}`, providerMetrics.errorRate);

    this.logger.debug('Recorded provider request', { 
      provider, 
      success, 
      latency,
      status: providerMetrics.status 
    });
  }

  /**
   * Clean old history outside the metrics window
   */
  private cleanOldHistory(provider: string): void {
    const history = this.requestHistory.get(provider) || [];
    const cutoff = Date.now() - this.config.metricsWindow;
    
    const filtered = history.filter(entry => entry.timestamp > cutoff);
    this.requestHistory.set(provider, filtered);
  }

  /**
   * Recalculate metrics from history
   */
  private recalculateMetrics(provider: string): void {
    const providerMetrics = this.providerMetrics.get(provider);
    if (!providerMetrics) return;

    const history = this.requestHistory.get(provider) || [];
    
    if (history.length === 0) {
      return;
    }

    // Calculate availability
    const successCount = history.filter(h => h.success).length;
    providerMetrics.availability = successCount / history.length;

    // Calculate error rate
    providerMetrics.errorRate = 1 - providerMetrics.availability;

    // Calculate latencies
    const latencies = history.map(h => h.latency).sort((a, b) => a - b);
    providerMetrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    const p95Index = Math.floor(latencies.length * 0.95);
    providerMetrics.p95Latency = latencies[p95Index] || 0;

    // Calculate SLA compliance
    providerMetrics.slaCompliance = providerMetrics.availability >= this.config.slaTarget ? 1.0 : providerMetrics.availability / this.config.slaTarget;

    this.providerMetrics.set(provider, providerMetrics);
  }

  /**
   * Update provider status based on metrics
   */
  private updateProviderStatus(provider: string): void {
    const providerMetrics = this.providerMetrics.get(provider);
    if (!providerMetrics) return;

    let newStatus: ProviderStatus = 'healthy';

    // Check consecutive failures
    if (providerMetrics.consecutiveFailures >= this.config.unhealthyThreshold) {
      newStatus = 'unhealthy';
    }
    // Check error rate
    else if (providerMetrics.errorRate >= this.config.unhealthyErrorRate) {
      newStatus = 'unhealthy';
    }
    else if (providerMetrics.errorRate >= this.config.degradedErrorRate) {
      newStatus = 'degraded';
    }
    // Check latency
    else if (providerMetrics.p95Latency >= this.config.unhealthyLatency) {
      newStatus = 'unhealthy';
    }
    else if (providerMetrics.p95Latency >= this.config.degradedLatency) {
      newStatus = 'degraded';
    }

    // Check if provider has been offline for too long
    const timeSinceLastSuccess = Date.now() - providerMetrics.lastSuccessTime;
    if (timeSinceLastSuccess > this.config.metricsWindow) {
      newStatus = 'offline';
    }

    if (newStatus !== providerMetrics.status) {
      this.logger.warn('Provider status changed', { 
        provider, 
        oldStatus: providerMetrics.status, 
        newStatus,
        errorRate: providerMetrics.errorRate,
        latency: providerMetrics.p95Latency,
        consecutiveFailures: providerMetrics.consecutiveFailures
      });

      providerMetrics.status = newStatus;
      this.providerMetrics.set(provider, providerMetrics);

      this.metrics.increment('provider_health_status_changes_total', 1, {
        provider,
        status: newStatus,
      });
    }
  }

  /**
   * Get health metrics for a provider
   */
  getProviderHealth(provider: string): ProviderHealthMetrics | undefined {
    return this.providerMetrics.get(provider);
  }

  /**
   * Get all provider health metrics
   */
  getAllProviderHealth(): ProviderHealthMetrics[] {
    return Array.from(this.providerMetrics.values());
  }

  /**
   * Get healthy providers only
   */
  getHealthyProviders(): string[] {
    return this.getAllProviderHealth()
      .filter(m => m.status === 'healthy')
      .map(m => m.provider);
  }

  /**
   * Check if provider is healthy
   */
  isProviderHealthy(provider: string): boolean {
    const health = this.providerMetrics.get(provider);
    return health?.status === 'healthy';
  }

  /**
   * Check if provider is available (healthy or degraded)
   */
  isProviderAvailable(provider: string): boolean {
    const health = this.providerMetrics.get(provider);
    return health?.status === 'healthy' || health?.status === 'degraded';
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    this.logger.info('Started provider health checks', { 
      interval: this.config.healthCheckInterval 
    });
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    const providers = Array.from(this.providerMetrics.keys());
    
    for (const provider of providers) {
      const result = await this.performHealthCheck(provider);
      
      if (result.success) {
        this.recordRequest(provider, true, result.latency);
      } else {
        this.recordRequest(provider, false, result.latency, 'timeout');
      }
    }

    this.logger.debug('Completed provider health checks', { 
      providerCount: providers.length 
    });
  }

  /**
   * Perform health check on a single provider
   */
  private async performHealthCheck(provider: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // In a real implementation, this would make actual health check requests
      // For now, we'll simulate it
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      
      const success = Math.random() > 0.01; // 99% success rate simulation
      const latency = Date.now() - startTime;

      return {
        provider,
        success,
        latency,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider,
        success: false,
        latency: Date.now() - startTime,
        error: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      this.logger.info('Stopped provider health checks');
    }
  }

  /**
   * Get overall health summary
   */
  getHealthSummary(): {
    totalProviders: number;
    healthyProviders: number;
    degradedProviders: number;
    unhealthyProviders: number;
    offlineProviders: number;
    overallAvailability: number;
    overallSlaCompliance: number;
  } {
    const allHealth = this.getAllProviderHealth();
    
    const healthy = allHealth.filter(h => h.status === 'healthy').length;
    const degraded = allHealth.filter(h => h.status === 'degraded').length;
    const unhealthy = allHealth.filter(h => h.status === 'unhealthy').length;
    const offline = allHealth.filter(h => h.status === 'offline').length;

    const totalAvailability = allHealth.reduce((sum, h) => sum + h.availability, 0);
    const totalSlaCompliance = allHealth.reduce((sum, h) => sum + h.slaCompliance, 0);

    return {
      totalProviders: allHealth.length,
      healthyProviders: healthy,
      degradedProviders: degraded,
      unhealthyProviders: unhealthy,
      offlineProviders: offline,
      overallAvailability: allHealth.length > 0 ? totalAvailability / allHealth.length : 0,
      overallSlaCompliance: allHealth.length > 0 ? totalSlaCompliance / allHealth.length : 0,
    };
  }
}

