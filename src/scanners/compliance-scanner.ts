/**
 * Compliance Scanner
 * 
 * Validates AI requests and responses against regulatory compliance requirements
 * including GDPR, HIPAA, PCI DSS, SOC 2, and other standards.
 */

import { BaseScanner } from './base-scanner.js';
import { UnifiedAIRequest, ScanResult, ThreatLevel, Finding } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export enum ComplianceStandard {
  // US Federal Regulations
  HIPAA = 'hipaa',           // Health Insurance Portability and Accountability Act
  PCI_DSS = 'pci_dss',       // Payment Card Industry Data Security Standard
  SOX = 'sox',               // Sarbanes-Oxley Act
  GLBA = 'glba',             // Gramm-Leach-Bliley Act
  FERPA = 'ferpa',           // Family Educational Rights and Privacy Act
  COPPA = 'coppa',           // Children's Online Privacy Protection Act

  // US State Regulations
  CCPA = 'ccpa',             // California Consumer Privacy Act
  CPRA = 'cpra',             // California Privacy Rights Act
  VCDPA = 'vcdpa',           // Virginia Consumer Data Protection Act
  CPA = 'cpa',               // Colorado Privacy Act
  CTDPA = 'ctdpa',           // Connecticut Data Privacy Act
  UCPA = 'ucpa',             // Utah Consumer Privacy Act

  // International Regulations
  GDPR = 'gdpr',             // General Data Protection Regulation (EU)
  PIPEDA = 'pipeda',         // Personal Information Protection and Electronic Documents Act (Canada)
  LGPD = 'lgpd',             // Lei Geral de Proteção de Dados (Brazil)
  PDPA = 'pdpa',             // Personal Data Protection Act (Singapore)

  // Industry Standards
  SOC2 = 'soc2',             // Service Organization Control 2
  ISO27001 = 'iso27001',     // Information Security Management
  NIST = 'nist',             // National Institute of Standards and Technology
}

interface ComplianceRule {
  id: string;
  standard: ComplianceStandard;
  name: string;
  description: string;
  pattern?: RegExp;
  validator?: (request: UnifiedAIRequest) => boolean;
  severity: ThreatLevel;
  remediation: string;
}

interface ComplianceScannerConfig {
  enabledStandards?: ComplianceStandard[];
}

export class ComplianceScanner extends BaseScanner {
  id = 'compliance-scanner';
  name = 'ComplianceScanner';
  private logger: Logger;
  private enabledStandards: Set<ComplianceStandard>;
  private rules: ComplianceRule[];

  constructor(config?: ComplianceStandard[] | ComplianceScannerConfig) {
    super();
    this.logger = new Logger();

    // Support both array and config object formats
    let standards: ComplianceStandard[];
    if (Array.isArray(config)) {
      standards = config;
    } else if (config && 'enabledStandards' in config) {
      standards = config.enabledStandards || Object.values(ComplianceStandard);
    } else {
      standards = Object.values(ComplianceStandard);
    }

    this.enabledStandards = new Set(standards);
    this.rules = this.initializeRules();
  }

