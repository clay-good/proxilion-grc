/**
 * Queue Analytics
 * 
 * Provides analytics and insights for queue performance:
 * - Wait time analysis
 * - Throughput tracking
 * - SLA compliance monitoring
 * - Bottleneck detection
 * - Capacity planning
 */

import { Logger } from '../utils/logger.js';
import { PriorityLevel, QueueMetrics } from './priority-queue-manager.js';

export interface QueueAnalytics {
  // Throughput
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  
  // Wait times
  averageWaitTime: number;
  medianWaitTime: number;
  p50WaitTime: number;
  p95WaitTime: number;
  p99WaitTime: number;
  maxWaitTime: number;
  
  // Processing times
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  
  // Queue health
  queueUtilization: number;    // 0-1
  processingUtilization: number; // 0-1
  slaCompliance: number;       // 0-1
  
  // Bottlenecks
  bottlenecks: Bottleneck[];
  
  // Capacity
  capacityRecommendation: CapacityRecommendation;
}

export interface Bottleneck {
  type: 'queue_full' | 'high_wait_time' | 'low_throughput' | 'sla_violations';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  affectedPriorities: PriorityLevel[];
}

export interface CapacityRecommendation {
  currentCapacity: number;
  recommendedCapacity: number;
  reason: string;
  expectedImprovement: string;
}

export interface TimeSeriesData {
  timestamp: number;
  value: number;
}

export class QueueAnalyticsEngine {
  private logger: Logger;
  
  // Time series data
  private requestTimestamps: number[] = [];
  private waitTimes: number[] = [];
  private processingTimes: number[] = [];
  
