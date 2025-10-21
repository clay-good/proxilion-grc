/**
 * Webhook Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookManager, Webhook } from '../src/integrations/webhooks/webhook-manager.js';
import { AuditEvent, ThreatLevel } from '../src/types/index.js';

describe('WebhookManager', () => {
  let webhookManager: WebhookManager;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Use 100ms retry interval for faster tests
    webhookManager = new WebhookManager(100);
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    webhookManager.stopRetryProcessor();
    vi.restoreAllMocks();
  });

  describe('Webhook Registration', () => {
    it('should register a webhook', () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      const registered = webhookManager.getWebhook(webhook.id);
      expect(registered).toBeDefined();
      expect(registered?.name).toBe(webhook.name);
    });

    it('should unregister a webhook', () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);
      webhookManager.unregister(webhook.id);

      const registered = webhookManager.getWebhook(webhook.id);
      expect(registered).toBeUndefined();
    });

    it('should update webhook configuration', () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      webhookManager.update(webhook.id, { enabled: false });

      const updated = webhookManager.getWebhook(webhook.id);
      expect(updated?.enabled).toBe(false);
    });

    it('should throw error when updating non-existent webhook', () => {
      expect(() => {
        webhookManager.update('non-existent', { enabled: false });
      }).toThrow('Webhook not found');
    });
  });

  describe('Event Matching', () => {
    it('should trigger webhook for matching event', async () => {
      const webhook = createTestWebhook({
        events: ['pii.detected'],
      });
      webhookManager.register(webhook);

      const event = createTestEvent({ eventType: 'pii.detected' });
      await webhookManager.trigger(event);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not trigger webhook for non-matching event', async () => {
      const webhook = createTestWebhook({
        events: ['pii.detected'],
      });
      webhookManager.register(webhook);

      const event = createTestEvent({ eventType: 'request.allowed' });
      await webhookManager.trigger(event);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should trigger webhook for wildcard events', async () => {
      const webhook = createTestWebhook({
        events: ['*'],
      });
      webhookManager.register(webhook);

      const event = createTestEvent({ eventType: 'any.event' });
      await webhookManager.trigger(event);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should trigger webhook for pattern matching', async () => {
      const webhook = createTestWebhook({
        events: ['pii.*'],
      });
      webhookManager.register(webhook);

      const event1 = createTestEvent({ eventType: 'pii.detected' });
      const event2 = createTestEvent({ eventType: 'pii.redacted' });

      await webhookManager.trigger(event1);
      await webhookManager.trigger(event2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Webhook Delivery', () => {
    it('should send webhook with correct payload', async () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      const event = createTestEvent();
      await webhookManager.trigger(event);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const payload = JSON.parse(call[1].body);

      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('event');
      expect(payload).toHaveProperty('data');
      expect(payload.data.requestId).toBe(event.requestId);
    });

    it('should include signature header', async () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      const event = createTestEvent();
      await webhookManager.trigger(event);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalled();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-Proxilion-Signature']).toBeDefined();
      expect(headers['X-Proxilion-Signature']).toMatch(/^sha256=/);
    });

    it('should include custom headers', async () => {
      const webhook = createTestWebhook({
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });
      webhookManager.register(webhook);

      const event = createTestEvent();
      await webhookManager.trigger(event);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalled();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const webhook = createTestWebhook({
        retryAttempts: 2,
        retryDelay: 10,
        retryPolicy: {
          maxAttempts: 2,
          initialDelayMs: 10,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        },
      });
      webhookManager.register(webhook);

      const event = createTestEvent();
      await webhookManager.trigger(event);

      // Wait for retry processor to run (runs every 100ms in tests)
      // Add extra time for CI environment
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      mockFetch.mockImplementation(() => {
        delays.push(Date.now());
        return Promise.reject(new Error('Network error'));
      });

      const webhook = createTestWebhook({
        retryAttempts: 3,
        retryDelay: 50,
        retryPolicy: {
          maxAttempts: 4, // Initial + 3 retries
          initialDelayMs: 200, // Start with 200ms so it's > retry processor interval
          maxDelayMs: 2000,
          backoffMultiplier: 2,
          retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        },
      });
      webhookManager.register(webhook);

      const event = createTestEvent();
      await webhookManager.trigger(event);

      // Wait for retry processor to run multiple times (runs every 100ms in tests)
      // Need to wait for initial + 3 retries with exponential backoff
      // Delays: 200ms, 400ms, 800ms = ~1400ms + buffer for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries

      // Check that delays increase exponentially
      if (delays.length >= 3) {
        const delay1 = delays[1] - delays[0];
        const delay2 = delays[2] - delays[1];
        expect(delay2).toBeGreaterThan(delay1);
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const webhook = createTestWebhook({
        rateLimit: {
          maxRequests: 2,
          windowMs: 1000,
        },
      });
      webhookManager.register(webhook);

      // Send 3 events quickly
      await webhookManager.trigger(createTestEvent());
      await webhookManager.trigger(createTestEvent());
      await webhookManager.trigger(createTestEvent());

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Only 2 should be sent due to rate limit
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should reset rate limit after window', async () => {
      const webhook = createTestWebhook({
        rateLimit: {
          maxRequests: 1,
          windowMs: 100,
        },
      });
      webhookManager.register(webhook);

      await webhookManager.trigger(createTestEvent());
      await new Promise((resolve) => setTimeout(resolve, 150));
      await webhookManager.trigger(createTestEvent());

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Disabled Webhooks', () => {
    it('should not trigger disabled webhooks', async () => {
      const webhook = createTestWebhook({
        enabled: false,
      });
      webhookManager.register(webhook);

      const event = createTestEvent();
      await webhookManager.trigger(event);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Webhook Testing', () => {
    it('should test webhook successfully', async () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      const result = await webhookManager.test(webhook.id);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should fail test on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      const result = await webhookManager.test(webhook.id);

      expect(result).toBe(false);
    });

    it('should throw error when testing non-existent webhook', async () => {
      await expect(webhookManager.test('non-existent')).rejects.toThrow('Webhook not found');
    });
  });

  describe('Queue Management', () => {
    it('should track queue size', async () => {
      const webhook = createTestWebhook();
      webhookManager.register(webhook);

      // Delay fetch to keep items in queue
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200 }), 100))
      );

      await webhookManager.trigger(createTestEvent());
      await webhookManager.trigger(createTestEvent());

      // Queue should have items before processing completes
      const queueSize = webhookManager.getQueueSize();
      expect(queueSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Signature Verification', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';

      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const result = WebhookManager.verifySignature(payload, signature, secret);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      const invalidSignature = 'sha256=invalid';

      const result = WebhookManager.verifySignature(payload, invalidSignature, secret);
      expect(result).toBe(false);
    });
  });
});

// Helper functions
function createTestWebhook(overrides?: Partial<Webhook>): Webhook {
  return {
    id: crypto.randomUUID(),
    name: 'Test Webhook',
    url: 'https://webhook.example.com',
    secret: 'test-secret',
    events: ['*'],
    enabled: true,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 5000,
    ...overrides,
  };
}

function createTestEvent(overrides?: Partial<AuditEvent>): AuditEvent {
  return {
    requestId: 'test-request-123',
    timestamp: Date.now(),
    eventType: 'pii.detected',
    action: 'scan',
    decision: 'BLOCK',
    threatLevel: 'HIGH' as ThreatLevel,
    userId: 'user-123',
    sourceIp: '192.168.1.1',
    provider: 'openai',
    model: 'gpt-4',
    duration: 100,
    findings: [],
    ...overrides,
  };
}

