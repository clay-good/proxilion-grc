/**
 * Tests for PII Scanner
 */

import { describe, it, expect } from 'vitest';
import { PIIScanner } from '../src/scanners/pii-scanner';
import { UnifiedAIRequest, AIServiceProvider, ThreatLevel } from '../src/types/index';

describe('PIIScanner', () => {
  const scanner = new PIIScanner();

  const createTestRequest = (content: string): UnifiedAIRequest => ({
    provider: AIServiceProvider.OPENAI,
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    parameters: {},
    streaming: false,
    metadata: {
      correlationId: 'test-123',
    },
  });

  it('should detect email addresses', async () => {
    const request = createTestRequest('My email is john.doe@example.com');
    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].type).toBe('Email Address');
  });

  it('should detect credit card numbers', async () => {
    const request = createTestRequest('My card number is 4532-1234-5678-9010');
    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type.includes('Credit Card'))).toBe(true);
    expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
  });

  it('should detect SSN', async () => {
    const request = createTestRequest('My SSN is 123-45-6789');
    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'US Social Security Number')).toBe(true);
    expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
  });

  it('should detect phone numbers', async () => {
    const request = createTestRequest('Call me at (555) 123-4567');
    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'US Phone Number')).toBe(true);
  });

  it('should detect multiple PII types', async () => {
    const request = createTestRequest(
      'Contact John at john@example.com or call (555) 123-4567. SSN: 123-45-6789'
    );
    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
  });

  it('should pass clean content', async () => {
    const request = createTestRequest('What is the capital of France?');
    const result = await scanner.scan(request);

    expect(result.passed).toBe(true);
    expect(result.findings.length).toBe(0);
    expect(result.threatLevel).toBe(ThreatLevel.NONE);
  });

  it('should mask detected PII in evidence', async () => {
    const request = createTestRequest('My email is john.doe@example.com');
    const result = await scanner.scan(request);

    expect(result.findings[0].evidence).not.toContain('john.doe@example.com');
    expect(result.findings[0].evidence).toContain('*');
  });

  it('should calculate correct threat level', async () => {
    const highThreatRequest = createTestRequest('SSN: 123-45-6789, Card: 4532-1234-5678-9010');
    const result = await scanner.scan(highThreatRequest);

    expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
  });

  it('should handle multimodal content', async () => {
    const request: UnifiedAIRequest = {
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'My email is test@example.com' },
            { type: 'text', text: 'And my phone is (555) 123-4567' },
          ],
        },
      ],
      parameters: {},
      streaming: false,
      metadata: {
        correlationId: 'test-456',
      },
    };

    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
  });

  it('should complete scan within reasonable time', async () => {
    const longContent = 'Hello world. '.repeat(1000);
    const request = createTestRequest(longContent);

    const startTime = Date.now();
    await scanner.scan(request);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });
});

