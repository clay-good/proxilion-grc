/**
 * Latency-aware Router
 * 
 * Routes requests to the fastest provider based on:
 * - Historical latency data
 * - Real-time performance metrics
 * - Provider health status
 * - SLA requirements
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type Provider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'azure-openai';

export interface ProviderLatencyStats {
  provider: Provider;
  model: string;
  
  // Latency metrics (in ms)
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  
  // Performance metrics
  successRate: number;        // 0-1
  errorRate: number;          // 0-1
  timeoutRate: number;        // 0-1
  
  // Health
  available: boolean;
  lastUpdated: number;
  sampleSize: number;
}

export interface LatencyRoutingConfig {
  maxLatency?: number;         // Maximum acceptable latency in ms
  targetPercentile: 50 | 95 | 99; // Which percentile to optimize for
  minSuccessRate?: number;     // Minimum success rate (0-1)
  maxErrorRate?: number;       // Maximum error rate (0-1)
  requireHealthy: boolean;     // Only route to healthy providers
  minSampleSize?: number;      // Minimum samples required for stats
}

export interface LatencyRoutingResult {
  provider: Provider;
  model: string;
  estimatedLatency: number;
  successRate: number;
  reason: string;
  alternatives?: Array<{
    provider: Provider;
    model: string;
    estimatedLatency: number;
  }>;
}

export class LatencyRouter {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Latency statistics
  private latencyStats: Map<string, ProviderLatencyStats> = new Map();
  
  // Recent latency samples (for calculating percentiles)
  private latencySamples: Map<string, number[]> = new Map();
  private maxSamples: number = 1000;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Route request to fastest provider
   */
  route(
    providers: Provider[],
    models: Map<Provider, string[]>,
    config: LatencyRoutingConfig
  ): LatencyRoutingResult | null {
    this.logger.debug('Routing request by latency', {
      providers,
      targetPercentile: config.targetPercentile,
      maxLatency: config.maxLatency,
    });

    // Get available provider-model combinations
    const candidates: Array<{ provider: Provider; model: string }> = [];
    for (const provider of providers) {
      const providerModels = models.get(provider) || [];
      for (const model of providerModels) {
        candidates.push({ provider, model });
      }
    }

    if (candidates.length === 0) {
      this.logger.warn('No provider-model combinations available');
      return null;
    }

    // Get stats for all candidates
    const candidateStats = candidates
      .map(c => {
        const key = `${c.provider}:${c.model}`;
        const stats = this.latencyStats.get(key);
        return { ...c, stats };
      })
      .filter(c => c.stats !== undefined) as Array<{
        provider: Provider;
        model: string;
        stats: ProviderLatencyStats;
      }>;

    // If no stats available, return first candidate
    if (candidateStats.length === 0) {
      this.logger.warn('No latency stats available, using first candidate');
      const fallback = candidates[0];
      
      return {
        provider: fallback.provider,
        model: fallback.model,
        estimatedLatency: 0,
        successRate: 1.0,
        reason: 'No historical data available',
      };
    }

    // Filter by health
    let validCandidates = candidateStats;
    if (config.requireHealthy) {
      validCandidates = candidateStats.filter(c => c.stats.available);
      
      if (validCandidates.length === 0) {
        this.logger.warn('No healthy providers available');
        return null;
      }
    }

    // Filter by minimum sample size
    if (config.minSampleSize) {
      validCandidates = validCandidates.filter(
        c => c.stats.sampleSize >= config.minSampleSize!
      );
      
      if (validCandidates.length === 0) {
        this.logger.warn('No providers with sufficient sample size');
        // Fallback to all candidates
        validCandidates = candidateStats;
      }
    }

    // Filter by success rate
    if (config.minSuccessRate) {
      validCandidates = validCandidates.filter(
        c => c.stats.successRate >= config.minSuccessRate!
      );
      
      if (validCandidates.length === 0) {
        this.logger.warn('No providers meet minimum success rate');
        return null;
      }
    }

    // Filter by error rate
    if (config.maxErrorRate) {
      validCandidates = validCandidates.filter(
        c => c.stats.errorRate <= config.maxErrorRate!
      );
    }

    // Get latency for target percentile
    const getLatency = (stats: ProviderLatencyStats): number => {
      switch (config.targetPercentile) {
        case 50:
          return stats.p50Latency;
        case 95:
          return stats.p95Latency;
        case 99:
          return stats.p99Latency;
        default:
          return stats.averageLatency;
      }
    };

    // Filter by max latency
    if (config.maxLatency) {
      validCandidates = validCandidates.filter(
        c => getLatency(c.stats) <= config.maxLatency!
      );
      
      if (validCandidates.length === 0) {
        this.logger.warn('No providers meet latency requirement', {
          maxLatency: config.maxLatency,
          fastest: Math.min(...candidateStats.map(c => getLatency(c.stats))),
        });
        return null;
      }
    }

    // Select provider with lowest latency
    const selected = validCandidates.reduce((best, current) => {
      const bestLatency = getLatency(best.stats);
      const currentLatency = getLatency(current.stats);
      return currentLatency < bestLatency ? current : best;
    });

    const estimatedLatency = getLatency(selected.stats);

    this.metrics.increment('latency_router_route_total', 1, {
      provider: selected.provider,
      model: selected.model,
      percentile: config.targetPercentile.toString(),
    });

    this.metrics.histogram('latency_router_estimated_latency_ms', estimatedLatency, {
      provider: selected.provider,
      model: selected.model,
    });

    // Get alternatives
    const alternatives = validCandidates
      .filter(c => c !== selected)
      .sort((a, b) => getLatency(a.stats) - getLatency(b.stats))
      .slice(0, 3)
      .map(c => ({
        provider: c.provider,
        model: c.model,
        estimatedLatency: getLatency(c.stats),
      }));

    return {
      provider: selected.provider,
      model: selected.model,
      estimatedLatency,
      successRate: selected.stats.successRate,
      reason: `Lowest P${config.targetPercentile} latency (${estimatedLatency.toFixed(0)}ms)`,
      alternatives,
    };
  }

  /**
   * Record latency sample
   */
  recordLatency(
    provider: Provider,
    model: string,
    latency: number,
    success: boolean
  ): void {
    const key = `${provider}:${model}`;
    
    // Get or create samples array
    let samples = this.latencySamples.get(key);
    if (!samples) {
      samples = [];
      this.latencySamples.set(key, samples);
    }

    // Add sample
    samples.push(latency);
    
    // Keep only last N samples
    if (samples.length > this.maxSamples) {
      samples.shift();
    }

    // Update stats
    this.updateStats(provider, model, success);

    this.metrics.histogram('latency_router_recorded_latency_ms', latency, {
      provider,
      model,
      success: success.toString(),
    });
  }

  /**
   * Update statistics for provider-model
   */
  private updateStats(provider: Provider, model: string, success: boolean): void {
    const key = `${provider}:${model}`;
    const samples = this.latencySamples.get(key) || [];
    
    if (samples.length === 0) {
      return;
    }

    // Get or create stats
    let stats = this.latencyStats.get(key);
    if (!stats) {
      stats = {
        provider,
        model,
        averageLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        minLatency: 0,
        maxLatency: 0,
        successRate: 1.0,
        errorRate: 0,
        timeoutRate: 0,
        available: true,
        lastUpdated: Date.now(),
        sampleSize: 0,
      };
      this.latencyStats.set(key, stats);
    }

    // Calculate percentiles
    const sorted = [...samples].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    stats.averageLatency = samples.reduce((sum, l) => sum + l, 0) / samples.length;
    stats.p50Latency = sorted[p50Index] || 0;
    stats.p95Latency = sorted[p95Index] || 0;
    stats.p99Latency = sorted[p99Index] || 0;
    stats.minLatency = sorted[0] || 0;
    stats.maxLatency = sorted[sorted.length - 1] || 0;
    stats.sampleSize = samples.length;
    stats.lastUpdated = Date.now();

    // Update success rate (exponential moving average)
    const alpha = 0.1; // Smoothing factor
    stats.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * stats.successRate;
    stats.errorRate = 1 - stats.successRate;
  }

  /**
   * Update provider availability
   */
  updateAvailability(provider: Provider, model: string, available: boolean): void {
    const key = `${provider}:${model}`;
    const stats = this.latencyStats.get(key);

    if (stats) {
      stats.available = available;
      
      this.logger.info('Provider availability updated', {
        provider,
        model,
        available,
      });

      this.metrics.gauge('latency_router_provider_available', available ? 1 : 0, {
        provider,
        model,
      });
    }
  }

  /**
   * Get statistics for provider-model
   */
  getStats(provider: Provider, model: string): ProviderLatencyStats | undefined {
    const key = `${provider}:${model}`;
    return this.latencyStats.get(key);
  }

  /**
   * Get all statistics
   */
  getAllStats(): ProviderLatencyStats[] {
    return Array.from(this.latencyStats.values());
  }

  /**
   * Clear statistics
   */
  clearStats(provider?: Provider, model?: string): void {
    if (provider && model) {
      const key = `${provider}:${model}`;
      this.latencyStats.delete(key);
      this.latencySamples.delete(key);
    } else if (provider) {
      // Clear all stats for provider
      for (const key of this.latencyStats.keys()) {
        if (key.startsWith(`${provider}:`)) {
          this.latencyStats.delete(key);
          this.latencySamples.delete(key);
        }
      }
    } else {
      // Clear all stats
      this.latencyStats.clear();
      this.latencySamples.clear();
    }

    this.logger.info('Statistics cleared', { provider, model });
  }
}

