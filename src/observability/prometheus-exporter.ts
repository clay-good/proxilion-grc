/**
 * Prometheus Metrics Exporter
 * 
 * Exports metrics in Prometheus text format with:
 * - Counter metrics (monotonically increasing)
 * - Gauge metrics (can go up or down)
 * - Histogram metrics (with buckets and quantiles)
 * - Summary metrics (with quantiles)
 * - Label support for multi-dimensional metrics
 * - Automatic metric aggregation from MetricsCollector
 */

import { MetricsCollector, MetricStats } from '../utils/metrics.js';
import { Logger } from '../utils/logger.js';
import { MetricEvent } from '../types/index.js';

export interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  value?: number;
  labels?: Record<string, string>;
  buckets?: { le: string; count: number }[];
  quantiles?: { quantile: string; value: number }[];
  sum?: number;
  count?: number;
}

export interface PrometheusExporterConfig {
  prefix?: string; // Metric name prefix (e.g., 'proxilion_')
  includeTimestamp?: boolean;
  defaultLabels?: Record<string, string>; // Labels added to all metrics
  histogramBuckets?: number[]; // Default histogram buckets
}

export class PrometheusExporter {
  private config: Required<PrometheusExporterConfig>;
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private customMetrics: Map<string, PrometheusMetric>;
  private metricHelp: Map<string, string>;

  constructor(config: PrometheusExporterConfig = {}) {
    this.config = {
      prefix: config.prefix || 'proxilion_',
      includeTimestamp: config.includeTimestamp ?? false,
      defaultLabels: config.defaultLabels || {},
      histogramBuckets: config.histogramBuckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    };

    this.metricsCollector = MetricsCollector.getInstance();
    this.logger = new Logger();
    this.customMetrics = new Map();
    this.metricHelp = new Map();

    this.initializeMetricHelp();
  }

  /**
   * Initialize help text for known metrics
   */
  private initializeMetricHelp(): void {
    // Request metrics
    this.metricHelp.set('requests_total', 'Total number of requests processed');
    this.metricHelp.set('requests_blocked_total', 'Total number of requests blocked by policy');
    this.metricHelp.set('requests_allowed_total', 'Total number of requests allowed');
    this.metricHelp.set('request_duration_seconds', 'Request processing duration in seconds');
    
    // Security metrics
    this.metricHelp.set('threats_detected_total', 'Total number of security threats detected');
    this.metricHelp.set('violations_total', 'Total number of security violations by type');
    this.metricHelp.set('pii_detections_total', 'Total number of PII detections');
    this.metricHelp.set('prompt_injection_detections_total', 'Total number of prompt injection attempts');
    this.metricHelp.set('toxicity_detections_total', 'Total number of toxic content detections');
    this.metricHelp.set('dlp_violations_total', 'Total number of DLP violations');
    this.metricHelp.set('compliance_violations_total', 'Total number of compliance violations');
    
    // Cache metrics
    this.metricHelp.set('cache_hits_total', 'Total number of cache hits');
    this.metricHelp.set('cache_misses_total', 'Total number of cache misses');
    this.metricHelp.set('cache_hit_ratio', 'Cache hit ratio (0-1)');
    this.metricHelp.set('semantic_cache_hits_total', 'Total number of semantic cache hits');
    this.metricHelp.set('semantic_cache_similarity', 'Semantic cache similarity scores');
    
    // Cost metrics
    this.metricHelp.set('cost_total_dollars', 'Total cost in dollars');
    this.metricHelp.set('cost_per_request_dollars', 'Cost per request in dollars');
    this.metricHelp.set('tokens_total', 'Total number of tokens processed');
    
    // Performance metrics
    this.metricHelp.set('latency_seconds', 'Request latency in seconds');
    this.metricHelp.set('latency_saved_seconds', 'Latency saved by caching in seconds');
    this.metricHelp.set('transformation_duration_seconds', 'Request/response transformation duration');
    
    // Load balancer metrics
    this.metricHelp.set('loadbalancer_requests_total', 'Total requests per backend');
    this.metricHelp.set('loadbalancer_failures_total', 'Total failures per backend');
    this.metricHelp.set('loadbalancer_backend_health', 'Backend health status (1=healthy, 0=unhealthy)');
    
    // User analytics metrics
    this.metricHelp.set('users_total', 'Total number of unique users');
    this.metricHelp.set('users_needing_training_total', 'Number of users needing security training');
    this.metricHelp.set('high_risk_users_total', 'Number of high-risk users');
    
    // System metrics
    this.metricHelp.set('errors_total', 'Total number of errors');
    this.metricHelp.set('connections_active', 'Number of active connections');
    this.metricHelp.set('rate_limit_exceeded_total', 'Total number of rate limit violations');
  }

  /**
   * Register a custom metric with help text
   */
  registerMetric(name: string, type: PrometheusMetric['type'], help: string): void {
    const fullName = this.config.prefix + name;
    this.metricHelp.set(name, help);
    this.customMetrics.set(fullName, {
      name: fullName,
      type,
      help,
    });
  }

