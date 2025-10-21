/**
 * Health Checker
 * 
 * Monitors system health with:
 * - Component health checks
 * - Dependency health checks
 * - Performance metrics
 * - Automatic recovery
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  component: string;
  message?: string;
  latency?: number;
  lastCheck: number;
  consecutiveFailures: number;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: number;
  uptime: number;
  checks: HealthCheckResult[];
  metrics: {
    memoryUsage: number;
    cpuUsage?: number;
    requestRate: number;
    errorRate: number;
  };
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

export class HealthChecker {
  private checks: Map<string, HealthCheckFunction>;
  private results: Map<string, HealthCheckResult>;
  private logger: Logger;
  private metrics: MetricsCollector;
  private startTime: number;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.checks = new Map();
    this.results = new Map();
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.startTime = Date.now();
  }

  /**
   * Register a health check
   */
  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    this.checks.set(name, checkFn);
    this.logger.debug('Health check registered', { name });
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.results.delete(name);
    this.logger.debug('Health check unregistered', { name });
  }

  /**
   * Run all health checks
   */
  async checkHealth(): Promise<SystemHealth> {
    const checkPromises: Promise<void>[] = [];

    // Run all registered checks
    for (const [name, checkFn] of this.checks.entries()) {
      checkPromises.push(
        this.runCheck(name, checkFn).catch((error) => {
          this.logger.error('Health check failed', error instanceof Error ? error : undefined, {
            component: name,
          });
        })
      );
    }

    await Promise.all(checkPromises);

    // Collect results
    const checks = Array.from(this.results.values());

    // Determine overall status
    const status = this.determineOverallStatus(checks);

    // Collect metrics
    const memoryUsage = this.getMemoryUsage();
    const requestRate = this.getRequestRate();
    const errorRate = this.getErrorRate();

    const health: SystemHealth = {
      status,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      checks,
      metrics: {
        memoryUsage,
        requestRate,
        errorRate,
      },
    };

    // Update metrics
    this.metrics.gauge('system_health_status', status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0);

    return health;
  }

  /**
   * Run a single health check
   */
  private async runCheck(name: string, checkFn: HealthCheckFunction): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await checkFn();
      const latency = Date.now() - startTime;

      const previousResult = this.results.get(name);
      const consecutiveFailures = result.status === 'unhealthy' 
        ? (previousResult?.consecutiveFailures || 0) + 1 
        : 0;

      this.results.set(name, {
        ...result,
        latency,
        lastCheck: Date.now(),
        consecutiveFailures,
      });

      this.metrics.histogram(`health_check_duration_ms_${name}`, latency);

      if (result.status === 'unhealthy') {
        this.logger.warn('Health check unhealthy', {
          component: name,
          message: result.message,
          consecutiveFailures,
        });
        this.metrics.increment(`health_check_failure_total_${name}`);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const previousResult = this.results.get(name);
      const consecutiveFailures = (previousResult?.consecutiveFailures || 0) + 1;

      this.results.set(name, {
        status: 'unhealthy',
        component: name,
        message: error instanceof Error ? error.message : String(error),
        latency,
        lastCheck: Date.now(),
        consecutiveFailures,
      });

      this.metrics.increment(`health_check_error_total_${name}`);
    }
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(checks: HealthCheckResult[]): HealthStatus {
    if (checks.length === 0) {
      return 'healthy';
    }

    const unhealthyCount = checks.filter((c) => c.status === 'unhealthy').length;
    const degradedCount = checks.filter((c) => c.status === 'degraded').length;

    // If any critical component is unhealthy, system is unhealthy
    if (unhealthyCount > 0) {
      return 'unhealthy';
    }

    // If any component is degraded, system is degraded
    if (degradedCount > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get memory usage percentage
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      const totalHeap = usage.heapTotal;
      const usedHeap = usage.heapUsed;
      return (usedHeap / totalHeap) * 100;
    }
    return 0;
  }

  /**
   * Get request rate (requests per second)
   */
  private getRequestRate(): number {
    const metricsData = this.metrics.getMetrics();
    const requestMetric = metricsData.find((m: any) => m.name === 'request_total_counter');

    if (requestMetric) {
      // Calculate rate over last minute
      const rate = requestMetric.value / 60;
      return Math.round(rate * 100) / 100;
    }

    return 0;
  }

  /**
   * Get error rate percentage
   */
  private getErrorRate(): number {
    const metricsData = this.metrics.getMetrics();
    const totalRequests = metricsData.find((m: any) => m.name === 'request_total_counter')?.value || 0;
    const totalErrors = metricsData.find((m: any) => m.name === 'request_error_total')?.value || 0;

    if (totalRequests === 0) {
      return 0;
    }

    return (totalErrors / totalRequests) * 100;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      this.stopPeriodicChecks();
    }

    this.checkInterval = setInterval(() => {
      this.checkHealth().catch((error) => {
        this.logger.error('Periodic health check failed', error instanceof Error ? error : undefined, {});
      });
    }, intervalMs);

    this.logger.info('Periodic health checks started', { intervalMs });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.info('Periodic health checks stopped');
    }
  }

  /**
   * Get last check result for a component
   */
  getCheckResult(name: string): HealthCheckResult | undefined {
    return this.results.get(name);
  }

  /**
   * Clear all check results
   */
  clear(): void {
    this.results.clear();
    this.logger.info('Health check results cleared');
  }
}

/**
 * Built-in health checks
 */

export async function createMemoryHealthCheck(threshold: number = 90): Promise<HealthCheckResult> {
  if (typeof process === 'undefined' || !process.memoryUsage) {
    return {
      status: 'healthy',
      component: 'memory',
      message: 'Memory monitoring not available',
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    };
  }

  const usage = process.memoryUsage();
  const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;

  if (usagePercent >= threshold) {
    return {
      status: 'unhealthy',
      component: 'memory',
      message: `Memory usage at ${usagePercent.toFixed(2)}%`,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    };
  }

  if (usagePercent >= threshold * 0.8) {
    return {
      status: 'degraded',
      component: 'memory',
      message: `Memory usage at ${usagePercent.toFixed(2)}%`,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    };
  }

  return {
    status: 'healthy',
    component: 'memory',
    message: `Memory usage at ${usagePercent.toFixed(2)}%`,
    lastCheck: Date.now(),
    consecutiveFailures: 0,
  };
}

export async function createDependencyHealthCheck(
  name: string,
  url: string,
  timeout: number = 5000
): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        status: 'healthy',
        component: name,
        message: `Dependency reachable (${latency}ms)`,
        latency,
        lastCheck: Date.now(),
        consecutiveFailures: 0,
      };
    }

    return {
      status: 'unhealthy',
      component: name,
      message: `Dependency returned ${response.status}`,
      latency,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      component: name,
      message: error instanceof Error ? error.message : String(error),
      lastCheck: Date.now(),
      consecutiveFailures: 0,
    };
  }
}

