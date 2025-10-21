/**
 * Analytics Engine
 * 
 * Provides advanced analytics for:
 * - Usage patterns and trends
 * - Security insights
 * - Performance metrics
 * - Cost optimization recommendations
 * - Anomaly detection
 */

import { Logger } from '../utils/logger.js';
import { AIProvider, ThreatLevel } from '../types/index.js';

export interface UsageMetrics {
  totalRequests: number;
  successfulRequests: number;
  blockedRequests: number;
  alertedRequests: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  cacheHitRate: number;
  errorRate: number;
}

export interface SecurityInsights {
  totalThreats: number;
  threatsByLevel: Record<ThreatLevel, number>;
  topThreats: Array<{ type: string; count: number }>;
  piiDetections: number;
  injectionAttempts: number;
  blockedUsers: string[];
  suspiciousPatterns: Array<{ pattern: string; count: number; severity: string }>;
}

export interface ProviderMetrics {
  provider: AIProvider;
  requests: number;
  cost: number;
  averageLatency: number;
  errorRate: number;
  topModels: Array<{ model: string; requests: number }>;
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
  label?: string;
}

export interface Anomaly {
  id: string;
  timestamp: number;
  type: 'spike' | 'drop' | 'unusual_pattern' | 'cost_surge' | 'security_event';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  value: number;
  baseline: number;
  deviation: number;
  description: string;
}

export interface Recommendation {
  id: string;
  type: 'cost' | 'performance' | 'security';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  potentialSavings?: number;
  estimatedImpact: string;
  actionItems: string[];
}

export class AnalyticsEngine {
  private logger: Logger;
  private dataPoints: Map<string, TimeSeriesData[]>;
  private anomalies: Anomaly[];
  private maxDataPoints: number;

  constructor(maxDataPoints: number = 10000) {
    this.logger = new Logger();
    this.dataPoints = new Map();
    this.anomalies = [];
    this.maxDataPoints = maxDataPoints;
  }

  /**
   * Record a data point for time series analysis
   */
  recordDataPoint(metric: string, value: number, label?: string): void {
    const dataPoint: TimeSeriesData = {
      timestamp: Date.now(),
      value,
      label,
    };

    const existing = this.dataPoints.get(metric) || [];
    existing.push(dataPoint);

    // Trim old data points
    if (existing.length > this.maxDataPoints) {
      existing.shift();
    }

    this.dataPoints.set(metric, existing);
  }

  /**
   * Get time series data for a metric
   */
  getTimeSeries(
    metric: string,
    startTime?: number,
    endTime?: number
  ): TimeSeriesData[] {
    let data = this.dataPoints.get(metric) || [];

    if (startTime) {
      data = data.filter((d) => d.timestamp >= startTime);
    }
    if (endTime) {
      data = data.filter((d) => d.timestamp <= endTime);
    }

    return data;
  }

  /**
   * Calculate usage metrics
   */
  calculateUsageMetrics(data: {
    requests: Array<{
      status: 'success' | 'blocked' | 'alerted' | 'error';
      latency: number;
      cached: boolean;
    }>;
  }): UsageMetrics {
    const total = data.requests.length;
    const successful = data.requests.filter((r) => r.status === 'success').length;
    const blocked = data.requests.filter((r) => r.status === 'blocked').length;
    const alerted = data.requests.filter((r) => r.status === 'alerted').length;
    const errors = data.requests.filter((r) => r.status === 'error').length;
    const cached = data.requests.filter((r) => r.cached).length;

    const latencies = data.requests.map((r) => r.latency).sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    return {
      totalRequests: total,
      successfulRequests: successful,
      blockedRequests: blocked,
      alertedRequests: alerted,
      averageLatency: avgLatency,
      p95Latency: latencies[p95Index] || 0,
      p99Latency: latencies[p99Index] || 0,
      cacheHitRate: total > 0 ? (cached / total) * 100 : 0,
      errorRate: total > 0 ? (errors / total) * 100 : 0,
    };
  }

