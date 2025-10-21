/**
 * Tests for Observability Stack
 * - Prometheus metrics exporter
 * - OpenTelemetry distributed tracing
 * - Grafana dashboard definitions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrometheusExporter } from '../src/observability/prometheus-exporter.js';
import { OpenTelemetryTracer } from '../src/observability/opentelemetry-tracer.js';
import { GrafanaDashboardGenerator } from '../src/observability/grafana-dashboards.js';
import { MetricsCollector } from '../src/utils/metrics.js';

describe('PrometheusExporter', () => {
  let exporter: PrometheusExporter;
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = MetricsCollector.getInstance();
    metrics.clear();
    exporter = new PrometheusExporter({
      prefix: 'test_',
      defaultLabels: { environment: 'test' },
    });
  });

  describe('Counter Metrics', () => {
    it('should export counter metrics', () => {
      metrics.counter('requests_total', 5, { method: 'GET' });
      metrics.counter('requests_total', 3, { method: 'POST' });

      const output = exporter.export();

      expect(output).toContain('# HELP test_requests_total');
      expect(output).toContain('# TYPE test_requests_total counter');
      expect(output).toContain('test_requests_total{environment="test",method="GET"} 5');
      expect(output).toContain('test_requests_total{environment="test",method="POST"} 3');
    });

    it('should aggregate counter values with same labels', () => {
      metrics.counter('requests_total', 5);
      metrics.counter('requests_total', 3);
      metrics.counter('requests_total', 2);

      const output = exporter.export();

      expect(output).toContain('test_requests_total{environment="test"} 10');
    });
  });

  describe('Gauge Metrics', () => {
    it('should export gauge metrics with latest value', () => {
      metrics.gauge('active_connections', 10);
      metrics.gauge('active_connections', 15);
      metrics.gauge('active_connections', 12);

      const output = exporter.export();

      expect(output).toContain('# TYPE test_active_connections gauge');
      expect(output).toContain('test_active_connections{environment="test"} 12');
    });

    it('should export gauges with labels', () => {
      metrics.gauge('queue_size', 100, { queue: 'high_priority' });
      metrics.gauge('queue_size', 50, { queue: 'low_priority' });

      const output = exporter.export();

      expect(output).toContain('test_queue_size{environment="test",queue="high_priority"} 100');
      expect(output).toContain('test_queue_size{environment="test",queue="low_priority"} 50');
    });
  });

  describe('Histogram Metrics', () => {
    it('should export histogram with buckets', () => {
      metrics.histogram('request_duration_seconds', 0.1);
      metrics.histogram('request_duration_seconds', 0.5);
      metrics.histogram('request_duration_seconds', 1.5);
      metrics.histogram('request_duration_seconds', 3.0);

      const output = exporter.export();

      expect(output).toContain('# TYPE test_request_duration_seconds histogram');
      expect(output).toContain('test_request_duration_seconds_bucket{environment="test",le="0.1"}');
      expect(output).toContain('test_request_duration_seconds_bucket{environment="test",le="1"}');
      expect(output).toContain('test_request_duration_seconds_bucket{environment="test",le="+Inf"} 4');
      expect(output).toContain('test_request_duration_seconds_sum');
      expect(output).toContain('test_request_duration_seconds_count{environment="test"} 4');
    });
  });

  describe('Label Escaping', () => {
    it('should escape special characters in labels', () => {
      metrics.counter('requests_total', 1, { path: '/api/test"with\\quotes\nand\nnewlines' });

      const output = exporter.export();

      expect(output).toContain('path="/api/test\\"with\\\\quotes\\nand\\nnewlines"');
    });
  });

  describe('Custom Metrics', () => {
    it('should register and export custom metrics', () => {
      exporter.registerMetric('custom_metric', 'gauge', 'A custom metric for testing');
      exporter.setMetric('custom_metric', 42, { type: 'test' });

      const output = exporter.export();

      expect(output).toContain('# HELP test_custom_metric A custom metric for testing');
      expect(output).toContain('# TYPE test_custom_metric gauge');
      expect(output).toContain('test_custom_metric{environment="test",type="test"} 42');
    });
  });

  describe('Handler', () => {
    it('should return metrics via handler', () => {
      metrics.counter('requests_total', 10);

      const handler = exporter.getHandler();
      const mockContext = {
        text: (body: string, status: number, headers: any) => {
          expect(status).toBe(200);
          expect(headers['Content-Type']).toContain('text/plain');
          expect(body).toContain('test_requests_total');
          return { body, status, headers };
        },
      };

      handler(mockContext);
    });
  });
});

describe('OpenTelemetryTracer', () => {
  let tracer: OpenTelemetryTracer;

  beforeEach(() => {
    tracer = new OpenTelemetryTracer({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      environment: 'test',
      exporterType: 'console',
      samplingRate: 1.0,
    });
  });

  afterEach(async () => {
    await tracer.stop();
  });

  describe('Span Creation', () => {
    it('should create a span with trace ID and span ID', () => {
      const span = tracer.startSpan('test-operation');

      expect(span.spanId).toBeTruthy();
      expect(span.traceId).toBeTruthy();
      expect(span.name).toBe('test-operation');
      expect(span.kind).toBe('INTERNAL');
      expect(span.status).toBe('UNSET');

      span.end();
    });

    it('should create child spans with same trace ID', () => {
      const parentSpan = tracer.startSpan('parent-operation');
      const childSpan = tracer.startSpan('child-operation', {
        parentSpanId: parentSpan.spanId,
      });

      expect(childSpan.traceId).toBe(parentSpan.traceId);
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);

      childSpan.end();
      parentSpan.end();
    });

    it('should create spans with different kinds', () => {
      const serverSpan = tracer.startSpan('server-op', { kind: 'SERVER' });
      const clientSpan = tracer.startSpan('client-op', { kind: 'CLIENT' });

      expect(serverSpan.kind).toBe('SERVER');
      expect(clientSpan.kind).toBe('CLIENT');

      serverSpan.end();
      clientSpan.end();
    });
  });

  describe('Span Attributes', () => {
    it('should set attributes on span', () => {
      const span = tracer.startSpan('test-operation');

      span.setAttribute('http.method', 'GET');
      span.setAttribute('http.status_code', 200);
      span.setAttribute('http.url', '/api/test');

      expect(span.attributes['http.method']).toBe('GET');
      expect(span.attributes['http.status_code']).toBe(200);
      expect(span.attributes['http.url']).toBe('/api/test');

      span.end();
    });

    it('should set multiple attributes at once', () => {
      const span = tracer.startSpan('test-operation');

      span.setAttributes({
        'user.id': 'user123',
        'user.role': 'admin',
        'request.size': 1024,
      });

      expect(span.attributes['user.id']).toBe('user123');
      expect(span.attributes['user.role']).toBe('admin');
      expect(span.attributes['request.size']).toBe(1024);

      span.end();
    });

    it('should set attributes during span creation', () => {
      const span = tracer.startSpan('test-operation', {
        attributes: {
          'service.name': 'api',
          'service.version': '1.0.0',
        },
      });

      expect(span.attributes['service.name']).toBe('api');
      expect(span.attributes['service.version']).toBe('1.0.0');

      span.end();
    });
  });

  describe('Span Events', () => {
    it('should add events to span', () => {
      const span = tracer.startSpan('test-operation');

      span.addEvent('cache-miss');
      span.addEvent('database-query', { query: 'SELECT * FROM users' });

      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('cache-miss');
      expect(span.events[1].name).toBe('database-query');
      expect(span.events[1].attributes?.query).toBe('SELECT * FROM users');

      span.end();
    });
  });

  describe('Span Status', () => {
    it('should set span status', () => {
      const span = tracer.startSpan('test-operation');

      span.setStatus('OK');
      expect(span.status).toBe('OK');

      span.end();
    });

    it('should set error status with message', () => {
      const span = tracer.startSpan('test-operation');

      span.setStatus('ERROR', 'Database connection failed');
      expect(span.status).toBe('ERROR');
      expect(span.statusMessage).toBe('Database connection failed');

      span.end();
    });
  });

  describe('Context Propagation', () => {
    it('should extract context from headers', () => {
      const headers = {
        'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      const context = tracer.extractContext(headers);

      expect(context).toBeDefined();
      expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(context?.spanId).toBe('b7ad6b7169203331');
      expect(context?.traceFlags).toBe(1);
    });

    it('should inject context into headers', () => {
      const span = tracer.startSpan('test-operation');
      const headers: Record<string, string> = {};

      tracer.injectContext(span, headers);

      expect(headers['traceparent']).toBeDefined();
      expect(headers['traceparent']).toContain(span.traceId);
      expect(headers['traceparent']).toContain(span.spanId);

      span.end();
    });
  });

  describe('Active Span Management', () => {
    it('should set and get active span', () => {
      const span = tracer.startSpan('test-operation');

      tracer.setActiveSpan(span, 'request-123');
      const activeSpan = tracer.getActiveSpan('request-123');

      expect(activeSpan).toBeDefined();
      expect(activeSpan?.spanId).toBe(span.spanId);

      span.end();
    });
  });

  describe('Sampling', () => {
    it('should respect sampling rate', () => {
      const sampledTracer = new OpenTelemetryTracer({
        serviceName: 'test-service',
        exporterType: 'console',
        samplingRate: 0.0, // Never sample
      });

      const span = sampledTracer.startSpan('test-operation');

      // No-op span should have empty IDs
      expect(span.spanId).toBe('');
      expect(span.traceId).toBe('');

      span.end();
    });
  });
});

describe('GrafanaDashboardGenerator', () => {
  describe('Security Dashboard', () => {
    it('should generate security monitoring dashboard', () => {
      const dashboard = GrafanaDashboardGenerator.generateSecurityDashboard();

      expect(dashboard.title).toBe('Proxilion - Security Monitoring');
      expect(dashboard.tags).toContain('security');
      expect(dashboard.panels.length).toBeGreaterThan(0);

      // Check for key panels
      const threatPanel = dashboard.panels.find(p => p.title === 'Threats Detected');
      expect(threatPanel).toBeDefined();
      expect(threatPanel?.type).toBe('graph');

      const blockedPanel = dashboard.panels.find(p => p.title === 'Blocked Requests');
      expect(blockedPanel).toBeDefined();
    });
  });

  describe('Performance Dashboard', () => {
    it('should generate performance monitoring dashboard', () => {
      const dashboard = GrafanaDashboardGenerator.generatePerformanceDashboard();

      expect(dashboard.title).toBe('Proxilion - Performance Metrics');
      expect(dashboard.tags).toContain('performance');

      // Check for latency panel with quantiles
      const latencyPanel = dashboard.panels.find(p => p.title === 'Request Latency');
      expect(latencyPanel).toBeDefined();
      expect(latencyPanel?.targets.length).toBeGreaterThanOrEqual(3); // p50, p95, p99

      // Check for cache hit ratio
      const cachePanel = dashboard.panels.find(p => p.title === 'Cache Hit Ratio');
      expect(cachePanel).toBeDefined();
      expect(cachePanel?.type).toBe('gauge');
    });
  });

  describe('Cost Dashboard', () => {
    it('should generate cost tracking dashboard', () => {
      const dashboard = GrafanaDashboardGenerator.generateCostDashboard();

      expect(dashboard.title).toBe('Proxilion - Cost Tracking');
      expect(dashboard.tags).toContain('cost');

      // Check for total cost panel
      const costPanel = dashboard.panels.find(p => p.title === 'Total Cost (24h)');
      expect(costPanel).toBeDefined();
      expect(costPanel?.type).toBe('stat');

      // Check for cost by provider
      const providerPanel = dashboard.panels.find(p => p.title === 'Cost by Provider');
      expect(providerPanel).toBeDefined();
    });
  });

  describe('Compliance Dashboard', () => {
    it('should generate compliance overview dashboard', () => {
      const dashboard = GrafanaDashboardGenerator.generateComplianceDashboard();

      expect(dashboard.title).toBe('Proxilion - Compliance Overview');
      expect(dashboard.tags).toContain('compliance');

      // Check for compliance score
      const scorePanel = dashboard.panels.find(p => p.title === 'Compliance Score');
      expect(scorePanel).toBeDefined();
      expect(scorePanel?.type).toBe('gauge');
    });
  });

  describe('Export All', () => {
    it('should export all dashboards', () => {
      const dashboards = GrafanaDashboardGenerator.exportAll();

      expect(dashboards.security).toBeDefined();
      expect(dashboards.performance).toBeDefined();
      expect(dashboards.cost).toBeDefined();
      expect(dashboards.compliance).toBeDefined();

      expect(Object.keys(dashboards)).toHaveLength(4);
    });
  });
});

