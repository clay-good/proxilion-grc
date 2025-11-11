/**
 * PII (Personally Identifiable Information) detection scanner
 * Enhanced with comprehensive US-based compliance patterns
 */

import { UnifiedAIRequest, ScanResult, ThreatLevel, Finding } from '../types/index.js';
import { BaseScanner } from './base-scanner.js';
import { textExtractionCache } from '../utils/text-extractor.js';

export interface PIIPattern {
  name: string;
  pattern: RegExp;
  severity: ThreatLevel;
  category: 'financial' | 'identity' | 'contact' | 'health' | 'government' | 'biometric';
  complianceStandards: string[]; // e.g., ['PCI-DSS', 'HIPAA', 'GDPR']
  enabled: boolean;
  validator?: (match: string) => boolean;
  description?: string;
}

export interface PIIScannerConfig {
  enabledCategories?: string[];
  customPatterns?: PIIPattern[];
  strictMode?: boolean; // Enable full Luhn validation for credit cards
}

export class PIIScanner extends BaseScanner {
  id = 'pii-scanner';
  name = 'PII Detection Scanner';
  private config: PIIScannerConfig;
  private patterns: PIIPattern[] = [];

  constructor(config: PIIScannerConfig = {}) {
    super();
    this.config = {
      enabledCategories: config.enabledCategories || ['financial', 'identity', 'contact', 'health', 'government', 'biometric'],
      customPatterns: config.customPatterns || [],
      strictMode: config.strictMode ?? false,
    };
    this.initializePatterns();
  }

