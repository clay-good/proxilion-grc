/**
 * Data Loss Prevention (DLP) Scanner
 * Detects source code, API keys, credentials, secrets, and confidential data
 */

import { BaseScanner } from './base-scanner.js';
import { UnifiedAIRequest, ScanResult, ThreatLevel, Finding } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { textExtractionCache } from '../utils/text-extractor.js';

interface DLPPattern {
  name: string;
  pattern: RegExp;
  severity: ThreatLevel;
  description: string;
  validator?: (match: string) => boolean;
}

export class DLPScanner extends BaseScanner {
  id = 'dlp-scanner';
  name = 'DLPScanner';
  description = 'Detects source code, API keys, credentials, and confidential data leakage';
  version = '1.0.0';
  private logger: Logger;
  private dlpPatterns: DLPPattern[];

  constructor() {
    super();
    this.logger = new Logger();
    this.dlpPatterns = this.initializeDLPPatterns();
  }

  private initializeDLPPatterns(): DLPPattern[] {
    return [
      // API Keys & Tokens
      {
        name: 'OpenAI API Key',
        pattern: /sk-[a-zA-Z0-9]{48}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'OpenAI API key detected',
      },
      {
        name: 'Anthropic API Key',
        pattern: /sk-ant-[a-zA-Z0-9-]{95,}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'Anthropic API key detected',
      },
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'AWS access key detected',
      },
      {
        name: 'AWS Secret Key',
        pattern: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/gi,
        severity: ThreatLevel.CRITICAL,
        description: 'AWS secret access key detected',
      },
      {
        name: 'Google API Key',
        pattern: /AIza[0-9A-Za-z-_]{35}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'Google API key detected',
      },
      {
        name: 'GitHub Token',
        pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'GitHub token detected',
      },
      {
        name: 'Stripe API Key',
        pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'Stripe API key detected',
      },
      {
        name: 'Generic API Key',
        pattern: /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/gi,
        severity: ThreatLevel.HIGH,
        description: 'Generic API key pattern detected',
      },
      {
        name: 'Bearer Token',
        pattern: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
        severity: ThreatLevel.HIGH,
        description: 'Bearer token detected',
      },
      
      // Database Credentials
      {
        name: 'Database Connection String',
        pattern: /(mongodb|mysql|postgresql|postgres|mssql):\/\/[^\s]+/gi,
        severity: ThreatLevel.CRITICAL,
        description: 'Database connection string detected',
      },
      {
        name: 'Database Password',
        pattern: /(password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
        severity: ThreatLevel.HIGH,
        description: 'Database password detected',
      },
      
      // Private Keys & Certificates
      {
        name: 'RSA Private Key',
        pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
        severity: ThreatLevel.CRITICAL,
        description: 'RSA private key detected',
      },
      {
        name: 'SSH Private Key',
        pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
        severity: ThreatLevel.CRITICAL,
        description: 'SSH private key detected',
      },
      {
        name: 'PGP Private Key',
        pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
        severity: ThreatLevel.CRITICAL,
        description: 'PGP private key detected',
      },
      
      // Source Code Patterns
      {
        name: 'Python Code',
        pattern: /(def\s+\w+\s*\([^)]*\)\s*:|class\s+\w+\s*(\([^)]*\))?\s*:|import\s+\w+|from\s+\w+\s+import)/g,
        severity: ThreatLevel.MEDIUM,
        description: 'Python source code detected',
        validator: (match) => {
          // Only flag if multiple code patterns are present
          return match.split('\n').length > 5;
        },
      },
      {
        name: 'JavaScript Code',
        pattern: /(function\s+\w+\s*\([^)]*\)\s*\{|const\s+\w+\s*=\s*\([^)]*\)\s*=>|class\s+\w+\s*\{|require\s*\(['"]|import\s+.*from\s+['"])/g,
        severity: ThreatLevel.MEDIUM,
        description: 'JavaScript source code detected',
        validator: (match) => {
          return match.split('\n').length > 5;
        },
      },
      {
        name: 'SQL Query',
        pattern: /(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+.*(FROM|INTO|TABLE|DATABASE)/gi,
        severity: ThreatLevel.MEDIUM,
        description: 'SQL query detected',
      },
      
      // Confidential Data Patterns
      {
        name: 'Internal IP Address',
        pattern: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
        severity: ThreatLevel.MEDIUM,
        description: 'Internal IP address detected',
      },
      {
        name: 'Confidential Marker',
        pattern: /\b(confidential|proprietary|internal\s+only|trade\s+secret|classified)\b/gi,
        severity: ThreatLevel.HIGH,
        description: 'Confidential data marker detected',
      },
      {
        name: 'JWT Token',
        pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        severity: ThreatLevel.HIGH,
        description: 'JWT token detected',
      },
      
      // Cloud Provider Credentials
      {
        name: 'Azure Connection String',
        pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+/gi,
        severity: ThreatLevel.CRITICAL,
        description: 'Azure connection string detected',
      },
      {
        name: 'Slack Token',
        pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'Slack token detected',
      },
      {
        name: 'Twilio API Key',
        pattern: /SK[a-z0-9]{32}/g,
        severity: ThreatLevel.CRITICAL,
        description: 'Twilio API key detected',
      },
    ];
  }

  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    try {
      // Extract all text content from the request
      const textContent = this.extractTextContent(request);

      // Scan for DLP patterns
      for (const pattern of this.dlpPatterns) {
        const matches = this.findPatternMatches(textContent, pattern);
        findings.push(...matches);
      }

      // Check for code blocks
      const codeBlockFindings = this.detectCodeBlocks(textContent);
      findings.push(...codeBlockFindings);

      // Calculate overall threat level
      const threatLevel = this.calculateThreatLevel(findings);

      const executionTimeMs = Date.now() - startTime;

      this.logger.info('DLP scan completed', {
        correlationId: request.metadata.correlationId,
        findingsCount: findings.length,
        threatLevel,
        executionTimeMs,
      });

      return {
        scannerId: this.id,
        scannerName: this.name,
        passed: threatLevel === ThreatLevel.NONE,
        findings,
        threatLevel,
        score: this.calculateScore(findings),
        executionTimeMs,
      };
    } catch (error) {
      this.logger.error('DLP scan failed', error as Error);
      return {
        scannerId: this.id,
        scannerName: this.name,
        passed: true,
        findings: [],
        threatLevel: ThreatLevel.NONE,
        score: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  private extractTextContent(request: UnifiedAIRequest): string {
    // Use shared text extraction cache to eliminate redundant extraction across scanners
    const extracted = textExtractionCache.get(request);
    return extracted.fullText;
  }

  private findPatternMatches(text: string, pattern: DLPPattern): Finding[] {
    const findings: Finding[] = [];
    const matches = text.match(pattern.pattern);

    if (matches && matches.length > 0) {
      // Apply validator if present
      if (pattern.validator && !pattern.validator(text)) {
        return findings;
      }

      // Mask the sensitive data in evidence
      const maskedEvidence = this.maskSensitiveData(matches[0]);

      findings.push({
        type: pattern.name,
        severity: pattern.severity,
        message: pattern.description,
        evidence: maskedEvidence,
        location: { path: 'request.messages' },
        confidence: 0.9,
        metadata: {
          matchCount: matches.length,
          pattern: pattern.name,
        },
      });
    }

    return findings;
  }

  private detectCodeBlocks(text: string): Finding[] {
    const findings: Finding[] = [];

    // Detect code blocks with triple backticks
    const codeBlockPattern = /```[\s\S]*?```/g;
    const codeBlocks = text.match(codeBlockPattern);

    if (codeBlocks && codeBlocks.length > 0) {
      for (const block of codeBlocks) {
        if (block.length > 200) { // Only flag substantial code blocks
          findings.push({
            type: 'Code Block',
            severity: ThreatLevel.MEDIUM,
            message: 'Large code block detected in request',
            evidence: '[REDACTED - Code block]',
            location: { path: 'request.messages' },
            confidence: 0.85,
            metadata: {
              blockLength: block.length,
            },
          });
        }
      }
    }

    return findings;
  }

  private maskSensitiveData(data: string): string {
    if (data.length <= 8) {
      return '***';
    }
    // Show first 4 and last 4 characters
    return `${data.substring(0, 4)}...${data.substring(data.length - 4)}`;
  }

  private calculateThreatLevel(findings: Finding[]): ThreatLevel {
    if (findings.length === 0) return ThreatLevel.NONE;

    const criticalCount = findings.filter(f => f.severity === ThreatLevel.CRITICAL).length;
    const highCount = findings.filter(f => f.severity === ThreatLevel.HIGH).length;
    const mediumCount = findings.filter(f => f.severity === ThreatLevel.MEDIUM).length;

    if (criticalCount > 0) return ThreatLevel.CRITICAL;
    if (highCount > 0) return ThreatLevel.HIGH;
    if (mediumCount > 0) return ThreatLevel.MEDIUM;
    return ThreatLevel.LOW;
  }

  private calculateScore(findings: Finding[]): number {
    if (findings.length === 0) return 0;

    const severityScores = {
      [ThreatLevel.CRITICAL]: 100,
      [ThreatLevel.HIGH]: 75,
      [ThreatLevel.MEDIUM]: 50,
      [ThreatLevel.LOW]: 25,
      [ThreatLevel.NONE]: 0,
    };

    const totalScore = findings.reduce((sum, finding) => {
      return sum + severityScores[finding.severity];
    }, 0);

    return Math.min(totalScore / findings.length, 100);
  }
}

