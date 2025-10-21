/**
 * OpenTelemetry Distributed Tracing
 * 
 * Provides distributed tracing with:
 * - Span creation and management
 * - Context propagation (W3C Trace Context)
 * - Automatic instrumentation
 * - Span attributes and events
 * - Error tracking
 * - Integration with Jaeger, Zipkin, etc.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
export type SpanStatus = 'UNSET' | 'OK' | 'ERROR';

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | string[] | number[] | boolean[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  statusMessage?: string;
  attributes: SpanAttributes;
  events: SpanEvent[];
  
  // Methods
  setAttribute(key: string, value: string | number | boolean): void;
  setAttributes(attributes: SpanAttributes): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(): void;
}

export interface TracerConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  exporterEndpoint?: string;
  exporterType?: 'jaeger' | 'zipkin' | 'otlp' | 'console';
  samplingRate?: number; // 0-1, 1 = trace everything
  maxSpansPerTrace?: number;
  exportBatchSize?: number;
  exportInterval?: number; // ms
}

export class OpenTelemetryTracer {
  private config: Required<TracerConfig>;
  private logger: Logger;
  private metrics: MetricsCollector;
  private spans: Map<string, SpanImpl>;
  private activeSpans: Map<string, string>; // contextId -> spanId
  private exportQueue: SpanImpl[];
  private exportTimer: NodeJS.Timeout | null = null;

  constructor(config: TracerConfig) {
    this.config = {
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion || '1.0.0',
      environment: config.environment || 'production',
      exporterEndpoint: config.exporterEndpoint || 'http://localhost:14268/api/traces',
      exporterType: config.exporterType || 'jaeger',
      samplingRate: config.samplingRate ?? 1.0,
      maxSpansPerTrace: config.maxSpansPerTrace || 1000,
      exportBatchSize: config.exportBatchSize || 100,
      exportInterval: config.exportInterval || 5000,
    };

    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.spans = new Map();
    this.activeSpans = new Map();
    this.exportQueue = [];

    this.startExportTimer();
  }

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    options: {
      kind?: SpanKind;
      parentSpanId?: string;
      attributes?: SpanAttributes;
    } = {}
  ): Span {
    // Check sampling
    if (Math.random() > this.config.samplingRate) {
      return this.createNoOpSpan(name);
    }

    const traceId = options.parentSpanId 
      ? this.getTraceIdForSpan(options.parentSpanId)
      : this.generateTraceId();
    
    const spanId = this.generateSpanId();

    const span = new SpanImpl(
      spanId,
      traceId,
      name,
      options.kind || 'INTERNAL',
      options.parentSpanId,
      options.attributes,
      this
    );

    this.spans.set(spanId, span);
    this.metrics.increment('otel_spans_started_total', 1, { span_kind: options.kind || 'INTERNAL' });

    this.logger.debug('Span started', {
      traceId,
      spanId,
      name,
      parentSpanId: options.parentSpanId,
    });

    return span;
  }

  /**
   * Get active span for current context
   */
  getActiveSpan(contextId: string = 'default'): Span | undefined {
    const spanId = this.activeSpans.get(contextId);
    if (!spanId) return undefined;
    return this.spans.get(spanId);
  }

  /**
   * Set active span for context
   */
  setActiveSpan(span: Span, contextId: string = 'default'): void {
    this.activeSpans.set(contextId, span.spanId);
  }

  /**
   * Extract trace context from headers (W3C Trace Context)
   */
  extractContext(headers: Record<string, string>): SpanContext | undefined {
    const traceparent = headers['traceparent'];
    if (!traceparent) return undefined;

    const parts = traceparent.split('-');
    if (parts.length !== 4) return undefined;

    const [version, traceId, spanId, traceFlags] = parts;
    
    return {
      traceId,
      spanId,
      traceFlags: parseInt(traceFlags, 16),
      traceState: headers['tracestate'],
    };
  }

  /**
   * Inject trace context into headers (W3C Trace Context)
   */
  injectContext(span: Span, headers: Record<string, string>): void {
    const traceFlags = '01'; // Sampled
    headers['traceparent'] = `00-${span.traceId}-${span.spanId}-${traceFlags}`;
  }

  /**
   * Mark span as complete and queue for export
   */
  endSpan(span: SpanImpl): void {
    span.endTime = Date.now();
    
    this.exportQueue.push(span);
    this.metrics.increment('otel_spans_ended_total', 1, { 
      span_kind: span.kind,
      status: span.status,
    });

    // Export if batch is full
    if (this.exportQueue.length >= this.config.exportBatchSize) {
      this.exportBatch();
    }
  }

  /**
   * Export batch of spans
   */
  private async exportBatch(): Promise<void> {
    if (this.exportQueue.length === 0) return;

    const batch = this.exportQueue.splice(0, this.config.exportBatchSize);

    try {
      if (this.config.exporterType === 'console') {
        this.exportToConsole(batch);
      } else if (this.config.exporterType === 'jaeger') {
        await this.exportToJaeger(batch);
      } else if (this.config.exporterType === 'zipkin') {
        await this.exportToZipkin(batch);
      } else if (this.config.exporterType === 'otlp') {
        await this.exportToOTLP(batch);
      }

      this.metrics.increment('otel_spans_exported_total', batch.length);
      this.logger.debug('Exported span batch', { count: batch.length });
    } catch (error) {
      this.logger.error('Failed to export spans', error instanceof Error ? error : undefined, { count: batch.length });
      this.metrics.increment('otel_export_errors_total', 1);
      
      // Re-queue failed spans (up to a limit)
      if (this.exportQueue.length < this.config.maxSpansPerTrace) {
        this.exportQueue.unshift(...batch);
      }
    }
  }

  /**
   * Export to console (for debugging)
   */
  private exportToConsole(spans: SpanImpl[]): void {
    for (const span of spans) {
      console.log('[TRACE]', {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: span.kind,
        duration: span.endTime ? span.endTime - span.startTime : 0,
        status: span.status,
        attributes: span.attributes,
        events: span.events,
      });
    }
  }

  /**
   * Export to Jaeger
   */
  private async exportToJaeger(spans: SpanImpl[]): Promise<void> {
    const jaegerSpans = spans.map(span => ({
      traceIdLow: span.traceId.slice(-16),
      traceIdHigh: span.traceId.slice(0, 16),
      spanId: span.spanId,
      parentSpanId: span.parentSpanId || '0',
      operationName: span.name,
      startTime: span.startTime * 1000, // microseconds
      duration: span.endTime ? (span.endTime - span.startTime) * 1000 : 0,
      tags: this.attributesToTags(span.attributes),
      logs: span.events.map(e => ({
        timestamp: e.timestamp * 1000,
        fields: this.attributesToTags(e.attributes || {}),
      })),
    }));

    const payload = {
      process: {
        serviceName: this.config.serviceName,
        tags: [
          { key: 'service.version', vStr: this.config.serviceVersion },
          { key: 'environment', vStr: this.config.environment },
        ],
      },
      spans: jaegerSpans,
    };

    // In production, would send to Jaeger endpoint
    // For now, just log
    this.logger.debug('Would export to Jaeger', { spanCount: spans.length });
  }

  /**
   * Export to Zipkin
   */
  private async exportToZipkin(spans: SpanImpl[]): Promise<void> {
    // Zipkin format implementation
    this.logger.debug('Would export to Zipkin', { spanCount: spans.length });
  }

  /**
   * Export to OTLP (OpenTelemetry Protocol)
   */
  private async exportToOTLP(spans: SpanImpl[]): Promise<void> {
    // OTLP format implementation
    this.logger.debug('Would export to OTLP', { spanCount: spans.length });
  }

  /**
   * Convert attributes to Jaeger tags
   */
  private attributesToTags(attributes: SpanAttributes): any[] {
    return Object.entries(attributes).map(([key, value]) => {
      if (typeof value === 'string') {
        return { key, vStr: value };
      } else if (typeof value === 'number') {
        return { key, vDouble: value };
      } else if (typeof value === 'boolean') {
        return { key, vBool: value };
      }
      return { key, vStr: String(value) };
    });
  }

  /**
   * Generate trace ID (32 hex characters)
   */
  private generateTraceId(): string {
    return this.generateHex(32);
  }

  /**
   * Generate span ID (16 hex characters)
   */
  private generateSpanId(): string {
    return this.generateHex(16);
  }

  /**
   * Generate random hex string
   */
  private generateHex(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
  }

  /**
   * Get trace ID for a span
   */
  private getTraceIdForSpan(spanId: string): string {
    const span = this.spans.get(spanId);
    return span?.traceId || this.generateTraceId();
  }

  /**
   * Create no-op span (when not sampled)
   */
  private createNoOpSpan(name: string): Span {
    return new NoOpSpan(name);
  }

  /**
   * Start export timer
   */
  private startExportTimer(): void {
    this.exportTimer = setInterval(() => {
      this.exportBatch();
    }, this.config.exportInterval);
  }

  /**
   * Stop tracer and export remaining spans
   */
  async stop(): Promise<void> {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }

    await this.exportBatch();
  }
}