  private initializePatterns(): void {
    const allPatterns: PIIPattern[] = [
      // ============ FINANCIAL PATTERNS (PCI-DSS) ============
      {
        name: 'Credit Card Number (Visa)',
        pattern: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'financial',
        complianceStandards: ['PCI-DSS'],
        enabled: true,
        validator: this.validateCreditCard.bind(this),
        description: 'Visa credit card number (starts with 4)',
      },
      {
        name: 'Credit Card Number (Mastercard)',
        pattern: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'financial',
        complianceStandards: ['PCI-DSS'],
        enabled: true,
        validator: this.validateCreditCard.bind(this),
        description: 'Mastercard credit card number (starts with 51-55)',
      },
      {
        name: 'Credit Card Number (American Express)',
        pattern: /\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'financial',
        complianceStandards: ['PCI-DSS'],
        enabled: true,
        validator: this.validateCreditCard.bind(this),
        description: 'American Express credit card number (starts with 34 or 37)',
      },
      {
        name: 'Credit Card Number (Discover)',
        pattern: /\b6(?:011|5\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'financial',
        complianceStandards: ['PCI-DSS'],
        enabled: true,
        validator: this.validateCreditCard.bind(this),
        description: 'Discover credit card number (starts with 6011 or 65)',
      },
      {
        name: 'Credit Card CVV',
        pattern: /\b\d{3,4}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'financial',
        complianceStandards: ['PCI-DSS'],
        enabled: false, // Too many false positives, enable with context
        description: 'Credit card CVV/CVC code',
      },
      {
        name: 'US Bank Account Number',
        pattern: /\b\d{8,17}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'financial',
        complianceStandards: ['GLBA', 'SOX'],
        enabled: false, // Too generic, enable with context
        description: 'US bank account number (8-17 digits)',
      },
      {
        name: 'US Bank Routing Number',
        pattern: /\b[0-9]{9}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'financial',
        complianceStandards: ['GLBA', 'SOX'],
        enabled: false, // Too generic, enable with context
        validator: this.validateRoutingNumber.bind(this),
        description: 'US bank routing number (9 digits)',
      },
      {
        name: 'IBAN',
        pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'financial',
        complianceStandards: ['GDPR', 'PSD2'],
        enabled: true,
        description: 'International Bank Account Number',
      },
      {
        name: 'SWIFT/BIC Code',
        pattern: /\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/g,
        severity: ThreatLevel.MEDIUM,
        category: 'financial',
        complianceStandards: ['GDPR'],
        enabled: true,
        description: 'SWIFT/BIC code for international transfers',
      },

      // ============ IDENTITY PATTERNS (US-specific) ============
      {
        name: 'US Social Security Number',
        pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'identity',
        complianceStandards: ['HIPAA', 'GLBA', 'SOX'],
        enabled: true,
        validator: this.validateSSN.bind(this),
        description: 'US Social Security Number (SSN)',
      },
      {
        name: 'US Driver License Number',
        pattern: /\b[A-Z]{1,2}\d{5,8}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'identity',
        complianceStandards: ['REAL-ID'],
        enabled: true,
        description: 'US Driver License Number (varies by state)',
      },
      {
        name: 'US Passport Number',
        pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'identity',
        complianceStandards: ['REAL-ID'],
        enabled: true,
        description: 'US Passport Number',
      },
      {
        name: 'US Individual Taxpayer Identification Number (ITIN)',
        pattern: /\b9\d{2}[-\s]?\d{2}[-\s]?\d{4}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'identity',
        complianceStandards: ['IRS'],
        enabled: true,
        description: 'US ITIN (starts with 9)',
      },
      {
        name: 'US Employer Identification Number (EIN)',
        pattern: /\b\d{2}[-\s]?\d{7}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'identity',
        complianceStandards: ['IRS', 'SOX'],
        enabled: true,
        description: 'US Employer Identification Number',
      },

      // ============ CONTACT PATTERNS ============
      {
        name: 'Email Address',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        severity: ThreatLevel.MEDIUM,
        category: 'contact',
        complianceStandards: ['GDPR', 'CCPA', 'CAN-SPAM'],
        enabled: true,
        description: 'Email address',
      },
      {
        name: 'US Phone Number',
        pattern: /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        severity: ThreatLevel.MEDIUM,
        category: 'contact',
        complianceStandards: ['TCPA', 'GDPR', 'CCPA'],
        enabled: true,
        description: 'US phone number',
      },
      {
        name: 'International Phone Number',
        pattern: /\b\+\d{1,3}[-.\s]?\d{1,14}\b/g,
        severity: ThreatLevel.MEDIUM,
        category: 'contact',
        complianceStandards: ['GDPR'],
        enabled: true,
        description: 'International phone number',
      },
      {
        name: 'US ZIP Code',
        pattern: /\b\d{5}(-\d{4})?\b/g,
        severity: ThreatLevel.LOW,
        category: 'contact',
        complianceStandards: ['HIPAA'],
        enabled: true,
        description: 'US ZIP code',
      },
      {
        name: 'IP Address (IPv4)',
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        severity: ThreatLevel.LOW,
        category: 'contact',
        complianceStandards: ['GDPR', 'CCPA'],
        enabled: true,
        validator: this.validateIPAddress.bind(this),
        description: 'IPv4 address',
      },
      {
        name: 'IP Address (IPv6)',
        pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
        severity: ThreatLevel.LOW,
        category: 'contact',
        complianceStandards: ['GDPR', 'CCPA'],
        enabled: true,
        description: 'IPv6 address',
      },
      {
        name: 'MAC Address',
        pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
        severity: ThreatLevel.LOW,
        category: 'contact',
        complianceStandards: ['GDPR'],
        enabled: true,
        description: 'MAC address',
      },

      // ============ HEALTH PATTERNS (HIPAA) ============
      {
        name: 'US Medicare Beneficiary Identifier (MBI)',
        pattern: /\b[1-9][A-Z]{2}[0-9]{1}[A-Z]{1}[0-9]{2}[A-Z]{2}[0-9]{2}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'health',
        complianceStandards: ['HIPAA'],
        enabled: true,
        description: 'US Medicare Beneficiary Identifier',
      },
      {
        name: 'US National Provider Identifier (NPI)',
        pattern: /\b\d{10}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'health',
        complianceStandards: ['HIPAA'],
        enabled: false, // Too generic, enable with context
        description: 'US National Provider Identifier (10 digits)',
      },
      {
        name: 'US Drug Enforcement Administration (DEA) Number',
        pattern: /\b[A-Z]{2}\d{7}\b/g,
        severity: ThreatLevel.HIGH,
        category: 'health',
        complianceStandards: ['HIPAA', 'DEA'],
        enabled: true,
        description: 'US DEA number for controlled substances',
      },

      // ============ GOVERNMENT PATTERNS ============
      {
        name: 'US Military ID Number',
        pattern: /\b\d{10}\b/g,
        severity: ThreatLevel.CRITICAL,
        category: 'government',
        complianceStandards: ['DoD'],
        enabled: false, // Too generic, enable with context
        description: 'US Military ID number',
      },
      {
        name: 'US Vehicle Identification Number (VIN)',
        pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
        severity: ThreatLevel.MEDIUM,
        category: 'government',
        complianceStandards: ['DPPA'],
        enabled: true,
        description: 'Vehicle Identification Number',
      },

      // ============ BIOMETRIC PATTERNS ============
      {
        name: 'Biometric Data Reference',
        pattern: /\b(fingerprint|retina|iris|facial\s+recognition|biometric)\b/gi,
        severity: ThreatLevel.CRITICAL,
        category: 'biometric',
        complianceStandards: ['GDPR', 'BIPA', 'CCPA'],
        enabled: true,
        description: 'Reference to biometric data',
      },
    ];

    // Filter patterns based on enabled categories and custom patterns
    this.patterns = [
      ...allPatterns.filter(p =>
        p.enabled &&
        this.config.enabledCategories!.includes(p.category)
      ),
      ...(this.config.customPatterns || []),
    ];
  }

  /**
   * Get all available patterns (for UI configuration)
   */
  public getAllPatterns(): PIIPattern[] {
    return this.patterns;
  }

  /**
   * Get patterns by category (for UI filtering)
   */
  public getPatternsByCategory(category: string): PIIPattern[] {
    return this.patterns.filter(p => p.category === category);
  }

  /**
   * Get enabled patterns count
   */
  public getEnabledPatternsCount(): number {
    return this.patterns.filter(p => p.enabled).length;
  }

  /**
   * Update pattern configuration (self-service)
   */
  public updatePatternConfig(patternName: string, enabled: boolean): void {
    const pattern = this.patterns.find(p => p.name === patternName);
    if (pattern) {
      pattern.enabled = enabled;
    }
  }

  /**
   * Update pattern severity (self-service)
   */
  public updatePatternSeverity(patternName: string, severity: ThreatLevel): void {
    const pattern = this.patterns.find(p => p.name === patternName);
    if (pattern) {
      pattern.severity = severity;
    }
  }

  /**
   * Update pattern regex (advanced self-service)
   */
  public updatePatternRegex(patternName: string, regex: string): void {
    const pattern = this.patterns.find(p => p.name === patternName);
    if (pattern) {
      try {
        pattern.pattern = new RegExp(regex, 'g');
      } catch (error) {
        throw new Error(`Invalid regex: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Add custom pattern (self-service)
   */
  public addCustomPattern(pattern: PIIPattern): void {
    // Validate pattern before adding
    if (!pattern.name || !pattern.pattern) {
      throw new Error('Pattern must have name and pattern');
    }

    // Check for duplicate names
    if (this.patterns.find(p => p.name === pattern.name)) {
      throw new Error(`Pattern with name "${pattern.name}" already exists`);
    }

    this.patterns.push(pattern);
  }

  /**
   * Remove custom pattern (self-service)
   */
  public removeCustomPattern(patternName: string): void {
    const index = this.patterns.findIndex(p => p.name === patternName);
    if (index !== -1) {
      this.patterns.splice(index, 1);
    }
  }

  /**
   * Bulk update patterns (for UI batch operations)
   */
  public bulkUpdatePatterns(updates: Array<{ name: string; enabled: boolean }>): void {
    for (const update of updates) {
      this.updatePatternConfig(update.name, update.enabled);
    }
  }

  /**
   * Reset patterns to defaults
   */
  public resetToDefaults(): void {
    this.patterns = [];
    this.initializePatterns();
  }

  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    // Extract all text content from messages
    const textContent = this.extractTextContent(request);

    // Scan for each PII pattern
    for (const pattern of this.patterns) {
      if (!pattern.enabled) continue;

      const matches = textContent.matchAll(pattern.pattern);

      for (const match of matches) {
        const value = match[0];

        // Apply validator if present
        if (pattern.validator && !pattern.validator(value)) {
          continue;
        }

        findings.push({
          type: pattern.name,
          severity: pattern.severity,
          message: `Detected ${pattern.name}: ${this.maskValue(value)}`,
          evidence: this.maskValue(value),
          remediation: `Remove or redact ${pattern.name} from the request`,
          confidence: 0.9,
          metadata: {
            category: pattern.category,
            complianceStandards: pattern.complianceStandards,
            description: pattern.description,
          },
        });
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const passed = findings.length === 0;
    const threatLevel = this.calculateThreatLevel(findings);
    const score = this.calculateScore(findings);

    return this.createResult(passed, threatLevel, score, findings, executionTimeMs);
  }

  private extractTextContent(request: UnifiedAIRequest): string {
    // Use shared text extraction cache to eliminate redundant extraction across scanners
    const extracted = textExtractionCache.get(request);
    return extracted.fullText;
  }

  private maskValue(value: string): string {
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  private calculateThreatLevel(findings: Finding[]): ThreatLevel {
    if (findings.length === 0) return ThreatLevel.NONE;

    const maxSeverity = findings.reduce((max, finding) => {
      const severityOrder = [
        ThreatLevel.NONE,
        ThreatLevel.LOW,
        ThreatLevel.MEDIUM,
        ThreatLevel.HIGH,
        ThreatLevel.CRITICAL,
      ];
      const currentIndex = severityOrder.indexOf(finding.severity);
      const maxIndex = severityOrder.indexOf(max);
      return currentIndex > maxIndex ? finding.severity : max;
    }, ThreatLevel.NONE);

    return maxSeverity;
  }

  private calculateScore(findings: Finding[]): number {
    if (findings.length === 0) return 0;

    const severityScores = {
      [ThreatLevel.NONE]: 0,
      [ThreatLevel.LOW]: 0.2,
      [ThreatLevel.MEDIUM]: 0.5,
      [ThreatLevel.HIGH]: 0.8,
      [ThreatLevel.CRITICAL]: 1.0,
    };

    const totalScore = findings.reduce((sum, finding) => {
      return sum + severityScores[finding.severity] * finding.confidence;
    }, 0);

    return Math.min(totalScore / findings.length, 1.0);
  }

  /**
   * Validate credit card using Luhn algorithm
   */
  private validateCreditCard(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');

    // Must be 13-19 digits
    if (digits.length < 13 || digits.length > 19) return false;

    // If strict mode is disabled, accept any valid-looking card number
    if (!this.config.strictMode) {
      return true;
    }

    // Full Luhn algorithm validation (strict mode)
    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Validate US Social Security Number
   */
  private validateSSN(ssn: string): boolean {
    const digits = ssn.replace(/\D/g, '');

    if (digits.length !== 9) return false;

    // Invalid SSN patterns
    const area = parseInt(digits.substring(0, 3), 10);
    const group = parseInt(digits.substring(3, 5), 10);
    const serial = parseInt(digits.substring(5, 9), 10);

    // Area number cannot be 000, 666, or 900-999
    if (area === 0 || area === 666 || area >= 900) return false;

    // Group number cannot be 00
    if (group === 0) return false;

    // Serial number cannot be 0000
    if (serial === 0) return false;

    return true;
  }

  /**
   * Validate US bank routing number using checksum
   */
  private validateRoutingNumber(routing: string): boolean {
    const digits = routing.replace(/\D/g, '');

    if (digits.length !== 9) return false;

    // Routing number checksum algorithm
    const checksum =
      (3 * (parseInt(digits[0]) + parseInt(digits[3]) + parseInt(digits[6]))) +
      (7 * (parseInt(digits[1]) + parseInt(digits[4]) + parseInt(digits[7]))) +
      (1 * (parseInt(digits[2]) + parseInt(digits[5]) + parseInt(digits[8])));

    return checksum % 10 === 0;
  }

  /**
   * Validate IPv4 address
   */
  private validateIPAddress(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;

    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
}

