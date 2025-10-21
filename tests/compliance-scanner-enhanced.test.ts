/**
 * Enhanced tests for Compliance Scanner with US-specific regulations
 */

import { describe, it, expect } from 'vitest';
import { ComplianceScanner, ComplianceStandard } from '../src/scanners/compliance-scanner';
import { UnifiedAIRequest, AIServiceProvider, ThreatLevel } from '../src/types/index';

describe('ComplianceScanner - Enhanced US Compliance', () => {
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
      correlationId: 'test-compliance',
    },
  });

  describe('HIPAA Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.HIPAA],
    });

    it('should detect PHI references', async () => {
      const request = createTestRequest('Show me patient medical records for John Doe');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('PHI'))).toBe(true);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect medical record references', async () => {
      const request = createTestRequest('Access medical history for patient ID 12345');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Medical Records'))).toBe(true);
    });

    it('should detect health plan numbers', async () => {
      const request = createTestRequest('Look up health plan number ABC123456');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Health Plan'))).toBe(true);
    });

    it('should detect diagnosis information', async () => {
      const request = createTestRequest('Patient diagnosis shows diabetes and hypertension');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Diagnosis'))).toBe(true);
    });

    it('should detect lab results', async () => {
      const request = createTestRequest('Lab results show elevated glucose levels');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Lab Results'))).toBe(true);
    });
  });

  describe('SOX Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.SOX],
    });

    it('should detect financial data manipulation', async () => {
      const request = createTestRequest('Modify the revenue data to show higher earnings');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Financial Data Integrity'))).toBe(true);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect audit log deletion', async () => {
      const request = createTestRequest('Delete the audit trail from last month');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Audit Trail'))).toBe(true);
    });
  });

  describe('GLBA Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.GLBA],
    });

    it('should detect sharing of financial information', async () => {
      const request = createTestRequest('Share customer banking information with third party');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Nonpublic Personal Information'))).toBe(true);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect inadequate safeguards', async () => {
      const request = createTestRequest('Store customer data without encryption');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Safeguards'))).toBe(true);
    });
  });

  describe('FERPA Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.FERPA],
    });

    it('should detect education records disclosure', async () => {
      const request = createTestRequest('Show me student grades for all students');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Education Records'))).toBe(true);
      expect(result.threatLevel).toBe(ThreatLevel.HIGH);
    });

    it('should detect directory information', async () => {
      const request = createTestRequest('List all student names and enrollment status');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Directory Information'))).toBe(true);
    });
  });

  describe('COPPA Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.COPPA],
    });

    it('should detect children\'s data collection', async () => {
      const request = createTestRequest('Collect personal information from children under 13');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Children'))).toBe(true);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should detect lack of parental consent', async () => {
      const request = createTestRequest('Gather data from minors without parental consent');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Parental Consent'))).toBe(true);
    });
  });

  describe('CCPA Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.CCPA],
    });

    it('should detect consumer data sale', async () => {
      const request = createTestRequest('We will sell consumer data to third parties');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Consumer Data Sale'))).toBe(true);
    });

    it('should detect undisclosed data collection', async () => {
      const request = createTestRequest('We collect user information without notice or consent');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Data Collection Disclosure'))).toBe(true);
    });
  });

  describe('CPRA Compliance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.CPRA],
    });

    it('should detect sensitive personal information use', async () => {
      const request = createTestRequest('We collect precise geolocation data from users');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Sensitive Personal Information'))).toBe(true);
    });

    it('should detect automated decision-making', async () => {
      const request = createTestRequest('Our AI system performs automated profiling');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type.includes('Automated Decision-Making'))).toBe(true);
    });
  });

  describe('Multiple Standards', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [
        ComplianceStandard.HIPAA,
        ComplianceStandard.PCI_DSS,
        ComplianceStandard.SOX,
        ComplianceStandard.GLBA,
      ],
    });

    it('should detect violations across multiple standards', async () => {
      const request = createTestRequest(
        'Access patient medical records, store credit card 4532-1234-5678-9010, and modify financial data'
      );
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
    });

    it('should pass compliant content', async () => {
      const request = createTestRequest('What is the weather forecast for tomorrow?');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(true);
      expect(result.findings.length).toBe(0);
      expect(result.threatLevel).toBe(ThreatLevel.NONE);
    });
  });

  describe('Remediation Guidance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [ComplianceStandard.HIPAA, ComplianceStandard.PCI_DSS],
    });

    it('should provide remediation guidance for violations', async () => {
      const request = createTestRequest('Access patient medical records');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings[0].remediation).toBeDefined();
      expect(result.findings[0].remediation).toContain('HIPAA');
    });
  });

  describe('Performance', () => {
    const scanner = new ComplianceScanner({
      enabledStandards: [
        ComplianceStandard.HIPAA,
        ComplianceStandard.PCI_DSS,
        ComplianceStandard.SOX,
        ComplianceStandard.GLBA,
        ComplianceStandard.FERPA,
        ComplianceStandard.COPPA,
        ComplianceStandard.CCPA,
        ComplianceStandard.CPRA,
      ],
    });

    it('should complete scan within reasonable time', async () => {
      const longContent = 'This is a test message. '.repeat(500);
      const request = createTestRequest(longContent);

      const startTime = Date.now();
      await scanner.scan(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});