/**
 * Span implementation
 */
class SpanImpl implements Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus = 'UNSET';
  statusMessage?: string;
  attributes: SpanAttributes = {};
  events: SpanEvent[] = [];
  
  private tracer: OpenTelemetryTracer;

  constructor(
    spanId: string,
    traceId: string,
    name: string,
    kind: SpanKind,
    parentSpanId: string | undefined,
    attributes: SpanAttributes | undefined,
    tracer: OpenTelemetryTracer
  ) {
    this.spanId = spanId;
    this.traceId = traceId;
    this.name = name;
    this.kind = kind;
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
    this.tracer = tracer;
    
    if (attributes) {
      this.attributes = { ...attributes };
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setAttributes(attributes: SpanAttributes): void {
    Object.assign(this.attributes, attributes);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  setStatus(status: SpanStatus, message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  end(): void {
    this.tracer.endSpan(this);
  }
}

/**
 * No-op span (when not sampled)
 */
class NoOpSpan implements Span {
  spanId = '';
  traceId = '';
  name: string;
  kind: SpanKind = 'INTERNAL';
  startTime = Date.now();
  status: SpanStatus = 'UNSET';
  attributes: SpanAttributes = {};
  events: SpanEvent[] = [];

  constructor(name: string) {
    this.name = name;
  }

  setAttribute(): void {}
  setAttributes(): void {}
  addEvent(): void {}
  setStatus(): void {}
  end(): void {}
}