  /**
   * Generate security insights
   */
  generateSecurityInsights(data: {
    threats: Array<{
      type: string;
      level: ThreatLevel;
      userId?: string;
    }>;
  }): SecurityInsights {
    const threatsByLevel: Record<ThreatLevel, number> = {
      [ThreatLevel.NONE]: 0,
      [ThreatLevel.LOW]: 0,
      [ThreatLevel.MEDIUM]: 0,
      [ThreatLevel.HIGH]: 0,
      [ThreatLevel.CRITICAL]: 0,
    };

    const threatCounts: Record<string, number> = {};
    const blockedUsers = new Set<string>();

    for (const threat of data.threats) {
      threatsByLevel[threat.level]++;
      threatCounts[threat.type] = (threatCounts[threat.type] || 0) + 1;

      if (threat.level === ThreatLevel.HIGH || threat.level === ThreatLevel.CRITICAL) {
        if (threat.userId) {
          blockedUsers.add(threat.userId);
        }
      }
    }

    const topThreats = Object.entries(threatCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const piiDetections = threatCounts['pii'] || 0;
    const injectionAttempts = threatCounts['prompt_injection'] || 0;

    // Detect suspicious patterns
    const suspiciousPatterns: Array<{ pattern: string; count: number; severity: string }> = [];

    if (injectionAttempts > 10) {
      suspiciousPatterns.push({
        pattern: 'High volume of injection attempts',
        count: injectionAttempts,
        severity: 'high',
      });
    }

    if (piiDetections > 20) {
      suspiciousPatterns.push({
        pattern: 'Frequent PII in requests',
        count: piiDetections,
        severity: 'medium',
      });
    }

    return {
      totalThreats: data.threats.length,
      threatsByLevel,
      topThreats,
      piiDetections,
      injectionAttempts,
      blockedUsers: Array.from(blockedUsers),
      suspiciousPatterns,
    };
  }

  /**
   * Detect anomalies in metrics
   */
  detectAnomalies(metric: string, threshold: number = 2.0): Anomaly[] {
    const data = this.dataPoints.get(metric);
    if (!data || data.length < 10) {
      return [];
    }

    const values = data.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const anomalies: Anomaly[] = [];

    // Check recent data points
    const recentData = data.slice(-100);

    for (const point of recentData) {
      const deviation = Math.abs(point.value - mean) / stdDev;

      if (deviation > threshold) {
        const anomaly: Anomaly = {
          id: crypto.randomUUID(),
          timestamp: point.timestamp,
          type: point.value > mean ? 'spike' : 'drop',
          severity: deviation > 4 ? 'critical' : deviation > 3 ? 'high' : 'medium',
          metric,
          value: point.value,
          baseline: mean,
          deviation,
          description: `${metric} ${point.value > mean ? 'spike' : 'drop'} detected: ${point.value.toFixed(2)} (baseline: ${mean.toFixed(2)}, ${deviation.toFixed(1)}σ)`,
        };

        anomalies.push(anomaly);
      }
    }

    // Store anomalies
    this.anomalies.push(...anomalies);

    // Trim old anomalies
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.anomalies = this.anomalies.filter((a) => a.timestamp >= oneWeekAgo);

    return anomalies;
  }

  /**
   * Generate cost optimization recommendations
   */
  generateRecommendations(data: {
    costByModel: Record<string, number>;
    cacheHitRate: number;
    averageTokens: number;
    providerDistribution: Record<string, number>;
  }): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Cache optimization
    if (data.cacheHitRate < 50) {
      recommendations.push({
        id: crypto.randomUUID(),
        type: 'cost',
        priority: 'high',
        title: 'Improve Cache Hit Rate',
        description: `Current cache hit rate is ${data.cacheHitRate.toFixed(1)}%. Increasing to 80% could save significant costs.`,
        potentialSavings: this.estimateCacheSavings(data.costByModel, data.cacheHitRate),
        estimatedImpact: '20-40% cost reduction',
        actionItems: [
          'Increase cache TTL for deterministic requests',
          'Enable caching for more request types',
          'Review cache eviction policy',
        ],
      });
    }

    // Model selection
    const expensiveModels = Object.entries(data.costByModel)
      .filter(([model, _cost]) => model.includes('gpt-4') || model.includes('opus'))
      .reduce((sum, [_, cost]) => sum + cost, 0);

    const totalCost = Object.values(data.costByModel).reduce((a, b) => a + b, 0);

    if (expensiveModels / totalCost > 0.7) {
      recommendations.push({
        id: crypto.randomUUID(),
        type: 'cost',
        priority: 'medium',
        title: 'Consider Using More Cost-Effective Models',
        description: `${((expensiveModels / totalCost) * 100).toFixed(1)}% of costs are from premium models. Consider using GPT-3.5 or Claude Haiku for simpler tasks.`,
        potentialSavings: expensiveModels * 0.5,
        estimatedImpact: '30-50% cost reduction for applicable requests',
        actionItems: [
          'Analyze request complexity',
          'Route simple requests to cheaper models',
          'Implement model fallback strategy',
        ],
      });
    }

    // Token optimization
    if (data.averageTokens > 2000) {
      recommendations.push({
        id: crypto.randomUUID(),
        type: 'performance',
        priority: 'medium',
        title: 'Optimize Token Usage',
        description: `Average token usage is ${data.averageTokens.toFixed(0)} tokens per request. Reducing this can improve both cost and latency.`,
        estimatedImpact: '10-20% cost and latency reduction',
        actionItems: [
          'Implement prompt compression',
          'Remove unnecessary context',
          'Use system messages efficiently',
        ],
      });
    }

    // Provider diversification
    const providers = Object.keys(data.providerDistribution);
    if (providers.length === 1) {
      recommendations.push({
        id: crypto.randomUUID(),
        type: 'performance',
        priority: 'low',
        title: 'Consider Multi-Provider Strategy',
        description: 'Using a single provider creates vendor lock-in and limits cost optimization opportunities.',
        estimatedImpact: 'Improved reliability and cost flexibility',
        actionItems: [
          'Evaluate alternative providers',
          'Implement provider fallback',
          'Compare pricing across providers',
        ],
      });
    }

    return recommendations;
  }

