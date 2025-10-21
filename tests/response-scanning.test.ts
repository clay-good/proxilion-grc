/**
 * Response Scanning Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseScanner } from '../src/response/response-scanner.js';
import { ResponseFilter } from '../src/response/response-filter.js';
import { ResponseAuditLogger } from '../src/response/response-audit-logger.js';
import { UnifiedAIResponse, AIServiceProvider } from '../src/types/index.js';
import { ThreatLevel } from '../src/types/index.js';

describe('Response Scanner', () => {
  let scanner: ResponseScanner;

  beforeEach(() => {
    scanner = new ResponseScanner({
      enablePiiDetection: true,
      enableCredentialDetection: true,
      enableHarmfulContentDetection: true,
      autoRedact: true,
      redactionStrategy: 'mask',
    });
  });

  describe('PII Detection', () => {
    it('should detect SSN in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Your SSN is 123-45-6789.',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.safe).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('pii');
      expect(result.findings[0].value).toBe('123-45-6789');
    });

    it('should detect email in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Contact me at john.doe@example.com',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('pii');
      expect(result.findings[0].value).toBe('john.doe@example.com');
    });

    it('should detect phone number in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Call me at (555) 123-4567',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('pii');
    });

    it('should detect credit card in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Card number: 4532-1234-5678-9010',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('pii');
    });
  });

  describe('Credential Detection', () => {
    it('should detect API key in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Your API key is sk_test_1234567890abcdefghijklmnopqrstuvwxyz',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      const credentialFinding = result.findings.find((f) => f.type === 'credentials');
      expect(credentialFinding).toBeDefined();
      expect(credentialFinding?.severity).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect AWS key in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'AWS Access Key: AKIAIOSFODNN7EXAMPLE',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('credentials');
    });

    it('should detect private key in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('credentials');
    });
  });

  describe('Harmful Content Detection', () => {
    it('should detect violence in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'You should kill people who disagree with you.',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('harmful_content');
      expect(result.findings[0].severity).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect self-harm content in response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'If you are feeling depressed, you should consider suicide.',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].type).toBe('harmful_content');
    });
  });

  describe('Redaction', () => {
    it('should redact PII when autoRedact is enabled', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Your SSN is 123-45-6789 and email is john@example.com',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.redactedResponse).toBeDefined();
      expect(result.metadata.redactionsCount).toBeGreaterThan(0);
      expect(result.redactedResponse?.content).toContain('[REDACTED]');
    });

    it('should not include original sensitive data in redacted response', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'API Key: sk_test_1234567890abcdefghijklmnopqrstuvwxyz',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.redactedResponse).toBeDefined();
      expect(result.redactedResponse?.content).not.toContain(
        'sk_test_1234567890abcdefghijklmnopqrstuvwxyz'
      );
    });
  });

  describe('Safe Content', () => {
    it('should pass safe content without findings', async () => {
      const response: UnifiedAIResponse = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Hello! How can I help you today?',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };

      const result = await scanner.scanResponse(response);

      expect(result.safe).toBe(true);
      expect(result.findings.length).toBe(0);
      expect(result.threatLevel).toBe(ThreatLevel.NONE);
    });
  });
});

describe('Response Filter', () => {
  let filter: ResponseFilter;
  let scanner: ResponseScanner;

  beforeEach(() => {
    filter = new ResponseFilter({
      blockOnCritical: true,
      blockOnHigh: false,
      enableContentModeration: true,
    });
    scanner = new ResponseScanner({ autoRedact: true });
  });

  it('should block response with critical threat level', async () => {
    const response: UnifiedAIResponse = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      content: 'API Key: sk_test_1234567890abcdefghijklmnopqrstuvwxyz',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };

    const scanResult = await scanner.scanResponse(response);
    const filterResult = await filter.filterResponse(response, scanResult);

    expect(filterResult.blocked).toBe(true);
    expect(filterResult.allowed).toBe(false);
    expect(filterResult.reason).toContain('critical');
  });

  it('should allow safe response', async () => {
    const response: UnifiedAIResponse = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      content: 'Hello! How can I help you today?',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };

    const scanResult = await scanner.scanResponse(response);
    const filterResult = await filter.filterResponse(response, scanResult);

    expect(filterResult.blocked).toBe(false);
    expect(filterResult.allowed).toBe(true);
  });

  it('should use redacted response when available', async () => {
    const response: UnifiedAIResponse = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      content: 'Your email is john@example.com',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };

    const scanResult = await scanner.scanResponse(response);
    const filterResult = await filter.filterResponse(response, scanResult);

    expect(filterResult.modified).toBe(true);
    expect(filterResult.response.content).toContain('[REDACTED]');
  });
});

describe('Response Audit Logger', () => {
  let auditLogger: ResponseAuditLogger;
  let scanner: ResponseScanner;
  let filter: ResponseFilter;

  beforeEach(() => {
    auditLogger = new ResponseAuditLogger();
    scanner = new ResponseScanner({ autoRedact: true });
    filter = new ResponseFilter({ blockOnCritical: true });
  });

  it('should log audit entry', async () => {
    const response: UnifiedAIResponse = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      content: 'Your SSN is 123-45-6789',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };

    const scanResult = await scanner.scanResponse(response);
    const filterResult = await filter.filterResponse(response, scanResult);

    auditLogger.logAudit(response, scanResult, filterResult, {
      correlationId: 'test-correlation-id',
      userId: 'test-user',
      provider: 'openai',
      model: 'gpt-4',
    });

    const entries = auditLogger.queryAuditLog();
    expect(entries.length).toBe(1);
    expect(entries[0].userId).toBe('test-user');
    expect(entries[0].scanResult.findingsCount).toBeGreaterThan(0);
  });

  it('should query audit log by user', async () => {
    const response: UnifiedAIResponse = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      content: 'Hello!',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };

    const scanResult = await scanner.scanResponse(response);
    const filterResult = await filter.filterResponse(response, scanResult);

    auditLogger.logAudit(response, scanResult, filterResult, {
      correlationId: 'test-1',
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4',
    });

    auditLogger.logAudit(response, scanResult, filterResult, {
      correlationId: 'test-2',
      userId: 'user-2',
      provider: 'openai',
      model: 'gpt-4',
    });

    const entries = auditLogger.queryAuditLog({ userId: 'user-1' });
    expect(entries.length).toBe(1);
    expect(entries[0].userId).toBe('user-1');
  });

  it('should get audit statistics', async () => {
    const response: UnifiedAIResponse = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      content: 'Test content',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };

    const scanResult = await scanner.scanResponse(response);
    const filterResult = await filter.filterResponse(response, scanResult);

    auditLogger.logAudit(response, scanResult, filterResult, {
      correlationId: 'test',
      provider: 'openai',
      model: 'gpt-4',
    });

    const stats = auditLogger.getStatistics();
    expect(stats.totalResponses).toBeGreaterThan(0);
    expect(stats.scannedResponses).toBeGreaterThan(0);
  });
});

