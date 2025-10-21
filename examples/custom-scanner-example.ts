/**
 * Custom Scanner SDK Examples
 * 
 * This file demonstrates how to build custom security scanners
 * using the Proxilion Custom Scanner SDK.
 */

import {
  CustomScannerBuilder,
  ScannerUtils,
  PatternLibrary,
} from '../src/sdk/custom-scanner-sdk.js';
import { UnifiedAIRequest, UnifiedAIResponse } from '../src/types/index.js';

// Example 1: Simple Pattern-Based Scanner
// Detects company-specific sensitive information
const companyDataScanner = new CustomScannerBuilder({
  name: 'company-data-scanner',
  description: 'Detects company-specific sensitive data',
  version: '1.0.0',
  enabled: true,
  timeout: 3000,
  priority: 60,
})
  .addPattern({
    pattern: /ACME-\d{6}/g,
    threatLevel: 'HIGH',
    description: 'Company internal ID detected',
    category: 'company_pii',
  })
  .addPattern({
    pattern: /project-\w+-secret/gi,
    threatLevel: 'CRITICAL',
    description: 'Project secret key detected',
    category: 'secrets',
  })
  .addPattern({
    pattern: /@acme\.internal/gi,
    threatLevel: 'MEDIUM',
    description: 'Internal email domain detected',
    category: 'company_pii',
  })
  .build();

// Example 2: Custom Logic Scanner
// Detects requests that might be trying to extract training data
const trainingDataExtractionScanner = new CustomScannerBuilder({
  name: 'training-data-extraction-scanner',
  description: 'Detects attempts to extract model training data',
  version: '1.0.0',
  enabled: true,
  timeout: 5000,
  priority: 70,
})
  .withCustomLogic(async (request: UnifiedAIRequest) => {
    const findings = [];
    const texts = ScannerUtils.extractTextContent(request);

    for (const text of texts) {
      // Check for repetitive patterns that might be trying to extract data
      const repeatCount = ScannerUtils.countMatches(text, /(.{10,})\1{3,}/g);
      if (repeatCount > 0) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'training_data_extraction',
            severity: 'HIGH',
            message: 'Repetitive pattern detected - possible training data extraction attempt',
            evidence: 'Multiple repetitive sequences found',
            confidence: 0.7,
          })
        );
      }

      // Check for requests asking for verbatim reproduction
      const verbatimKeywords = [
        'repeat exactly',
        'reproduce verbatim',
        'copy exactly',
        'word for word',
        'character by character',
      ];

      if (ScannerUtils.containsKeywords(text, verbatimKeywords)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'training_data_extraction',
            severity: 'MEDIUM',
            message: 'Request for verbatim reproduction detected',
            evidence: 'Contains keywords associated with data extraction',
            confidence: 0.6,
          })
        );
      }

      // Check for unusually long requests (might be trying to extract large amounts of data)
      if (text.length > 50000) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'training_data_extraction',
            severity: 'LOW',
            message: 'Unusually long request detected',
            evidence: `Request length: ${text.length} characters`,
            confidence: 0.4,
          })
        );
      }
    }

    return findings;
  })
  .build();

// Example 3: Compliance Scanner
// Ensures requests comply with company policies
const complianceScanner = new CustomScannerBuilder({
  name: 'compliance-scanner',
  description: 'Ensures requests comply with company policies',
  version: '1.0.0',
  enabled: true,
  timeout: 3000,
  priority: 80,
})
  .withCustomLogic(async (request: UnifiedAIRequest) => {
    const findings = [];
    const texts = ScannerUtils.extractTextContent(request);

    for (const text of texts) {
      // Check for requests about competitors (might violate NDA)
      const competitorNames = ['CompetitorA', 'CompetitorB', 'CompetitorC'];
      if (ScannerUtils.containsKeywords(text, competitorNames)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'compliance',
            severity: 'MEDIUM',
            message: 'Competitor name mentioned - potential NDA violation',
            evidence: 'Contains competitor names',
            confidence: 0.8,
          })
        );
      }

      // Check for requests about unreleased products
      const unreleasedProducts = ['Project Phoenix', 'Product X', 'Alpha Release'];
      if (ScannerUtils.containsKeywords(text, unreleasedProducts)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'compliance',
            severity: 'HIGH',
            message: 'Unreleased product mentioned - confidentiality risk',
            evidence: 'Contains unreleased product names',
            confidence: 0.9,
          })
        );
      }

      // Check for requests that might violate export control
      const exportControlKeywords = [
        'encryption algorithm',
        'cryptographic',
        'military application',
        'dual-use technology',
      ];
      if (ScannerUtils.containsKeywords(text, exportControlKeywords)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'compliance',
            severity: 'CRITICAL',
            message: 'Export control keywords detected',
            evidence: 'Contains export-controlled technology keywords',
            confidence: 0.7,
          })
        );
      }
    }

    return findings;
  })
  .build();

