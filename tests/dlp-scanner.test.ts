/**
 * DLP Scanner Tests
 */

import { describe, it, expect } from 'vitest';
import { DLPScanner } from '../src/scanners/dlp-scanner.js';
import { UnifiedAIRequest, ThreatLevel } from '../src/types/index.js';

describe('DLPScanner', () => {
  const scanner = new DLPScanner();

  const createTestRequest = (content: string): UnifiedAIRequest => ({
    provider: 'openai',
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    parameters: {
      temperature: 0.7,
      maxTokens: 1000,
    },
    metadata: {
      correlationId: 'test-123',
      timestamp: Date.now(),
      sourceIp: '192.168.1.1',
    },
  });

  describe('API Key Detection', () => {
    it('should detect OpenAI API key', async () => {
      const request = createTestRequest('My API key is sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
      expect(result.findings[0].type).toBe('OpenAI API Key');
      expect(result.findings[0].evidence).toContain('...');
    });

    it('should detect AWS access key', async () => {
      const request = createTestRequest('AWS key: AKIAIOSFODNN7EXAMPLE');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
      expect(result.findings[0].type).toBe('AWS Access Key');
    });

    it('should detect GitHub token', async () => {
      const request = createTestRequest('Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
      expect(result.findings[0].type).toBe('GitHub Token');
    });

    it('should detect Stripe API key', async () => {
      const request = createTestRequest('Stripe: sk_live_1234567890abcdefghijklmn');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect generic API key patterns', async () => {
      const request = createTestRequest('api_key: abc123def456ghi789jkl012mno345pqr678');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect([ThreatLevel.HIGH, ThreatLevel.CRITICAL]).toContain(result.threatLevel);
    });
  });

  describe('Database Credentials Detection', () => {
    it('should detect MongoDB connection string', async () => {
      const request = createTestRequest('mongodb://user:password@localhost:27017/mydb');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
      expect(result.findings[0].type).toBe('Database Connection String');
    });

    it('should detect PostgreSQL connection string', async () => {
      const request = createTestRequest('postgresql://user:pass@localhost/database');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect database password', async () => {
      const request = createTestRequest('password: MySecretPassword123!');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect([ThreatLevel.HIGH, ThreatLevel.CRITICAL]).toContain(result.threatLevel);
    });
  });

  describe('Private Key Detection', () => {
    it('should detect RSA private key', async () => {
      const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`;
      const request = createTestRequest(privateKey);
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
      expect(result.findings[0].type).toBe('RSA Private Key');
    });

    it('should detect SSH private key', async () => {
      const sshKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAA
-----END OPENSSH PRIVATE KEY-----`;
      const request = createTestRequest(sshKey);
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });
  });

  describe('Source Code Detection', () => {
    it('should detect SQL queries', async () => {
      const request = createTestRequest('SELECT * FROM users WHERE password = "admin"');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect([ThreatLevel.MEDIUM, ThreatLevel.HIGH, ThreatLevel.CRITICAL]).toContain(result.threatLevel);
      expect(result.findings[0].type).toBe('SQL Query');
    });

    it('should detect code blocks', async () => {
      const codeBlock = '```python\n' + 'def hello():\n    pass\n'.repeat(10) + '```';
      const request = createTestRequest(codeBlock);
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.some(f => f.type === 'Code Block' || f.type === 'Python Code')).toBe(true);
    });
  });

  describe('Confidential Data Detection', () => {
    it('should detect internal IP addresses', async () => {
      const request = createTestRequest('Connect to 192.168.1.100 for internal access');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect([ThreatLevel.MEDIUM, ThreatLevel.HIGH, ThreatLevel.CRITICAL]).toContain(result.threatLevel);
      expect(result.findings[0].type).toBe('Internal IP Address');
    });

    it('should detect confidential markers', async () => {
      const request = createTestRequest('This is CONFIDENTIAL information about our trade secrets');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect([ThreatLevel.HIGH, ThreatLevel.CRITICAL]).toContain(result.threatLevel);
    });

    it('should detect JWT tokens', async () => {
      const request = createTestRequest('Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect([ThreatLevel.HIGH, ThreatLevel.CRITICAL]).toContain(result.threatLevel);
      expect(result.findings[0].type).toBe('JWT Token');
    });
  });

  describe('Cloud Provider Credentials', () => {
    it('should detect Azure connection string', async () => {
      const request = createTestRequest('DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=abc123==');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect Slack token', async () => {
      const request = createTestRequest('xoxb-1234567890-1234567890-abcdefghijklmnopqrstuvwx');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });
  });

  describe('Safe Content', () => {
    it('should not flag normal conversation', async () => {
      const request = createTestRequest('What is the capital of France?');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBe(0);
      expect(result.threatLevel).toBe(ThreatLevel.NONE);
    });

    it('should not flag public information', async () => {
      const request = createTestRequest('The public API endpoint is https://api.example.com');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBe(0);
      expect(result.threatLevel).toBe(ThreatLevel.NONE);
    });

    it('should not flag short code snippets', async () => {
      const request = createTestRequest('Use console.log() to print');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBe(0);
      expect(result.threatLevel).toBe(ThreatLevel.NONE);
    });
  });

  describe('Evidence Masking', () => {
    it('should mask sensitive data in evidence', async () => {
      const request = createTestRequest('API key: sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012');
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThan(0);
      const finding = result.findings[0];
      expect(finding.evidence).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz');
      expect(finding.evidence).toContain('...');
    });
  });

  describe('Multiple Findings', () => {
    it('should detect multiple secrets in one request', async () => {
      const request = createTestRequest(`
        OpenAI key: sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012
        AWS key: AKIAIOSFODNN7EXAMPLE
        Database: mongodb://user:pass@localhost/db
      `);
      const result = await scanner.scan(request);

      expect(result.findings.length).toBeGreaterThanOrEqual(3);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });
  });

  describe('Scanner Metadata', () => {
    it('should have correct scanner metadata', () => {
      expect(scanner.name).toBe('DLPScanner');
      expect(scanner.description).toContain('source code');
      expect(scanner.version).toBe('1.0.0');
    });

    it('should return execution time', async () => {
      const request = createTestRequest('Hello world');
      const result = await scanner.scan(request);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.scannerId).toBe('dlp-scanner');
      expect(result.scannerName).toBe('DLPScanner');
    });
  });
});

