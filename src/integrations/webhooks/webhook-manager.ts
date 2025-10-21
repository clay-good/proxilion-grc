/**
 * Webhook Manager
 * 
 * Manages webhooks for custom integrations:
 * - Event-based webhooks
 * - Retry logic with exponential backoff
 * - Signature verification
 * - Rate limiting per webhook
 * - Webhook health monitoring
 */

import { Logger } from '../../utils/logger.js';
import { MetricsCollector } from '../../utils/metrics.js';
import { AuditEvent, ThreatLevel, PolicyAction, LogLevel } from '../../types/index.js';
import crypto from 'crypto';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  headers?: Record<string, string>;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  retryPolicy?: RetryPolicy;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: AuditEvent;
  attempt: number;
  status: 'pending' | 'success' | 'failed' | 'dead-letter';
  statusCode?: number;
  error?: string;
  timestamp: number;
  duration?: number;
  nextRetryAt?: number;
  lastAttemptAt?: number;
}

export class WebhookManager {
  private webhooks: Map<string, Webhook>;
  private deliveryQueue: WebhookDelivery[];
  private logger: Logger;
  private metrics: MetricsCollector;
  private processing: boolean = false;
  private rateLimitState: Map<string, number[]>;
  private deadLetterQueue: WebhookDelivery[] = [];
  private retryQueue: WebhookDelivery[] = [];
  private defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  };
  private retryProcessorInterval: NodeJS.Timeout | null = null;
  private retryProcessorIntervalMs: number;

  constructor(retryProcessorIntervalMs: number = 5000) {
    this.webhooks = new Map();
    this.deliveryQueue = [];
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.rateLimitState = new Map();
    this.retryProcessorIntervalMs = retryProcessorIntervalMs;

    // Start retry processor
    this.startRetryProcessor();
  }

  /**
   * Register a webhook
   */
  register(webhook: Webhook): void {
    this.webhooks.set(webhook.id, webhook);
    this.logger.info('Webhook registered', {
      id: webhook.id,
      name: webhook.name,
      events: webhook.events,
    });
  }

  /**
   * Unregister a webhook
   */
  unregister(webhookId: string): void {
    this.webhooks.delete(webhookId);
    this.rateLimitState.delete(webhookId);
    this.logger.info('Webhook unregistered', { id: webhookId });
  }

  /**
   * Update webhook configuration
   */
  update(webhookId: string, updates: Partial<Webhook>): void {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const updated = { ...webhook, ...updates };
    this.webhooks.set(webhookId, updated);
    this.logger.info('Webhook updated', { id: webhookId });
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(event: AuditEvent): Promise<void> {
    const matchingWebhooks = this.findMatchingWebhooks(event);

    if (matchingWebhooks.length === 0) {
      return;
    }

    for (const webhook of matchingWebhooks) {
      if (!webhook.enabled) {
        continue;
      }

      // Check rate limit
      if (webhook.rateLimit && !this.checkRateLimit(webhook)) {
        this.logger.warn('Webhook rate limit exceeded', {
          webhookId: webhook.id,
          name: webhook.name,
        });
        this.metrics.increment('webhook_rate_limited_total');
        continue;
      }

      const delivery: WebhookDelivery = {
        id: crypto.randomUUID(),
        webhookId: webhook.id,
        event,
        attempt: 0,
        status: 'pending',
        timestamp: Date.now(),
      };

      this.deliveryQueue.push(delivery);
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Find webhooks matching the event
   */
  private findMatchingWebhooks(event: AuditEvent): Webhook[] {
    const matching: Webhook[] = [];

    for (const webhook of this.webhooks.values()) {
      const eventType = event.eventType || 'unknown';
      // Check if webhook is interested in this event type
      if (webhook.events.includes('*') || webhook.events.includes(eventType)) {
        matching.push(webhook);
      }

      // Check for wildcard patterns
      for (const pattern of webhook.events) {
        if (pattern.endsWith('.*')) {
          const prefix = pattern.slice(0, -2);
          if (eventType.startsWith(prefix)) {
            matching.push(webhook);
            break;
          }
        }
      }
    }

    return matching;
  }

  /**
   * Check rate limit for webhook
   */
  private checkRateLimit(webhook: Webhook): boolean {
    if (!webhook.rateLimit) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - webhook.rateLimit.windowMs;

    // Get or initialize rate limit state
    let requests = this.rateLimitState.get(webhook.id) || [];

    // Remove old requests outside the window
    requests = requests.filter((timestamp) => timestamp > windowStart);

    // Check if limit exceeded
    if (requests.length >= webhook.rateLimit.maxRequests) {
      return false;
    }

    // Add current request
    requests.push(now);
    this.rateLimitState.set(webhook.id, requests);

    return true;
  }

  /**
   * Process delivery queue
   */
  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.deliveryQueue.length > 0) {
      const delivery = this.deliveryQueue.shift()!;
      await this.deliverWebhook(delivery);
    }

    this.processing = false;
  }

  /**
   * Deliver webhook with retry logic
   */
  private async deliverWebhook(delivery: WebhookDelivery): Promise<void> {
    const webhook = this.webhooks.get(delivery.webhookId);
    if (!webhook) {
      this.logger.warn('Webhook not found for delivery', {
        deliveryId: delivery.id,
        webhookId: delivery.webhookId,
      });
      return;
    }

    delivery.attempt = (delivery.attempt || 0) + 1;

    try {
      const startTime = Date.now();
      const response = await this.sendWebhook(webhook, delivery.event);
      const duration = Date.now() - startTime;

      delivery.status = 'success';
      delivery.statusCode = response.status;
      delivery.duration = duration;

      this.logger.info('Webhook delivered successfully', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        duration,
      });

      this.metrics.increment('webhook_delivery_success_total');
      this.metrics.histogram('webhook_delivery_duration_ms', duration);
    } catch (error) {
      delivery.error = error instanceof Error ? error.message : String(error);
      delivery.status = 'failed';
      delivery.lastAttemptAt = Date.now();

      this.logger.warn('Webhook delivery failed', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        error: delivery.error,
        attempt: delivery.attempt,
      });

      // Add to retry queue with exponential backoff
      const retryPolicy = webhook.retryPolicy || this.defaultRetryPolicy;
      delivery.nextRetryAt = this.calculateNextRetry(delivery, retryPolicy);
      this.retryQueue.push(delivery);

      this.metrics.increment('webhook_delivery_failed_total');
    }
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhook(webhook: Webhook, event: AuditEvent): Promise<Response> {
    const payload = this.createPayload(event);
    const signature = this.generateSignature(payload, webhook.secret);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Proxilion-Signature': signature,
          'X-Proxilion-Event': event.eventType || 'unknown',
          'X-Proxilion-Delivery': crypto.randomUUID(),
          'User-Agent': 'Proxilion-Webhook/0.1.0',
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Create webhook payload
   */
  private createPayload(event: AuditEvent): Record<string, any> {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(event.timestamp).toISOString(),
      event: event.eventType,
      data: {
        requestId: event.requestId,
        userId: event.userId,
        sourceIp: event.sourceIp,
        provider: event.provider,
        model: event.model,
        action: event.action,
        decision: event.decision,
        threatLevel: event.threatLevel,
        findings: event.findings,
        policyId: event.policyId,
        duration: event.duration,
      },
    };
  }

  /**
   * Generate HMAC signature for webhook
   */
  private generateSignature(payload: Record<string, any>, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verify webhook signature
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expected = `sha256=${hmac.digest('hex')}`;

    // Ensure both buffers are the same length for timingSafeEqual
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  }

  /**
   * Get all webhooks
   */
  getWebhooks(): Webhook[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId: string): Webhook | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.deliveryQueue.length;
  }

  /**
   * Test webhook
   */
  async test(webhookId: string): Promise<boolean> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const testEvent: AuditEvent = {
      id: crypto.randomUUID(),
      requestId: 'test-' + crypto.randomUUID(),
      timestamp: Date.now(),
      level: LogLevel.INFO,
      type: 'webhook',
      message: 'Webhook test event',
      correlationId: crypto.randomUUID(),
      eventType: 'webhook.test',
      action: 'test',
      decision: PolicyAction.LOG,
      threatLevel: ThreatLevel.NONE as ThreatLevel,
      duration: 0,
    };

    try {
      await this.sendWebhook(webhook, testEvent);
      return true;
    } catch (error) {
      this.logger.error('Webhook test failed', error as Error, { webhookId });
      return false;
    }
  }

  /**
   * Start retry processor
   */
  private startRetryProcessor(): void {
    this.retryProcessorInterval = setInterval(() => {
      this.processRetries();
    }, this.retryProcessorIntervalMs);
  }

  /**
   * Stop retry processor (for testing)
   */
  public stopRetryProcessor(): void {
    if (this.retryProcessorInterval) {
      clearInterval(this.retryProcessorInterval);
      this.retryProcessorInterval = null;
    }
  }

  /**
   * Process retry queue
   */
  private async processRetries(): Promise<void> {
    const now = Date.now();
    const readyToRetry = this.retryQueue.filter(
      (delivery) => delivery.nextRetryAt && delivery.nextRetryAt <= now
    );

    for (const delivery of readyToRetry) {
      const webhook = this.webhooks.get(delivery.webhookId);
      if (!webhook) {
        this.moveToDeadLetterQueue(delivery, 'Webhook not found');
        continue;
      }

      const retryPolicy = webhook.retryPolicy || this.defaultRetryPolicy;

      if (delivery.attempt >= retryPolicy.maxAttempts) {
        this.moveToDeadLetterQueue(delivery, 'Max retry attempts exceeded');
        continue;
      }

      try {
        await this.sendWebhook(webhook, delivery.event);
        delivery.status = 'success';
        this.removeFromRetryQueue(delivery.id);
        this.logger.info('Webhook retry succeeded', {
          deliveryId: delivery.id,
          attempt: delivery.attempt,
        });
      } catch (error) {
        delivery.attempt++;
        delivery.lastAttemptAt = now;
        delivery.error = error instanceof Error ? error.message : String(error);

        if (this.shouldRetry(delivery, retryPolicy)) {
          delivery.nextRetryAt = this.calculateNextRetry(delivery, retryPolicy);
          this.logger.warn('Webhook retry failed, will retry', {
            deliveryId: delivery.id,
            attempt: delivery.attempt,
            nextRetryAt: delivery.nextRetryAt,
          });
        } else {
          this.moveToDeadLetterQueue(delivery, 'Non-retryable error or max attempts');
        }
      }
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(delivery: WebhookDelivery, policy: RetryPolicy): number {
    const delay = Math.min(
      policy.initialDelayMs * Math.pow(policy.backoffMultiplier, delivery.attempt - 1),
      policy.maxDelayMs
    );
    return Date.now() + delay;
  }

  /**
   * Check if delivery should be retried
   */
  private shouldRetry(delivery: WebhookDelivery, policy: RetryPolicy): boolean {
    if (delivery.attempt >= policy.maxAttempts) {
      return false;
    }

    if (delivery.statusCode && !policy.retryableStatusCodes.includes(delivery.statusCode)) {
      return false;
    }

    return true;
  }

  /**
   * Move delivery to dead letter queue
   */
  private moveToDeadLetterQueue(delivery: WebhookDelivery, reason: string): void {
    delivery.status = 'dead-letter';
    delivery.error = reason;
    this.deadLetterQueue.push(delivery);
    this.removeFromRetryQueue(delivery.id);

    this.logger.error('Webhook moved to dead letter queue', undefined, {
      deliveryId: delivery.id,
      reason,
      attempts: delivery.attempt,
    });

    this.metrics.increment('webhook.dead_letter');
  }

  /**
   * Remove delivery from retry queue
   */
  private removeFromRetryQueue(deliveryId: string): void {
    const index = this.retryQueue.findIndex((d) => d.id === deliveryId);
    if (index >= 0) {
      this.retryQueue.splice(index, 1);
    }
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(): WebhookDelivery[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Get retry queue
   */
  getRetryQueue(): WebhookDelivery[] {
    return [...this.retryQueue];
  }

  /**
   * Requeue delivery from dead letter queue
   */
  requeueFromDeadLetter(deliveryId: string): void {
    const index = this.deadLetterQueue.findIndex((d) => d.id === deliveryId);
    if (index >= 0) {
      const delivery = this.deadLetterQueue[index];
      delivery.status = 'pending';
      delivery.attempt = 0;
      delivery.nextRetryAt = Date.now();
      this.retryQueue.push(delivery);
      this.deadLetterQueue.splice(index, 1);

      this.logger.info('Delivery requeued from dead letter queue', {
        deliveryId,
      });
    }
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): void {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    this.logger.info('Dead letter queue cleared', { count });
  }
}