// Example 4: Response Content Scanner
// Scans AI responses for inappropriate content
const responseContentScanner = new CustomScannerBuilder({
  name: 'response-content-scanner',
  description: 'Scans AI responses for inappropriate content',
  version: '1.0.0',
  enabled: true,
  timeout: 3000,
  priority: 50,
})
  .withCustomLogic(async (request: UnifiedAIRequest, response?: UnifiedAIResponse) => {
    if (!response) {
      return [];
    }

    const findings = [];
    const texts = ScannerUtils.extractResponseContent(response);

    for (const text of texts) {
      // Check for medical advice (liability risk)
      const medicalKeywords = [
        'you should take',
        'recommended dosage',
        'medical diagnosis',
        'treatment plan',
      ];
      if (ScannerUtils.containsKeywords(text, medicalKeywords)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'inappropriate_content',
            severity: 'HIGH',
            message: 'Response contains medical advice',
            evidence: 'Contains medical advice keywords',
            confidence: 0.7,
          })
        );
      }

      // Check for legal advice (liability risk)
      const legalKeywords = [
        'you should sue',
        'legal action',
        'in my legal opinion',
        'this constitutes',
      ];
      if (ScannerUtils.containsKeywords(text, legalKeywords)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'inappropriate_content',
            severity: 'HIGH',
            message: 'Response contains legal advice',
            evidence: 'Contains legal advice keywords',
            confidence: 0.7,
          })
        );
      }

      // Check for financial advice (regulatory risk)
      const financialKeywords = [
        'you should invest',
        'guaranteed returns',
        'stock tip',
        'financial advice',
      ];
      if (ScannerUtils.containsKeywords(text, financialKeywords)) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'inappropriate_content',
            severity: 'MEDIUM',
            message: 'Response contains financial advice',
            evidence: 'Contains financial advice keywords',
            confidence: 0.6,
          })
        );
      }
    }

    return findings;
  })
  .build();

// Example 5: Using Pre-built Pattern Libraries
const sqlInjectionScanner = new CustomScannerBuilder({
  name: 'sql-injection-scanner',
  description: 'Detects SQL injection attempts',
  version: '1.0.0',
  enabled: true,
})
  .addPatterns(PatternLibrary.SQL_INJECTION)
  .build();

const codeInjectionScanner = new CustomScannerBuilder({
  name: 'code-injection-scanner',
  description: 'Detects code injection attempts',
  version: '1.0.0',
  enabled: true,
})
  .addPatterns(PatternLibrary.CODE_INJECTION)
  .build();

// Example 6: Combining Patterns and Custom Logic
const advancedSecurityScanner = new CustomScannerBuilder({
  name: 'advanced-security-scanner',
  description: 'Advanced security scanner with patterns and custom logic',
  version: '1.0.0',
  enabled: true,
  timeout: 5000,
  priority: 90,
})
  .addPatterns(PatternLibrary.SENSITIVE_DATA)
  .addPatterns(PatternLibrary.SQL_INJECTION)
  .withCustomLogic(async (request: UnifiedAIRequest) => {
    const findings = [];
    const texts = ScannerUtils.extractTextContent(request);

    // Custom logic: Check for suspicious combinations
    for (const text of texts) {
      const hasSensitiveData = ScannerUtils.containsKeywords(text, ['password', 'secret', 'key']);
      const hasExfiltration = ScannerUtils.containsKeywords(text, [
        'send to',
        'email to',
        'post to',
        'upload to',
      ]);

      if (hasSensitiveData && hasExfiltration) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'data_exfiltration',
            severity: 'CRITICAL',
            message: 'Potential data exfiltration attempt detected',
            evidence: 'Request contains both sensitive data and exfiltration keywords',
            confidence: 0.85,
          })
        );
      }
    }

    return findings;
  })
  .build();

// Export all scanners
export {
  companyDataScanner,
  trainingDataExtractionScanner,
  complianceScanner,
  responseContentScanner,
  sqlInjectionScanner,
  codeInjectionScanner,
  advancedSecurityScanner,
};

// Usage example:
// import { ScannerOrchestrator } from '../src/scanners/scanner-orchestrator.js';
// import { companyDataScanner, complianceScanner } from './custom-scanner-example.js';
//
// const orchestrator = new ScannerOrchestrator();
// orchestrator.registerScanner(companyDataScanner);
// orchestrator.registerScanner(complianceScanner);

