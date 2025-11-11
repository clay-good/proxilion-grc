/**
 * Metrics collection and aggregation
 */

import { MetricEvent } from '../types/index.js';

interface CircularBuffer {
  buffer: MetricEvent[];
  head: number;
  tail: number;
  size: number;
  capacity: number;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, CircularBuffer> = new Map();
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

  /**
   * Initialize circular buffer for a metric
   */
  private initBuffer(name: string): CircularBuffer {
    const buffer: CircularBuffer = {
      buffer: new Array(this.maxMetricsPerName),
      head: 0,
      tail: 0,
      size: 0,
      capacity: this.maxMetricsPerName,
    };
    this.metrics.set(name, buffer);
    return buffer;
  }

  /**
   * Record metric using circular buffer for O(1) insertion
   */
  private record(metric: MetricEvent): void {
    let circularBuffer = this.metrics.get(metric.name);

    if (!circularBuffer) {
      circularBuffer = this.initBuffer(metric.name);
    }

    // O(1) insertion into circular buffer
    circularBuffer.buffer[circularBuffer.tail] = metric;
    circularBuffer.tail = (circularBuffer.tail + 1) % circularBuffer.capacity;

    // Update size and head pointer
    if (circularBuffer.size < circularBuffer.capacity) {
      circularBuffer.size++;
    } else {
      // Buffer full, move head forward (overwriting oldest)
      circularBuffer.head = (circularBuffer.head + 1) % circularBuffer.capacity;
    }
  }

  /**
   * Convert circular buffer to array
   */
  private bufferToArray(circularBuffer: CircularBuffer): MetricEvent[] {
    const result: MetricEvent[] = [];
    let count = 0;
    let index = circularBuffer.head;

    while (count < circularBuffer.size) {
      result.push(circularBuffer.buffer[index]);
      index = (index + 1) % circularBuffer.capacity;
      count++;
    }

    return result;
  }

  getMetrics(name?: string): MetricEvent[] {
    if (name) {
      const circularBuffer = this.metrics.get(name);
      return circularBuffer ? this.bufferToArray(circularBuffer) : [];
    }

    const all: MetricEvent[] = [];
    for (const circularBuffer of this.metrics.values()) {
      all.push(...this.bufferToArray(circularBuffer));
    }
    return all;
  }

  getStats(name: string): MetricStats | null {
    const circularBuffer = this.metrics.get(name);
    if (!circularBuffer || circularBuffer.size === 0) return null;

    const metrics = this.bufferToArray(circularBuffer);
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