  /**
   * Export all metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];
    const timestamp = this.config.includeTimestamp ? Date.now() : undefined;

    // Get all metrics from MetricsCollector
    const allMetrics = this.metricsCollector.getMetrics();
    
    // Group metrics by name
    const metricsByName = new Map<string, MetricEvent[]>();
    for (const metric of allMetrics) {
      const existing = metricsByName.get(metric.name) || [];
      existing.push(metric);
      metricsByName.set(metric.name, existing);
    }

    // Export each metric group
    for (const [name, metrics] of metricsByName.entries()) {
      const fullName = this.config.prefix + name;
      const help = this.metricHelp.get(name) || `Metric ${name}`;
      const type = metrics[0].type;

      // Add HELP and TYPE lines
      lines.push(`# HELP ${fullName} ${help}`);
      lines.push(`# TYPE ${fullName} ${this.mapMetricType(type)}`);

      if (type === 'counter') {
        lines.push(...this.exportCounter(fullName, metrics, timestamp));
      } else if (type === 'gauge') {
        lines.push(...this.exportGauge(fullName, metrics, timestamp));
      } else if (type === 'histogram') {
        lines.push(...this.exportHistogram(fullName, metrics, timestamp));
      }
    }

    // Export custom metrics
    for (const metric of this.customMetrics.values()) {
      if (metric.value !== undefined) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} ${this.mapMetricType(metric.type)}`);
        lines.push(this.formatMetricLine(metric.name, metric.value, metric.labels, timestamp));
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Export counter metrics
   */
  private exportCounter(name: string, metrics: MetricEvent[], timestamp?: number): string[] {
    const lines: string[] = [];
    
    // Group by labels
    const byLabels = this.groupByLabels(metrics);
    
    for (const [labelKey, events] of byLabels.entries()) {
      const sum = events.reduce((acc, e) => acc + e.value, 0);
      const labels = events[0].tags || {};
      lines.push(this.formatMetricLine(name, sum, labels, timestamp));
    }

    return lines;
  }

  /**
   * Export gauge metrics (use latest value)
   */
  private exportGauge(name: string, metrics: MetricEvent[], timestamp?: number): string[] {
    const lines: string[] = [];
    
    // Group by labels
    const byLabels = this.groupByLabels(metrics);
    
    for (const [labelKey, events] of byLabels.entries()) {
      // Use most recent value for gauges
      const latest = events[events.length - 1];
      const labels = latest.tags || {};
      lines.push(this.formatMetricLine(name, latest.value, labels, timestamp));
    }

    return lines;
  }

  /**
   * Export histogram metrics with buckets and quantiles
   */
  private exportHistogram(name: string, metrics: MetricEvent[], timestamp?: number): string[] {
    const lines: string[] = [];
    
    // Group by labels
    const byLabels = this.groupByLabels(metrics);
    
    for (const [labelKey, events] of byLabels.entries()) {
      const values = events.map(e => e.value).sort((a, b) => a - b);
      const labels = events[0].tags || {};
      const sum = values.reduce((acc, v) => acc + v, 0);
      const count = values.length;

      // Export buckets
      for (const bucket of this.config.histogramBuckets) {
        const bucketCount = values.filter(v => v <= bucket).length;
        const bucketLabels = { ...labels, le: bucket.toString() };
        lines.push(this.formatMetricLine(`${name}_bucket`, bucketCount, bucketLabels, timestamp));
      }

      // +Inf bucket
      const infLabels = { ...labels, le: '+Inf' };
      lines.push(this.formatMetricLine(`${name}_bucket`, count, infLabels, timestamp));

      // Sum and count
      lines.push(this.formatMetricLine(`${name}_sum`, sum, labels, timestamp));
      lines.push(this.formatMetricLine(`${name}_count`, count, labels, timestamp));
    }

    return lines;
  }

  /**
   * Group metrics by label combination
   */
  private groupByLabels(metrics: MetricEvent[]): Map<string, MetricEvent[]> {
    const grouped = new Map<string, MetricEvent[]>();
    
    for (const metric of metrics) {
      const key = JSON.stringify(metric.tags || {});
      const existing = grouped.get(key) || [];
      existing.push(metric);
      grouped.set(key, existing);
    }
    
    return grouped;
  }

  /**
   * Format a single metric line
   */
  private formatMetricLine(
    name: string,
    value: number,
    labels?: Record<string, string>,
    timestamp?: number
  ): string {
    const allLabels = { ...this.config.defaultLabels, ...labels };
    const labelStr = this.formatLabels(allLabels);
    const timestampStr = timestamp ? ` ${timestamp}` : '';
    
    return `${name}${labelStr} ${value}${timestampStr}`;
  }

  /**
   * Format labels for Prometheus
   */
  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    
    const formatted = entries
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
      .join(',');
    
    return `{${formatted}}`;
  }

  /**
   * Escape label values
   */
  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Map internal metric type to Prometheus type
   */
  private mapMetricType(type: string): string {
    if (type === 'summary') return 'summary';
    return type; // counter, gauge, histogram map directly
  }

  /**
   * Set a custom metric value
   */
  setMetric(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = this.config.prefix + name;
    const metric = this.customMetrics.get(fullName);
    
    if (metric) {
      metric.value = value;
      metric.labels = labels;
    }
  }

  /**
   * Get metrics endpoint handler (for Hono)
   */
  getHandler() {
    return (c: any) => {
      try {
        const metrics = this.export();
        return c.text(metrics, 200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        });
      } catch (error) {
        this.logger.error('Failed to export Prometheus metrics', error instanceof Error ? error : undefined);
        return c.text('Error exporting metrics', 500);
      }
    };
  }
}

