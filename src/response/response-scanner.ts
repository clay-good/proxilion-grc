/**
 * Response Content Scanner
 * 
 * Scans AI responses for sensitive data, PII, harmful content, and policy violations
 * before returning to users. Provides redaction and filtering capabilities.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { UnifiedAIResponse } from '../types/index.js';
import { ThreatLevel } from '../types/index.js';

export interface ResponseScanResult {
  safe: boolean;
  threatLevel: ThreatLevel;
  findings: ResponseFinding[];
  redactedResponse?: UnifiedAIResponse;
  originalContent?: string;
  metadata: {
    scannedAt: number;
    duration: number;
    findingsCount: number;
    redactionsCount: number;
  };
}

export interface ResponseFinding {
  type: ResponseFindingType;
  severity: ThreatLevel;
  field: string;
  value: string;
  redacted: boolean;
  position: {
    start: number;
    end: number;
  };
  reason: string;
}

export type ResponseFindingType =
  | 'pii'
  | 'credentials'
  | 'harmful_content'
  | 'policy_violation'
  | 'data_leakage'
  | 'malicious_code'
  | 'prompt_leakage';

export interface ResponseScannerConfig {
  enablePiiDetection: boolean;
  enableCredentialDetection: boolean;
  enableHarmfulContentDetection: boolean;
  enablePolicyViolation: boolean;
  enableDataLeakageDetection: boolean;
  enableMaliciousCodeDetection: boolean;
  enablePromptLeakageDetection: boolean;
  autoRedact: boolean;
  redactionStrategy: 'mask' | 'remove' | 'replace';
  redactionPlaceholder: string;
  logFindings: boolean;
  collectMetrics: boolean;
}

export class ResponseScanner {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<ResponseScannerConfig>;

  // Static pattern definitions - shared across all instances
  private static readonly piiPatterns = {
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    passport: /\b[A-Z]{1,2}\d{6,9}\b/g,
  };

  private static readonly credentialPatterns = {
    apiKey: /\b[A-Za-z0-9_-]{32,}\b/g,
    awsKey: /\b(AKIA[0-9A-Z]{16})\b/g,
    privateKey: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g,
    password: /password\s*[:=]\s*['"]?([^'"\s]+)['"]?/gi,
    token: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
    jwt: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
  };

  private static readonly harmfulPatterns = {
    violence: /(kill|murder|assault|attack|harm|hurt|destroy)\s+(people|person|someone|them)/gi,
    hate: /(hate|despise|loathe)\s+(jews|muslims|christians|blacks|whites|asians|lgbtq)/gi,
    selfHarm: /(suicide|self-harm|cut myself|end my life|kill myself)/gi,
    illegal: /(how to (make|build|create) (bomb|explosive|weapon|drug))/gi,
    exploitation: /(child (abuse|exploitation|pornography)|human trafficking)/gi,
  };

  private static readonly maliciousCodePatterns = {
    sqlInjection: /(union\s+select|drop\s+table|delete\s+from|insert\s+into)/gi,
    xss: /(<script|javascript:|onerror=|onload=)/gi,
    commandInjection: /(\||;|&&|\$\(|\`)/g,
    pathTraversal: /(\.\.\/|\.\.\\)/g,
  };

  private static readonly promptLeakagePatterns = {
    systemPrompt: /(system prompt|system message|initial instructions|you are a|your role is)/gi,
    instructions: /(ignore previous|disregard|forget all|new instructions)/gi,
  };

  constructor(config?: Partial<ResponseScannerConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();

    this.config = {
      enablePiiDetection: config?.enablePiiDetection ?? true,
      enableCredentialDetection: config?.enableCredentialDetection ?? true,
      enableHarmfulContentDetection: config?.enableHarmfulContentDetection ?? true,
      enablePolicyViolation: config?.enablePolicyViolation ?? true,
      enableDataLeakageDetection: config?.enableDataLeakageDetection ?? true,
      enableMaliciousCodeDetection: config?.enableMaliciousCodeDetection ?? true,
      enablePromptLeakageDetection: config?.enablePromptLeakageDetection ?? true,
      autoRedact: config?.autoRedact ?? true,
      redactionStrategy: config?.redactionStrategy ?? 'mask',
      redactionPlaceholder: config?.redactionPlaceholder ?? '[REDACTED]',
      logFindings: config?.logFindings ?? true,
      collectMetrics: config?.collectMetrics ?? true,
    };

    this.logger.info('Response scanner initialized', {
      enablePiiDetection: this.config.enablePiiDetection,
      enableCredentialDetection: this.config.enableCredentialDetection,
      autoRedact: this.config.autoRedact,
    });
  }

  /**
   * Scan AI response for sensitive content and policy violations
   */
  async scanResponse(response: UnifiedAIResponse): Promise<ResponseScanResult> {
    const startTime = Date.now();
    const findings: ResponseFinding[] = [];

    try {
      // Extract text content from response
      const content = this.extractContent(response);
      const originalContent = content;

      // Run all enabled scanners
      if (this.config.enablePiiDetection) {
        findings.push(...this.scanForPii(content));
      }

      if (this.config.enableCredentialDetection) {
        findings.push(...this.scanForCredentials(content));
      }

      if (this.config.enableHarmfulContentDetection) {
        findings.push(...this.scanForHarmfulContent(content));
      }

      if (this.config.enableMaliciousCodeDetection) {
        findings.push(...this.scanForMaliciousCode(content));
      }

      if (this.config.enablePromptLeakageDetection) {
        findings.push(...this.scanForPromptLeakage(content));
      }

      // Determine threat level
      const threatLevel = this.calculateThreatLevel(findings);
      const safe = threatLevel === ThreatLevel.NONE || threatLevel === ThreatLevel.LOW;

      // Apply redaction if enabled
      let redactedResponse: UnifiedAIResponse | undefined;
      let redactionsCount = 0;

      if (this.config.autoRedact && findings.length > 0) {
        const result = this.applyRedactions(response, findings);
        redactedResponse = result.response;
        redactionsCount = result.count;
      }

      const duration = Date.now() - startTime;

      // Log findings
      if (this.config.logFindings && findings.length > 0) {
        this.logger.warn('Response scan findings', {
          findingsCount: findings.length,
          threatLevel,
          redactionsCount,
          findings: findings.map((f) => ({
            type: f.type,
            severity: f.severity,
            field: f.field,
          })),
        });
      }

      // Collect metrics
      if (this.config.collectMetrics) {
        this.metrics.increment('response_scan_total');
        if (safe) {
          this.metrics.increment('response_scan_safe_total');
        } else {
          this.metrics.increment('response_scan_unsafe_total');
        }
        this.metrics.histogram('response_scan_duration_ms', duration);
        this.metrics.gauge('response_scan_findings_count', findings.length);
      }

      return {
        safe,
        threatLevel,
        findings,
        redactedResponse,
        originalContent,
        metadata: {
          scannedAt: Date.now(),
          duration,
          findingsCount: findings.length,
          redactionsCount,
        },
      };
    } catch (error) {
      this.logger.error('Response scan error', error as Error);
      throw error;
    }
  }

  /**
   * Extract text content from response
   */
  private extractContent(response: UnifiedAIResponse): string {
    // UnifiedAIResponse has a content property
    return response.content || '';
  }

  /**
   * Scan for PII in content
   */
  private scanForPii(content: string): ResponseFinding[] {
    const findings: ResponseFinding[] = [];

    for (const [type, pattern] of Object.entries(ResponseScanner.piiPatterns)) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          findings.push({
            type: 'pii',
            severity: ThreatLevel.HIGH,
            field: 'response.content',
            value: match[0],
            redacted: false,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            reason: `PII detected: ${type}`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Scan for credentials in content
   */
  private scanForCredentials(content: string): ResponseFinding[] {
    const findings: ResponseFinding[] = [];

    for (const [type, pattern] of Object.entries(ResponseScanner.credentialPatterns)) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          findings.push({
            type: 'credentials',
            severity: ThreatLevel.CRITICAL,
            field: 'response.content',
            value: match[0],
            redacted: false,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            reason: `Credential detected: ${type}`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Scan for harmful content
   */
  private scanForHarmfulContent(content: string): ResponseFinding[] {
    const findings: ResponseFinding[] = [];

    for (const [type, pattern] of Object.entries(ResponseScanner.harmfulPatterns)) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          findings.push({
            type: 'harmful_content',
            severity: ThreatLevel.CRITICAL,
            field: 'response.content',
            value: match[0],
            redacted: false,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            reason: `Harmful content detected: ${type}`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Scan for malicious code
   */
  private scanForMaliciousCode(content: string): ResponseFinding[] {
    const findings: ResponseFinding[] = [];

    for (const [type, pattern] of Object.entries(ResponseScanner.maliciousCodePatterns)) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          findings.push({
            type: 'malicious_code',
            severity: ThreatLevel.HIGH,
            field: 'response.content',
            value: match[0],
            redacted: false,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            reason: `Malicious code detected: ${type}`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Scan for prompt leakage
   */
  private scanForPromptLeakage(content: string): ResponseFinding[] {
    const findings: ResponseFinding[] = [];

    for (const [type, pattern] of Object.entries(ResponseScanner.promptLeakagePatterns)) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match.index !== undefined) {
          findings.push({
            type: 'prompt_leakage',
            severity: ThreatLevel.MEDIUM,
            field: 'response.content',
            value: match[0],
            redacted: false,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            reason: `Prompt leakage detected: ${type}`,
          });
        }
      }
    }

    return findings;
  }

  // Additional methods will be added in the next section...
  private calculateThreatLevel(findings: ResponseFinding[]): ThreatLevel {
    if (findings.length === 0) return ThreatLevel.NONE;

    const hasCritical = findings.some((f) => f.severity === ThreatLevel.CRITICAL);
    if (hasCritical) return ThreatLevel.CRITICAL;

    const hasHigh = findings.some((f) => f.severity === ThreatLevel.HIGH);
    if (hasHigh) return ThreatLevel.HIGH;

    const hasMedium = findings.some((f) => f.severity === ThreatLevel.MEDIUM);
    if (hasMedium) return ThreatLevel.MEDIUM;

    return ThreatLevel.LOW;
  }

  private applyRedactions(
    response: UnifiedAIResponse,
    findings: ResponseFinding[]
  ): { response: UnifiedAIResponse; count: number } {
    const redactedResponse = JSON.parse(JSON.stringify(response)) as UnifiedAIResponse;
    let redactionsCount = 0;

    // Sort findings by position (descending) to avoid index shifting
    const sortedFindings = [...findings].sort((a, b) => b.position.start - a.position.start);

    let content = redactedResponse.content;
    for (const finding of sortedFindings) {
      const redacted = this.redactText(
        content,
        finding.position.start,
        finding.position.end
      );
      if (redacted !== content) {
        content = redacted;
        finding.redacted = true;
        redactionsCount++;
      }
    }
    redactedResponse.content = content;

    return { response: redactedResponse, count: redactionsCount };
  }

  private redactText(text: string, start: number, end: number): string {
    const before = text.substring(0, start);
    const after = text.substring(end);

    switch (this.config.redactionStrategy) {
      case 'mask':
        return before + this.config.redactionPlaceholder + after;
      case 'remove':
        return before + after;
      case 'replace':
        return before + this.config.redactionPlaceholder + after;
      default:
        return before + this.config.redactionPlaceholder + after;
    }
  }
}