  private initializeRules(): ComplianceRule[] {
    const rules: ComplianceRule[] = [];

    // GDPR Rules
    if (this.enabledStandards.has(ComplianceStandard.GDPR)) {
      rules.push(
        {
          id: 'gdpr-001',
          standard: ComplianceStandard.GDPR,
          name: 'Personal Data Processing',
          description: 'Detect processing of personal data without consent',
          pattern: /\b(process|store|collect|analyze)\s+(personal|user|customer)\s+data\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure explicit user consent is obtained before processing personal data',
        },
        {
          id: 'gdpr-002',
          standard: ComplianceStandard.GDPR,
          name: 'Right to be Forgotten',
          description: 'Detect requests that may violate data deletion rights',
          pattern: /\b(retain|keep|store|preserve)\s+.*\s*(forever|permanently|indefinitely)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Implement data retention policies with automatic deletion',
        },
        {
          id: 'gdpr-003',
          standard: ComplianceStandard.GDPR,
          name: 'Data Transfer Outside EU',
          description: 'Detect potential data transfers outside EU without safeguards',
          pattern: /\b(transfer|send|export|move)\s+.*\s+(to|outside)\s+(us|usa|china|russia|non-eu)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure adequate safeguards for international data transfers',
        },
        {
          id: 'gdpr-004',
          standard: ComplianceStandard.GDPR,
          name: 'Automated Decision Making',
          description: 'Detect automated decisions with legal/significant effects',
          pattern: /\b(automatically|auto)\s+.*\s*(approve|reject|deny)\s+.*\s*(loan|credit|employment|insurance|application)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Provide human oversight for automated decisions with significant effects',
        }
      );
    }

    // ============ HIPAA Rules (Health Insurance Portability and Accountability Act) ============
    if (this.enabledStandards.has(ComplianceStandard.HIPAA)) {
      rules.push(
        {
          id: 'hipaa-001',
          standard: ComplianceStandard.HIPAA,
          name: 'Protected Health Information (PHI)',
          description: 'Detect unprotected PHI in requests',
          pattern: /\b(patient|medical)\s+.{0,50}(records?|data|information|history)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Encrypt and protect all PHI according to HIPAA Security Rule (45 CFR § 164.312)',
        },
        {
          id: 'hipaa-002',
          standard: ComplianceStandard.HIPAA,
          name: 'Medical Record Number',
          description: 'Detect medical record numbers',
          pattern: /\b(MRN|medical\s+record\s+number|patient\s+id)\s*[:=]?\s*[A-Z0-9-]{5,20}\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Remove or de-identify medical record numbers per HIPAA Privacy Rule',
        },
        {
          id: 'hipaa-003',
          standard: ComplianceStandard.HIPAA,
          name: 'Health Plan Number',
          description: 'Detect health insurance numbers',
          pattern: /\b(health\s+plan|insurance|policy|member|subscriber)\s+(number|id)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Protect health plan beneficiary numbers as PHI identifiers',
        },
        {
          id: 'hipaa-004',
          standard: ComplianceStandard.HIPAA,
          name: 'Diagnosis Information',
          description: 'Detect medical diagnosis or treatment details',
          pattern: /\b(patient\s+)?(diagnosis|diagnosed)\s+(shows?|with|of)?\s*(diabetes|hypertension|cancer|disease|condition)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure minimum necessary standard for PHI disclosure',
        },
        {
          id: 'hipaa-005',
          standard: ComplianceStandard.HIPAA,
          name: 'Lab Results',
          description: 'Detect laboratory or test results',
          pattern: /\b(lab\s+results?|test\s+results?|blood\s+work|glucose\s+levels?|biopsy|screening)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Protect laboratory results as PHI',
        },
        {
          id: 'hipaa-006',
          standard: ComplianceStandard.HIPAA,
          name: 'Medical Records',
          description: 'Detect medical record access requests',
          pattern: /\b(access|view|retrieve|look\s+up)\s+(medical\s+(history|records?)|patient\s+(records?|history))\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure proper authorization before accessing medical records',
        },
        {
          id: 'hipaa-002',
          standard: ComplianceStandard.HIPAA,
          name: 'Minimum Necessary Rule',
          description: 'Detect requests for excessive health information',
          pattern: /\b(all|complete|entire|full)\s+(medical|health|patient)\s+(records|history|data)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Request only minimum necessary PHI for the intended purpose',
        },
        {
          id: 'hipaa-003',
          standard: ComplianceStandard.HIPAA,
          name: 'Business Associate Agreement',
          description: 'Detect PHI sharing without BAA',
          pattern: /\b(share|send|provide|disclose)\s+.*\s+(to|with)\s+(third[- ]party|vendor|partner|contractor)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure Business Associate Agreement is in place before sharing PHI',
        }
      );
    }

    // PCI DSS Rules
    if (this.enabledStandards.has(ComplianceStandard.PCI_DSS)) {
      rules.push(
        {
          id: 'pci-001',
          standard: ComplianceStandard.PCI_DSS,
          name: 'Cardholder Data Storage',
          description: 'Detect storage of prohibited cardholder data',
          pattern: /\b(store|save|keep|retain)\s+.*\s*(card|credit\s*card|cvv|cvc|pin)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Never store sensitive authentication data (CVV, PIN) after authorization',
        },
        {
          id: 'pci-002',
          standard: ComplianceStandard.PCI_DSS,
          name: 'Unencrypted Cardholder Data',
          description: 'Detect transmission of unencrypted cardholder data',
          pattern: /\b(send|transmit|transfer)\s+.*\s+(unencrypted|plain\s*text|clear\s*text)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Encrypt cardholder data during transmission using strong cryptography',
        },
        {
          id: 'pci-003',
          standard: ComplianceStandard.PCI_DSS,
          name: 'Access Control',
          description: 'Detect requests for unrestricted access to cardholder data',
          pattern: /\b(access|view|retrieve)\s+.*\s*(all|any|every)\s+.*\s*(card|payment|transaction)\s+(data|records)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Implement role-based access control for cardholder data',
        }
      );
    }

    // SOC 2 Rules
    if (this.enabledStandards.has(ComplianceStandard.SOC2)) {
      rules.push(
        {
          id: 'soc2-001',
          standard: ComplianceStandard.SOC2,
          name: 'Security - Access Controls',
          description: 'Detect inadequate access controls',
          pattern: /\b(no|without|skip|bypass)\s+(authentication|authorization|access\s+control|permission)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Implement proper authentication and authorization controls',
        },
        {
          id: 'soc2-002',
          standard: ComplianceStandard.SOC2,
          name: 'Availability - System Monitoring',
          description: 'Detect lack of monitoring or logging',
          pattern: /\b(disable|turn\s+off|remove)\s+(logging|monitoring|audit|tracking)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Maintain comprehensive logging and monitoring systems',
        },
        {
          id: 'soc2-003',
          standard: ComplianceStandard.SOC2,
          name: 'Confidentiality - Data Encryption',
          description: 'Detect unencrypted sensitive data',
          pattern: /\b(store|save|transmit)\s+.*\s+(without|no)\s+encryption\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Encrypt sensitive data at rest and in transit',
        },
        {
          id: 'soc2-004',
          standard: ComplianceStandard.SOC2,
          name: 'Privacy - Data Retention',
          description: 'Detect indefinite data retention',
          pattern: /\b(keep|retain|store)\s+.*\s*(forever|indefinitely|permanently)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Implement data retention and disposal policies',
        }
      );
    }

    // ============ SOX Rules (Sarbanes-Oxley Act) ============
    if (this.enabledStandards.has(ComplianceStandard.SOX)) {
      rules.push(
        {
          id: 'sox-001',
          standard: ComplianceStandard.SOX,
          name: 'Financial Data Integrity',
          description: 'Detect manipulation of financial data',
          pattern: /\b(modify|alter|change|manipulate)\s+.*\s+(financial|accounting|revenue|earnings)\s+(data|records|statements)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Maintain integrity controls for financial data per SOX Section 404',
        },
        {
          id: 'sox-002',
          standard: ComplianceStandard.SOX,
          name: 'Audit Trail Requirements',
          description: 'Detect deletion of audit logs',
          pattern: /\b(delete|remove|erase|destroy)\s+.*\s+(audit|log|trail|record)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Preserve audit trails for minimum 7 years per SOX requirements',
        },
      );
    }

    // ============ GLBA Rules (Gramm-Leach-Bliley Act) ============
    if (this.enabledStandards.has(ComplianceStandard.GLBA)) {
      rules.push(
        {
          id: 'glba-001',
          standard: ComplianceStandard.GLBA,
          name: 'Nonpublic Personal Information',
          description: 'Detect sharing of nonpublic personal financial information',
          pattern: /\b(share|disclose|provide)\s+.*\s+(financial|banking|account)\s+(information|data)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Provide privacy notice and opt-out before sharing NPI',
        },
        {
          id: 'glba-002',
          standard: ComplianceStandard.GLBA,
          name: 'Safeguards Rule',
          description: 'Detect inadequate safeguards for customer data',
          pattern: /\b(store|save|keep)\s+(customer|client)\s+(data|information)\s+(without|no)\s+(encryption|safeguards?|protection)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Implement administrative, technical, and physical safeguards per GLBA Safeguards Rule',
        },
      );
    }

    // ============ FERPA Rules (Family Educational Rights and Privacy Act) ============
    if (this.enabledStandards.has(ComplianceStandard.FERPA)) {
      rules.push(
        {
          id: 'ferpa-001',
          standard: ComplianceStandard.FERPA,
          name: 'Education Records',
          description: 'Detect disclosure of education records',
          pattern: /\b(student|education|academic)\s+(records?|grades?|transcripts?|information)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Obtain written consent before disclosing education records per FERPA',
        },
        {
          id: 'ferpa-002',
          standard: ComplianceStandard.FERPA,
          name: 'Directory Information',
          description: 'Detect disclosure of directory information',
          pattern: /\b(list|show|display)\s+.*\s+(student|students)\s+(names?|enrollment|status)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Provide annual notice and opt-out for directory information disclosure',
        },
      );
    }

    // ============ COPPA Rules (Children\'s Online Privacy Protection Act) ============
    if (this.enabledStandards.has(ComplianceStandard.COPPA)) {
      rules.push(
        {
          id: 'coppa-001',
          standard: ComplianceStandard.COPPA,
          name: 'Children\'s Personal Information',
          description: 'Detect collection of children\'s personal information',
          pattern: /\b(collect|gather)\s+(personal\s+information|data)\s+from\s+(child|children|kids?|minors?|under\s+13)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Obtain verifiable parental consent before collecting data from children under 13',
        },
        {
          id: 'coppa-002',
          standard: ComplianceStandard.COPPA,
          name: 'Parental Consent',
          description: 'Detect data collection from minors without parental consent',
          pattern: /\b(gather|collect)\s+(data|information)\s+from\s+(minors?|children)\s+without\s+(parental\s+)?consent\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Obtain verifiable parental consent before collecting data from children under 13',
        },
      );
    }

    // CCPA Rules
    if (this.enabledStandards.has(ComplianceStandard.CCPA)) {
      rules.push(
        {
          id: 'ccpa-001',
          standard: ComplianceStandard.CCPA,
          name: 'Consumer Data Sale',
          description: 'Detect sale of consumer data without opt-out',
          pattern: /\b(sell|sale|monetize)\s+(consumer|user|customer)\s+(data|information)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Provide clear opt-out mechanism for data sales',
        },
        {
          id: 'ccpa-002',
          standard: ComplianceStandard.CCPA,
          name: 'Data Collection Disclosure',
          description: 'Detect data collection without disclosure',
          pattern: /\b(collect|gather)\s+.*\s+(without|no)\s+(notice|disclosure|consent)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Disclose data collection practices at or before collection',
        }
      );
    }

    // ============ CPRA Rules (California Privacy Rights Act) ============
    if (this.enabledStandards.has(ComplianceStandard.CPRA)) {
      rules.push(
        {
          id: 'cpra-001',
          standard: ComplianceStandard.CPRA,
          name: 'Sensitive Personal Information',
          description: 'Detect use of sensitive personal information',
          pattern: /\b(precise\s+geolocation|racial|ethnic|religious|genetic|biometric|health|sex\s+life)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Limit use of sensitive personal information per CPRA',
        },
        {
          id: 'cpra-002',
          standard: ComplianceStandard.CPRA,
          name: 'Automated Decision-Making',
          description: 'Detect automated decision-making without disclosure',
          pattern: /\b(automated|algorithm|ai|machine\s+learning)\s+.*\s+(decision|profiling)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Provide notice and opt-out for automated decision-making',
        },
      );
    }

    // ============ PIPEDA Rules (Personal Information Protection and Electronic Documents Act - Canada) ============
    if (this.enabledStandards.has(ComplianceStandard.PIPEDA)) {
      rules.push(
        {
          id: 'pipeda-001',
          standard: ComplianceStandard.PIPEDA,
          name: 'Consent for Collection',
          description: 'Detect collection of personal information without consent',
          pattern: /\b(collect|gather|obtain)\s+.*\s+(personal|customer|user)\s+(information|data)\s+.*\s+(without|no)\s+(consent|permission)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Obtain meaningful consent before collecting personal information per PIPEDA Principle 3',
        },
        {
          id: 'pipeda-002',
          standard: ComplianceStandard.PIPEDA,
          name: 'Purpose Limitation',
          description: 'Detect use of personal information beyond stated purpose',
          pattern: /\b(use|utilize|process)\s+.*\s+(for|beyond)\s+(different|other|new)\s+purpose\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Limit use of personal information to purposes identified at collection',
        },
        {
          id: 'pipeda-003',
          standard: ComplianceStandard.PIPEDA,
          name: 'Safeguards Requirement',
          description: 'Detect inadequate security safeguards',
          pattern: /\b(store|keep|maintain)\s+.*\s+(without|no|lacking)\s+(encryption|security|protection)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Implement security safeguards appropriate to sensitivity of information',
        },
        {
          id: 'pipeda-004',
          standard: ComplianceStandard.PIPEDA,
          name: 'Individual Access Rights',
          description: 'Detect denial of access to personal information',
          pattern: /\b(deny|refuse|block)\s+(access|request)\s+.*\s+(personal|own)\s+(information|data)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Provide individuals access to their personal information upon request',
        },
      );
    }

    // ============ LGPD Rules (Lei Geral de Proteção de Dados - Brazil) ============
    if (this.enabledStandards.has(ComplianceStandard.LGPD)) {
      rules.push(
        {
          id: 'lgpd-001',
          standard: ComplianceStandard.LGPD,
          name: 'Lawful Basis for Processing',
          description: 'Detect processing without lawful basis',
          pattern: /\b(process|collect|use)\s+.*\s+(personal|sensitive)\s+data\s+.*\s+(without|no)\s+(consent|legal basis)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure lawful basis for processing personal data per LGPD Article 7',
        },
        {
          id: 'lgpd-002',
          standard: ComplianceStandard.LGPD,
          name: 'Sensitive Personal Data',
          description: 'Detect processing of sensitive personal data',
          pattern: /\b(racial|ethnic|religious|political|health|genetic|biometric|sexual)\s+(data|information|orientation)\b/i,
          severity: ThreatLevel.CRITICAL,
          remediation: 'Obtain specific consent for processing sensitive personal data per LGPD Article 11',
        },
        {
          id: 'lgpd-003',
          standard: ComplianceStandard.LGPD,
          name: 'Data Subject Rights',
          description: 'Detect violations of data subject rights',
          pattern: /\b(deny|refuse|ignore)\s+(deletion|correction|portability|access)\s+request\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Honor data subject rights per LGPD Article 18',
        },
        {
          id: 'lgpd-004',
          standard: ComplianceStandard.LGPD,
          name: 'International Data Transfer',
          description: 'Detect international data transfers without safeguards',
          pattern: /\b(transfer|send|export)\s+.*\s+data\s+.*\s+(to|outside)\s+(brazil|country)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Ensure adequate safeguards for international data transfers per LGPD Article 33',
        },
      );
    }

    // ============ PDPA Rules (Personal Data Protection Act - Singapore) ============
    if (this.enabledStandards.has(ComplianceStandard.PDPA)) {
      rules.push(
        {
          id: 'pdpa-001',
          standard: ComplianceStandard.PDPA,
          name: 'Consent Obligation',
          description: 'Detect collection without consent',
          pattern: /\b(collect|obtain|gather)\s+.*\s+(personal|customer)\s+data\s+.*\s+(without|no)\s+consent\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Obtain consent before collecting personal data per PDPA Section 13',
        },
        {
          id: 'pdpa-002',
          standard: ComplianceStandard.PDPA,
          name: 'Purpose Limitation',
          description: 'Detect use beyond notified purpose',
          pattern: /\b(use|disclose)\s+.*\s+data\s+.*\s+(for|beyond)\s+(different|other|unrelated)\s+purpose\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Use personal data only for purposes notified to individual',
        },
        {
          id: 'pdpa-003',
          standard: ComplianceStandard.PDPA,
          name: 'Data Protection Obligation',
          description: 'Detect inadequate protection measures',
          pattern: /\b(inadequate|insufficient|weak|no)\s+(security|protection|safeguards)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Implement reasonable security arrangements per PDPA Section 24',
        },
        {
          id: 'pdpa-004',
          standard: ComplianceStandard.PDPA,
          name: 'Retention Limitation',
          description: 'Detect excessive data retention',
          pattern: /\b(retain|keep|store)\s+.*\s+data\s+.*\s+(forever|indefinitely|permanently)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Cease retention when purposes are no longer served per PDPA Section 25',
        },
      );
    }

    // ISO 27001 Rules
    if (this.enabledStandards.has(ComplianceStandard.ISO27001)) {
      rules.push(
        {
          id: 'iso27001-001',
          standard: ComplianceStandard.ISO27001,
          name: 'Information Security Policy',
          description: 'Detect actions violating security policies',
          pattern: /\b(bypass|circumvent|ignore|skip)\s+(security|policy|control|safeguard)\b/i,
          severity: ThreatLevel.HIGH,
          remediation: 'Enforce information security policies consistently',
        },
        {
          id: 'iso27001-002',
          standard: ComplianceStandard.ISO27001,
          name: 'Asset Management',
          description: 'Detect unmanaged information assets',
          pattern: /\b(untracked|unmanaged|unknown)\s+(data|asset|system|resource)\b/i,
          severity: ThreatLevel.MEDIUM,
          remediation: 'Maintain inventory of information assets',
        }
      );
    }

    return rules;
  }

  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    try {
      // Extract text content from request
      const textContent = this.extractTextContent(request);

      // Check each compliance rule
      for (const rule of this.rules) {
        // Pattern-based detection
        if (rule.pattern && rule.pattern.test(textContent)) {
          findings.push({
            type: `${rule.standard}_${rule.name}`,
            severity: rule.severity,
            message: `${rule.standard.toUpperCase()} Compliance Violation: ${rule.name}`,
            evidence: this.maskEvidence(textContent.match(rule.pattern)?.[0] || ''),
            location: { path: 'request.messages' },
            remediation: rule.remediation,
            confidence: 0.85,
            metadata: {
              ruleId: rule.id,
              standard: rule.standard,
              description: rule.description,
            },
          });
        }

        // Custom validator
        if (rule.validator && rule.validator(request)) {
          findings.push({
            type: `${rule.standard}_${rule.name}`,
            severity: rule.severity,
            message: `${rule.standard.toUpperCase()} Compliance Violation: ${rule.name}`,
            location: { path: 'request' },
            remediation: rule.remediation,
            confidence: 0.90,
            metadata: {
              ruleId: rule.id,
              standard: rule.standard,
              description: rule.description,
            },
          });
        }
      }

      const executionTimeMs = Date.now() - startTime;
      const threatLevel = this.calculateThreatLevel(findings);

      return {
        scannerId: this.id,
        scannerName: this.name,
        passed: findings.length === 0,
        findings,
        threatLevel,
        score: this.calculateScore(findings),
        executionTimeMs,
        metadata: {
          enabledStandards: Array.from(this.enabledStandards),
          rulesChecked: this.rules.length,
        },
      };
    } catch (error) {
      this.logger.error('Compliance scan failed', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private extractTextContent(request: UnifiedAIRequest): string {
    const parts: string[] = [];

    // Extract from messages
    for (const message of request.messages) {
      if (typeof message.content === 'string') {
        parts.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && 'text' in part && part.text) {
            parts.push(part.text);
          }
        }
      }
    }

    return parts.join(' ');
  }