  // Historical metrics
  private metricsHistory: Array<{ timestamp: number; metrics: QueueMetrics }> = [];
  private maxHistorySize: number = 1000;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Record request timestamp
   */
  recordRequest(timestamp: number = Date.now()): void {
    this.requestTimestamps.push(timestamp);
    
    // Keep only last hour
    const oneHourAgo = Date.now() - 3600000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneHourAgo);
  }

  /**
   * Record wait time
   */
  recordWaitTime(waitTime: number): void {
    this.waitTimes.push(waitTime);
    
    // Keep only last 1000
    if (this.waitTimes.length > 1000) {
      this.waitTimes.shift();
    }
  }

  /**
   * Record processing time
   */
  recordProcessingTime(processingTime: number): void {
    this.processingTimes.push(processingTime);
    
    // Keep only last 1000
    if (this.processingTimes.length > 1000) {
      this.processingTimes.shift();
    }
  }

  /**
   * Record queue metrics snapshot
   */
  recordMetrics(metrics: QueueMetrics): void {
    this.metricsHistory.push({
      timestamp: Date.now(),
      metrics,
    });
    
    // Keep only last N snapshots
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Analyze queue performance
   */
  analyze(currentMetrics: QueueMetrics, maxQueueSize: number, maxConcurrent: number): QueueAnalytics {
    // Calculate throughput
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    const requestsPerSecond = this.requestTimestamps.filter(t => t > oneSecondAgo).length;
    const requestsPerMinute = this.requestTimestamps.filter(t => t > oneMinuteAgo).length;
    const requestsPerHour = this.requestTimestamps.filter(t => t > oneHourAgo).length;

    // Calculate wait time statistics
    const sortedWaitTimes = [...this.waitTimes].sort((a, b) => a - b);
    const waitTimeStats = this.calculatePercentiles(sortedWaitTimes);

    // Calculate processing time statistics
    const sortedProcessingTimes = [...this.processingTimes].sort((a, b) => a - b);
    const processingTimeStats = this.calculatePercentiles(sortedProcessingTimes);

    // Calculate utilization
    const queueUtilization = currentMetrics.currentQueueSize / maxQueueSize;
    const processingUtilization = currentMetrics.currentProcessing / maxConcurrent;

    // Detect bottlenecks
    const bottlenecks = this.detectBottlenecks(currentMetrics, queueUtilization, processingUtilization);

    // Generate capacity recommendation
    const capacityRecommendation = this.recommendCapacity(
      currentMetrics,
      maxConcurrent,
      processingUtilization,
      waitTimeStats.p95
    );

    return {
      requestsPerSecond,
      requestsPerMinute,
      requestsPerHour,
      averageWaitTime: waitTimeStats.average,
      medianWaitTime: waitTimeStats.median,
      p50WaitTime: waitTimeStats.p50,
      p95WaitTime: waitTimeStats.p95,
      p99WaitTime: waitTimeStats.p99,
      maxWaitTime: waitTimeStats.max,
      averageProcessingTime: processingTimeStats.average,
      medianProcessingTime: processingTimeStats.median,
      p95ProcessingTime: processingTimeStats.p95,
      p99ProcessingTime: processingTimeStats.p99,
      queueUtilization,
      processingUtilization,
      slaCompliance: currentMetrics.slaCompliance,
      bottlenecks,
      capacityRecommendation,
    };
  }

  /**
   * Calculate percentiles
   */
  private calculatePercentiles(sortedValues: number[]): {
    average: number;
    median: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  } {
    if (sortedValues.length === 0) {
      return {
        average: 0,
        median: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
      };
    }

    const average = sortedValues.reduce((sum, v) => sum + v, 0) / sortedValues.length;
    const median = sortedValues[Math.floor(sortedValues.length * 0.5)] || 0;
    const p50 = median;
    const p95 = sortedValues[Math.floor(sortedValues.length * 0.95)] || 0;
    const p99 = sortedValues[Math.floor(sortedValues.length * 0.99)] || 0;
    const max = sortedValues[sortedValues.length - 1] || 0;

    return { average, median, p50, p95, p99, max };
  }

  /**
   * Detect bottlenecks
   */
  private detectBottlenecks(
    metrics: QueueMetrics,
    queueUtilization: number,
    processingUtilization: number
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Queue full
    if (queueUtilization > 0.9) {
      bottlenecks.push({
        type: 'queue_full',
        severity: queueUtilization > 0.95 ? 'critical' : 'high',
        description: `Queue is ${(queueUtilization * 100).toFixed(1)}% full`,
        recommendation: 'Increase queue size or processing capacity',
        affectedPriorities: ['critical', 'high', 'normal', 'low', 'background'],
      });
    }

    // High wait time
    if (metrics.p95WaitTime > 5000) {
      bottlenecks.push({
        type: 'high_wait_time',
        severity: metrics.p95WaitTime > 10000 ? 'critical' : 'high',
        description: `P95 wait time is ${metrics.p95WaitTime}ms`,
        recommendation: 'Increase processing capacity or optimize request processing',
        affectedPriorities: ['normal', 'low', 'background'],
      });
    }

    // Low throughput
    if (processingUtilization < 0.3 && metrics.currentQueueSize > 0) {
      bottlenecks.push({
        type: 'low_throughput',
        severity: 'medium',
        description: `Processing utilization is only ${(processingUtilization * 100).toFixed(1)}%`,
        recommendation: 'Check for processing bottlenecks or increase concurrency',
        affectedPriorities: ['critical', 'high', 'normal', 'low', 'background'],
      });
    }

    // SLA violations
    if (metrics.slaCompliance < 0.95) {
      bottlenecks.push({
        type: 'sla_violations',
        severity: metrics.slaCompliance < 0.90 ? 'critical' : 'high',
        description: `SLA compliance is ${(metrics.slaCompliance * 100).toFixed(1)}%`,
        recommendation: 'Increase capacity, optimize processing, or adjust SLA targets',
        affectedPriorities: ['critical', 'high'],
      });
    }

    return bottlenecks;
  }

  /**
   * Recommend capacity
   */
  private recommendCapacity(
    metrics: QueueMetrics,
    currentCapacity: number,
    utilization: number,
    p95WaitTime: number
  ): CapacityRecommendation {
    let recommendedCapacity = currentCapacity;
    let reason = 'Current capacity is adequate';
    let expectedImprovement = 'No changes needed';

    // High utilization
    if (utilization > 0.8) {
      const increase = Math.ceil(currentCapacity * 0.5);
      recommendedCapacity = currentCapacity + increase;
      reason = `Utilization is ${(utilization * 100).toFixed(1)}%, which is high`;
      expectedImprovement = `Reduce wait times by ~${Math.round((1 - (currentCapacity / recommendedCapacity)) * 100)}%`;
    }
    // High wait time
    else if (p95WaitTime > 5000) {
      const increase = Math.ceil(currentCapacity * 0.3);
      recommendedCapacity = currentCapacity + increase;
      reason = `P95 wait time is ${p95WaitTime}ms, which is high`;
      expectedImprovement = `Reduce P95 wait time to ~${Math.round(p95WaitTime * 0.7)}ms`;
    }
    // Low utilization
    else if (utilization < 0.3 && currentCapacity > 10) {
      const decrease = Math.ceil(currentCapacity * 0.2);
      recommendedCapacity = Math.max(10, currentCapacity - decrease);
      reason = `Utilization is ${(utilization * 100).toFixed(1)}%, which is low`;
      expectedImprovement = `Reduce resource usage by ~${Math.round((decrease / currentCapacity) * 100)}%`;
    }

    return {
      currentCapacity,
      recommendedCapacity,
      reason,
      expectedImprovement,
    };
  }

  /**
   * Get time series data
   */
  getTimeSeries(metric: 'queueSize' | 'processing' | 'waitTime' | 'throughput'): TimeSeriesData[] {
    switch (metric) {
      case 'queueSize':
        return this.metricsHistory.map(h => ({
          timestamp: h.timestamp,
          value: h.metrics.currentQueueSize,
        }));
      
      case 'processing':
        return this.metricsHistory.map(h => ({
          timestamp: h.timestamp,
          value: h.metrics.currentProcessing,
        }));
      
      case 'waitTime':
        return this.metricsHistory.map(h => ({
          timestamp: h.timestamp,
          value: h.metrics.averageWaitTime,
        }));
      
      case 'throughput':
        // Calculate throughput from metrics history
        return this.metricsHistory.map((h, i) => {
          if (i === 0) {
            return { timestamp: h.timestamp, value: 0 };
          }
          const prev = this.metricsHistory[i - 1];
          const timeDiff = (h.timestamp - prev.timestamp) / 1000; // seconds
          const requestDiff = h.metrics.totalProcessed - prev.metrics.totalProcessed;
          const throughput = timeDiff > 0 ? requestDiff / timeDiff : 0;
          return { timestamp: h.timestamp, value: throughput };
        });
      
      default:
        return [];
    }
  }

  /**
   * Generate report
   */
  generateReport(analytics: QueueAnalytics): string {
    const lines: string[] = [];
    
    lines.push('=== Queue Analytics Report ===\n');
    
    lines.push('Throughput:');
    lines.push(`  Requests/sec: ${analytics.requestsPerSecond}`);
    lines.push(`  Requests/min: ${analytics.requestsPerMinute}`);
    lines.push(`  Requests/hour: ${analytics.requestsPerHour}\n`);
    
    lines.push('Wait Times:');
    lines.push(`  Average: ${analytics.averageWaitTime.toFixed(0)}ms`);
    lines.push(`  Median: ${analytics.medianWaitTime.toFixed(0)}ms`);
    lines.push(`  P95: ${analytics.p95WaitTime.toFixed(0)}ms`);
    lines.push(`  P99: ${analytics.p99WaitTime.toFixed(0)}ms`);
    lines.push(`  Max: ${analytics.maxWaitTime.toFixed(0)}ms\n`);
    
    lines.push('Processing Times:');
    lines.push(`  Average: ${analytics.averageProcessingTime.toFixed(0)}ms`);
    lines.push(`  P95: ${analytics.p95ProcessingTime.toFixed(0)}ms`);
    lines.push(`  P99: ${analytics.p99ProcessingTime.toFixed(0)}ms\n`);
    
    lines.push('Utilization:');
    lines.push(`  Queue: ${(analytics.queueUtilization * 100).toFixed(1)}%`);
    lines.push(`  Processing: ${(analytics.processingUtilization * 100).toFixed(1)}%`);
    lines.push(`  SLA Compliance: ${(analytics.slaCompliance * 100).toFixed(1)}%\n`);
    
    if (analytics.bottlenecks.length > 0) {
      lines.push('Bottlenecks:');
      for (const bottleneck of analytics.bottlenecks) {
        lines.push(`  [${bottleneck.severity.toUpperCase()}] ${bottleneck.description}`);
        lines.push(`    → ${bottleneck.recommendation}`);
      }
      lines.push('');
    }
    
    lines.push('Capacity Recommendation:');
    lines.push(`  Current: ${analytics.capacityRecommendation.currentCapacity}`);
    lines.push(`  Recommended: ${analytics.capacityRecommendation.recommendedCapacity}`);
    lines.push(`  Reason: ${analytics.capacityRecommendation.reason}`);
    lines.push(`  Expected: ${analytics.capacityRecommendation.expectedImprovement}`);
    
    return lines.join('\n');
  }
}

