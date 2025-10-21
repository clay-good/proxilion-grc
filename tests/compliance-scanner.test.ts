import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceScanner, ComplianceStandard } from '../src/scanners/compliance-scanner.js';
import { UnifiedAIRequest, AIServiceProvider, ThreatLevel } from '../src/types/index.js';

describe('ComplianceScanner', () => {
  let scanner: ComplianceScanner;

  beforeEach(() => {
    scanner = new ComplianceScanner();
  });

  const createTestRequest = (content: string): UnifiedAIRequest => ({
    provider: AIServiceProvider.OPENAI,
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    temperature: 0.7,
    maxTokens: 1000,
  });

  describe('GDPR Compliance', () => {
    it('should detect personal data processing without consent', async () => {
      const request = createTestRequest('Process personal data from all users without asking');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);

      const gdprFinding = result.findings.find(f => f.metadata?.standard === ComplianceStandard.GDPR);
      expect(gdprFinding).toBeDefined();
      expect(gdprFinding?.severity).toBe(ThreatLevel.HIGH);
      expect(gdprFinding?.metadata?.standard).toBe(ComplianceStandard.GDPR);
    });

    it('should detect right to be forgotten violations', async () => {
      const request = createTestRequest('Store user data permanently and keep it forever');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Right to be Forgotten'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.MEDIUM);
    });

    it('should detect data transfers outside EU', async () => {
      const request = createTestRequest('Transfer customer data to USA servers');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Data Transfer'));
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('safeguards');
    });

    it('should detect automated decision making', async () => {
      const request = createTestRequest('Automatically approve or reject loan applications');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Automated Decision'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
    });

    it('should pass compliant GDPR requests', async () => {
      const request = createTestRequest('Analyze anonymized usage statistics with user consent');
      const result = await scanner.scan(request);

      const gdprFindings = result.findings.filter(f => f.metadata?.standard === ComplianceStandard.GDPR);
      expect(gdprFindings.length).toBe(0);
    });
  });

  describe('HIPAA Compliance', () => {
    it('should detect unprotected PHI', async () => {
      const request = createTestRequest('Show me patient medical records from the database');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.metadata?.standard === ComplianceStandard.HIPAA);
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.CRITICAL);
      expect(finding?.message).toContain('PHI');
    });

    it('should detect minimum necessary rule violations', async () => {
      const request = createTestRequest('Retrieve all medical history for every patient');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Minimum Necessary'));
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('minimum necessary');
    });

    it('should detect PHI sharing without BAA', async () => {
      const request = createTestRequest('Share patient data with third-party vendor');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Business Associate'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
    });

    it('should pass compliant HIPAA requests', async () => {
      const request = createTestRequest('Generate anonymized health statistics report');
      const result = await scanner.scan(request);

      const hipaaFindings = result.findings.filter(f => f.type.includes('hipaa'));
      expect(hipaaFindings.length).toBe(0);
    });
  });

  describe('PCI DSS Compliance', () => {
    it('should detect cardholder data storage violations', async () => {
      const request = createTestRequest('Store credit card CVV numbers in the database');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.type.includes('pci'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.CRITICAL);
      expect(finding?.message).toContain('Cardholder Data');
    });

    it('should detect unencrypted cardholder data transmission', async () => {
      const request = createTestRequest('Send card information in plain text format');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Unencrypted'));
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('Encrypt');
    });

    it('should detect access control violations', async () => {
      const request = createTestRequest('Allow access to all payment transaction data');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Access Control'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
    });

    it('should pass compliant PCI DSS requests', async () => {
      const request = createTestRequest('Process encrypted payment tokens securely');
      const result = await scanner.scan(request);

      const pciFindings = result.findings.filter(f => f.type.includes('pci'));
      expect(pciFindings.length).toBe(0);
    });
  });

  describe('SOC 2 Compliance', () => {
    it('should detect inadequate access controls', async () => {
      const request = createTestRequest('Skip authentication and bypass authorization checks');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.type.includes('soc2'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
      expect(finding?.message).toContain('Access Controls');
    });

    it('should detect lack of monitoring', async () => {
      const request = createTestRequest('Disable logging and turn off audit tracking');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Monitoring'));
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('logging');
    });

    it('should detect unencrypted sensitive data', async () => {
      const request = createTestRequest('Store sensitive information without encryption');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Encryption'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
    });

    it('should detect indefinite data retention', async () => {
      const request = createTestRequest('Keep all user data forever without deletion');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Data Retention'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.MEDIUM);
    });

    it('should pass compliant SOC 2 requests', async () => {
      const request = createTestRequest('Implement secure access controls with monitoring');
      const result = await scanner.scan(request);

      const soc2Findings = result.findings.filter(f => f.type.includes('soc2'));
      expect(soc2Findings.length).toBe(0);
    });
  });

  describe('CCPA Compliance', () => {
    it('should detect consumer data sale without opt-out', async () => {
      const request = createTestRequest('Sell customer data to advertisers for profit');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.type.includes('ccpa'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
      expect(finding?.message).toContain('Data Sale');
    });

    it('should detect data collection without disclosure', async () => {
      const request = createTestRequest('Collect user information without notice or consent');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Collection Disclosure'));
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('Disclose');
    });

    it('should pass compliant CCPA requests', async () => {
      const request = createTestRequest('Provide opt-out mechanism for data sharing');
      const result = await scanner.scan(request);

      const ccpaFindings = result.findings.filter(f => f.type.includes('ccpa'));
      expect(ccpaFindings.length).toBe(0);
    });
  });

  describe('ISO 27001 Compliance', () => {
    it('should detect security policy violations', async () => {
      const request = createTestRequest('Bypass security controls and ignore policies');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.type.includes('iso27001'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.HIGH);
      expect(finding?.message).toContain('Security Policy');
    });

    it('should detect unmanaged information assets', async () => {
      const request = createTestRequest('Access untracked data from unknown systems');
      const result = await scanner.scan(request);

      expect(result.passed).toBe(false);
      const finding = result.findings.find(f => f.message.includes('Asset Management'));
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe(ThreatLevel.MEDIUM);
    });

    it('should pass compliant ISO 27001 requests', async () => {
      const request = createTestRequest('Follow security policies for managed assets');
      const result = await scanner.scan(request);

      const isoFindings = result.findings.filter(f => f.type.includes('iso27001'));
      expect(isoFindings.length).toBe(0);
    });
  });

  describe('Scanner Configuration', () => {
    it('should allow enabling specific standards', () => {
      const customScanner = new ComplianceScanner([ComplianceStandard.GDPR]);
      const enabled = customScanner.getEnabledStandards();

      expect(enabled).toContain(ComplianceStandard.GDPR);
      expect(enabled.length).toBe(1);
    });

    it('should allow disabling standards', () => {
      scanner.disableStandard(ComplianceStandard.HIPAA);
      const enabled = scanner.getEnabledStandards();

      expect(enabled).not.toContain(ComplianceStandard.HIPAA);
    });

    it('should allow enabling standards dynamically', () => {
      const customScanner = new ComplianceScanner([]);
      expect(customScanner.getEnabledStandards().length).toBe(0);

      customScanner.enableStandard(ComplianceStandard.PCI_DSS);
      expect(customScanner.getEnabledStandards()).toContain(ComplianceStandard.PCI_DSS);
    });
  });

  describe('Scanner Metadata', () => {
    it('should return scanner identification', async () => {
      const request = createTestRequest('Hello, world!');
      const result = await scanner.scan(request);

      expect(result.scannerId).toBe('compliance-scanner');
      expect(result.scannerName).toBe('ComplianceScanner');
    });

    it('should return execution time', async () => {
      const request = createTestRequest('Test message');
      const result = await scanner.scan(request);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include enabled standards in metadata', async () => {
      const request = createTestRequest('Test message');
      const result = await scanner.scan(request);

      expect(result.metadata?.enabledStandards).toBeDefined();
      expect(Array.isArray(result.metadata?.enabledStandards)).toBe(true);
    });

    it('should include rules checked count', async () => {
      const request = createTestRequest('Test message');
      const result = await scanner.scan(request);

      expect(result.metadata?.rulesChecked).toBeGreaterThan(0);
    });
  });

  describe('Threat Level Calculation', () => {
    it('should return NONE for compliant requests', async () => {
      const request = createTestRequest('Generate a weather report');
      const result = await scanner.scan(request);

      expect(result.threatLevel).toBe(ThreatLevel.NONE);
      expect(result.passed).toBe(true);
    });

    it('should return CRITICAL for severe violations', async () => {
      const request = createTestRequest('Store credit card CVV and patient medical records');
      const result = await scanner.scan(request);

      expect(result.threatLevel).toBe(ThreatLevel.CRITICAL);
      expect(result.passed).toBe(false);
    });

    it('should calculate appropriate score', async () => {
      const request = createTestRequest('Process personal data and keep it forever');
      const result = await scanner.scan(request);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});