  private maskEvidence(evidence: string): string {
    // Mask sensitive parts of evidence
    if (evidence.length > 100) {
      return evidence.substring(0, 50) + '...[REDACTED]...' + evidence.substring(evidence.length - 20);
    }
    return evidence;
  }

  private calculateThreatLevel(findings: Finding[]): ThreatLevel {
    if (findings.length === 0) return ThreatLevel.NONE;

    const levels = [ThreatLevel.NONE, ThreatLevel.LOW, ThreatLevel.MEDIUM, ThreatLevel.HIGH, ThreatLevel.CRITICAL];
    
    return findings.reduce((max: ThreatLevel, finding) => {
      const maxIndex = levels.indexOf(max);
      const findingIndex = levels.indexOf(finding.severity);
      return findingIndex > maxIndex ? finding.severity : max;
    }, ThreatLevel.NONE);
  }

  private calculateScore(findings: Finding[]): number {
    if (findings.length === 0) return 1.0;

    const severityScores = {
      [ThreatLevel.NONE]: 0,
      [ThreatLevel.LOW]: 0.2,
      [ThreatLevel.MEDIUM]: 0.4,
      [ThreatLevel.HIGH]: 0.7,
      [ThreatLevel.CRITICAL]: 1.0,
    };

    const totalScore = findings.reduce((sum, finding) => {
      return sum + severityScores[finding.severity];
    }, 0);

    return Math.min(totalScore / findings.length, 1.0);
  }

  /**
   * Enable specific compliance standards
   */
  enableStandard(standard: ComplianceStandard): void {
    this.enabledStandards.add(standard);
    this.rules = this.initializeRules();
  }

  /**
   * Disable specific compliance standards
   */
  disableStandard(standard: ComplianceStandard): void {
    this.enabledStandards.delete(standard);
    this.rules = this.initializeRules();
  }

  /**
   * Get enabled standards
   */
  getEnabledStandards(): ComplianceStandard[] {
    return Array.from(this.enabledStandards);
  }
}