  /**
   * Estimate cache savings
   */
  private estimateCacheSavings(
    costByModel: Record<string, number>,
    currentHitRate: number
  ): number {
    const totalCost = Object.values(costByModel).reduce((a, b) => a + b, 0);
    const targetHitRate = 80;
    const improvement = (targetHitRate - currentHitRate) / 100;
    return totalCost * improvement;
  }

  /**
   * Get provider comparison
   */
  getProviderComparison(data: {
    providers: Array<{
      provider: AIProvider;
      requests: number;
      cost: number;
      latency: number[];
      errors: number;
    }>;
  }): ProviderMetrics[] {
    return data.providers.map((p) => {
      const avgLatency = p.latency.reduce((a, b) => a + b, 0) / p.latency.length || 0;
      const errorRate = (p.errors / p.requests) * 100;

      return {
        provider: p.provider,
        requests: p.requests,
        cost: p.cost,
        averageLatency: avgLatency,
        errorRate,
        topModels: [], // Would be populated from actual data
      };
    });
  }

  /**
   * Get all anomalies
   */
  getAnomalies(limit?: number): Anomaly[] {
    const sorted = [...this.anomalies].sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Clear old data
   */
  clearOldData(olderThan: number): void {
    for (const [metric, data] of this.dataPoints.entries()) {
      const filtered = data.filter((d) => d.timestamp >= olderThan);
      this.dataPoints.set(metric, filtered);
    }

    this.anomalies = this.anomalies.filter((a) => a.timestamp >= olderThan);

    this.logger.info('Cleared old analytics data', { olderThan: new Date(olderThan) });
  }
}

