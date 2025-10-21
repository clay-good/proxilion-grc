/**
 * SIEM Forwarder Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SIEMForwarder } from '../src/integrations/siem/siem-forwarder.js';
import { AuditEvent, ThreatLevel } from '../src/types/index.js';

describe('SIEMForwarder', () => {
  let siemForwarder: SIEMForwarder;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    if (siemForwarder) {
      siemForwarder.stop();
    }
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      siemForwarder = new SIEMForwarder();
      const config = siemForwarder.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.vendor).toBe('GENERIC');
      expect(config.format).toBe('JSON');
      expect(config.batchSize).toBe(100);
    });

    it('should initialize with custom config', () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        vendor: 'SPLUNK',
        format: 'CEF',
        endpoint: 'https://siem.example.com',
        batchSize: 50,
      });

      const config = siemForwarder.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.vendor).toBe('SPLUNK');
      expect(config.format).toBe('CEF');
      expect(config.batchSize).toBe(50);
    });
  });

  describe('Event Forwarding', () => {
    it('should not forward when disabled', async () => {
      siemForwarder = new SIEMForwarder({ enabled: false });

      const event: AuditEvent = createTestEvent();
      await siemForwarder.forward(event);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should queue events for batching', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        endpoint: 'https://siem.example.com',
        batchSize: 10,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);

      expect(siemForwarder.getQueueSize()).toBe(1);
    });

    it('should flush when batch size reached', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        endpoint: 'https://siem.example.com',
        batchSize: 2,
      });

      await siemForwarder.forward(createTestEvent());
      await siemForwarder.forward(createTestEvent());

      // Wait for async flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalled();
      expect(siemForwarder.getQueueSize()).toBe(0);
    });
  });

  describe('Format: CEF', () => {
    it('should format event as CEF', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        format: 'CEF',
        endpoint: 'https://siem.example.com',
        batchSize: 1,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalled();
      const payload = mockFetch.mock.calls[0][1].body;
      expect(payload).toContain('CEF:0');
      expect(payload).toContain('Proxilion');
      expect(payload).toContain('AI Security Proxy');
    });
  });

  describe('Format: LEEF', () => {
    it('should format event as LEEF', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        format: 'LEEF',
        endpoint: 'https://siem.example.com',
        batchSize: 1,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalled();
      const payload = mockFetch.mock.calls[0][1].body;
      expect(payload).toContain('LEEF:2.0');
      expect(payload).toContain('Proxilion');
    });
  });

  describe('Format: JSON', () => {
    it('should format event as JSON', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        format: 'JSON',
        endpoint: 'https://siem.example.com',
        batchSize: 1,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalled();
      const payload = mockFetch.mock.calls[0][1].body;
      const parsed = JSON.parse(payload);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty('timestamp');
      expect(parsed[0]).toHaveProperty('severity');
      expect(parsed[0]).toHaveProperty('category');
    });
  });

  describe('Format: Syslog', () => {
    it('should format event as Syslog', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        format: 'SYSLOG',
        endpoint: 'https://siem.example.com',
        batchSize: 1,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalled();
      const payload = mockFetch.mock.calls[0][1].body;
      expect(payload).toMatch(/^<\d+>1 /); // Syslog priority and version
    });
  });

  describe('Retry Logic', () => {
    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      siemForwarder = new SIEMForwarder({
        enabled: true,
        endpoint: 'https://siem.example.com',
        batchSize: 1,
        retryAttempts: 3,
        retryDelay: 10,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      siemForwarder = new SIEMForwarder({
        enabled: true,
        endpoint: 'https://siem.example.com',
        batchSize: 1,
        retryAttempts: 2,
        retryDelay: 10,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Threat Level Mapping', () => {
    it('should map threat levels to severity correctly', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        format: 'JSON',
        endpoint: 'https://siem.example.com',
        batchSize: 1,
      });

      const testCases: Array<[ThreatLevel, number]> = [
        [ThreatLevel.NONE, 0],
        [ThreatLevel.LOW, 3],
        [ThreatLevel.MEDIUM, 5],
        [ThreatLevel.HIGH, 8],
        [ThreatLevel.CRITICAL, 10],
      ];

      for (const [threatLevel, expectedSeverity] of testCases) {
        const event = createTestEvent({ threatLevel });
        await siemForwarder.forward(event);
        await siemForwarder.flush();

        const payload = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body;
        const parsed = JSON.parse(payload);
        expect(parsed[0].severity).toBe(expectedSeverity);
      }
    });
  });

  describe('API Key Authentication', () => {
    it('should include API key in headers', async () => {
      siemForwarder = new SIEMForwarder({
        enabled: true,
        endpoint: 'https://siem.example.com',
        apiKey: 'test-api-key',
        batchSize: 1,
      });

      const event = createTestEvent();
      await siemForwarder.forward(event);
      await siemForwarder.flush();

      expect(mockFetch).toHaveBeenCalled();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-api-key');
    });
  });
});

// Helper function to create test events
function createTestEvent(overrides?: Partial<AuditEvent>): AuditEvent {
  return {
    requestId: 'test-request-123',
    timestamp: Date.now(),
    eventType: 'pii.detected',
    action: 'scan',
    decision: 'BLOCK',
    threatLevel: ThreatLevel.HIGH,
    userId: 'user-123',
    sourceIp: '192.168.1.1',
    provider: 'openai',
    model: 'gpt-4',
    duration: 100,
    findings: [
      {
        type: 'pii',
        severity: 'high',
        message: 'Credit card detected',
        evidence: '4111-1111-1111-1111',
        location: 'message[0].content',
      },
    ],
    policyId: 'policy-1',
    targetService: 'api.openai.com',
    ...overrides,
  };
}

