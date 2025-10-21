/**
 * Metrics collection and aggregation
 */

import { MetricEvent } from '../types/index.js';

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, MetricEvent[]> = new Map();
  private readonly maxMetricsPerName = 1000;

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.record({
      name,
      value,
      type: 'counter',
      timestamp: Date.now(),
      tags,
    });
  }

  // Alias for counter with value of 1 (common pattern)
  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.counter(name, value, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.record({
      name,
      value,
      type: 'gauge',
      timestamp: Date.now(),
      tags,
    });
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.record({
      name,
      value,
      type: 'histogram',
      timestamp: Date.now(),
      tags,
    });
  }

  private record(metric: MetricEvent): void {
    const existing = this.metrics.get(metric.name) || [];
    existing.push(metric);

    // Keep only recent metrics to prevent memory bloat
    if (existing.length > this.maxMetricsPerName) {
      existing.shift();
    }

    this.metrics.set(metric.name, existing);
  }

  getMetrics(name?: string): MetricEvent[] {
    if (name) {
      return this.metrics.get(name) || [];
    }

    const all: MetricEvent[] = [];
    for (const metrics of this.metrics.values()) {
      all.push(...metrics);
    }
    return all;
  }

  getStats(name: string): MetricStats | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;

    const values = metrics.map((m) => m.value);
    values.sort((a, b) => a - b);

    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      min: values[0],
      max: values[values.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: this.percentile(values, 0.5),
      p95: this.percentile(values, 0.95),
      p99: this.percentile(values, 0.99),
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }

  clear(): void {
    this.metrics.clear();
  }
}

export interface MetricStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

// Global metrics collector
export const metrics = MetricsCollector.getInstance();

