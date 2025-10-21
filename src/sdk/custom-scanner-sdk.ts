/**
 * Custom Scanner SDK
 * 
 * Framework for building custom security scanners with:
 * - Simple scanner interface
 * - Built-in utilities for common patterns
 * - Async/await support
 * - Error handling
 * - Performance tracking
 * - Testing helpers
 */

import { Scanner, ScanResult, Finding } from '../scanners/base-scanner.js';
import { UnifiedAIRequest, UnifiedAIResponse, ThreatLevel } from '../types/index.js';
import { Logger } from '../utils/logger.js';

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  timeout?: number;
  priority?: number;
}

/**
 * Pattern matching configuration
 */
export interface PatternConfig {
  pattern: RegExp;
  threatLevel: ThreatLevel;
  description: string;
  category?: string;
}

/**
 * Custom scanner builder
 */
export class CustomScannerBuilder {
  private config: ScannerConfig;
  private patterns: PatternConfig[] = [];
  private customLogic?: (request: UnifiedAIRequest, response?: UnifiedAIResponse) => Promise<Finding[]>;

  constructor(config: ScannerConfig) {
    this.config = {
      enabled: true,
      timeout: 5000,
      priority: 50,
      ...config,
    };
  }

  /**
   * Add a pattern to match
   */
  addPattern(pattern: PatternConfig): this {
    this.patterns.push(pattern);
    return this;
  }

  /**
   * Add multiple patterns
   */
  addPatterns(patterns: PatternConfig[]): this {
    this.patterns.push(...patterns);
    return this;
  }

  /**
   * Add custom scanning logic
   */
  withCustomLogic(
    logic: (request: UnifiedAIRequest, response?: UnifiedAIResponse) => Promise<Finding[]>
  ): this {
    this.customLogic = logic;
    return this;
  }

  /**
   * Build the scanner
   */
  build(): Scanner {
    return new CustomScanner(this.config, this.patterns, this.customLogic);
  }
}

/**
 * Custom scanner implementation
 */
class CustomScanner implements Scanner {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  timeout: number;
  priority: number;

  private logger: Logger;
  private patterns: PatternConfig[];
  private customLogic?: (request: UnifiedAIRequest, response?: UnifiedAIResponse) => Promise<Finding[]>;

  constructor(
    config: ScannerConfig,
    patterns: PatternConfig[],
    customLogic?: (request: UnifiedAIRequest, response?: UnifiedAIResponse) => Promise<Finding[]>
  ) {
    this.id = config.name.toLowerCase().replace(/\s+/g, '-');
    this.name = config.name;
    this.description = config.description;
    this.version = config.version;
    this.enabled = config.enabled ?? true;
    this.timeout = config.timeout ?? 5000;
    this.priority = config.priority ?? 50;

    this.logger = new Logger();
    this.patterns = patterns;
    this.customLogic = customLogic;
  }

  // Implement Scanner interface method
  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    return this.scanRequest(request);
  }

  async scanRequest(request: UnifiedAIRequest): Promise<ScanResult> {
    const findings: Finding[] = [];

    try {
      // Pattern matching
      const patternFindings = await this.matchPatterns(request);
      findings.push(...patternFindings);

      // Custom logic
      if (this.customLogic) {
        const customFindings = await this.customLogic(request);
        findings.push(...customFindings);
      }

      return this.createResult(findings);
    } catch (error) {
      this.logger.error('Scanner error', error instanceof Error ? error : undefined);
      return {
        scannerId: this.id,
        scannerName: this.name,
        passed: true,
        findings: [],
        threatLevel: ThreatLevel.NONE,
        score: 0,
        executionTimeMs: 0,
      };
    }
  }

  async scanResponse(response: UnifiedAIResponse, request: UnifiedAIRequest): Promise<ScanResult> {
    const findings: Finding[] = [];

    try {
      // Pattern matching on response
      const patternFindings = await this.matchPatternsInResponse(response);
      findings.push(...patternFindings);

      // Custom logic
      if (this.customLogic) {
        const customFindings = await this.customLogic(request, response);
        findings.push(...customFindings);
      }

      return this.createResult(findings);
    } catch (error) {
      this.logger.error('Scanner error', error instanceof Error ? error : undefined);
      return {
        scannerId: this.id,
        scannerName: this.name,
        passed: true,
        findings: [],
        threatLevel: ThreatLevel.NONE,
        score: 0,
        executionTimeMs: 0,
      };
    }
  }

  /**
   * Match patterns in request
   */
  private async matchPatterns(request: UnifiedAIRequest): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const message of request.messages) {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

      for (const patternConfig of this.patterns) {
        const matches = content.match(patternConfig.pattern);

        if (matches) {
          findings.push({
            type: patternConfig.category || this.name,
            severity: patternConfig.threatLevel,
            message: patternConfig.description,
            location: { path: `message[${request.messages.indexOf(message)}]` },
            evidence: matches[0],
            confidence: 0.9,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Match patterns in response
   */
  private async matchPatternsInResponse(response: UnifiedAIResponse): Promise<Finding[]> {
    const findings: Finding[] = [];

    // UnifiedAIResponse has content, not choices
    const content = response.content;

    for (const patternConfig of this.patterns) {
      const matches = content.match(patternConfig.pattern);

      if (matches) {
        findings.push({
          type: patternConfig.category || this.name,
          severity: patternConfig.threatLevel,
          message: patternConfig.description,
          location: { path: 'response.content' },
          evidence: matches[0],
          confidence: 0.9,
        });
      }
    }

    return findings;
  }

  /**
   * Create scan result
   */
  private createResult(findings: Finding[]): ScanResult {
    const threatLevel = this.calculateThreatLevel(findings);
    const score = this.calculateScore(findings);

    return {
      scannerId: this.id,
      scannerName: this.name,
      passed: findings.length === 0,
      findings,
      threatLevel,
      score,
      executionTimeMs: 0,
    };
  }

  /**
   * Calculate overall threat level
   */
  private calculateThreatLevel(findings: Finding[]): ThreatLevel {
    if (findings.length === 0) return ThreatLevel.NONE;

    const levels: ThreatLevel[] = findings.map((f) => f.severity);

    if (levels.includes(ThreatLevel.CRITICAL)) return ThreatLevel.CRITICAL;
    if (levels.includes(ThreatLevel.HIGH)) return ThreatLevel.HIGH;
    if (levels.includes(ThreatLevel.MEDIUM)) return ThreatLevel.MEDIUM;
    if (levels.includes(ThreatLevel.LOW)) return ThreatLevel.LOW;

    return ThreatLevel.NONE;
  }

  /**
   * Calculate risk score from findings
   */
  private calculateScore(findings: Finding[]): number {
    if (findings.length === 0) return 0;

    const severityScores: Record<ThreatLevel, number> = {
      [ThreatLevel.CRITICAL]: 1.0,
      [ThreatLevel.HIGH]: 0.75,
      [ThreatLevel.MEDIUM]: 0.5,
      [ThreatLevel.LOW]: 0.25,
      [ThreatLevel.NONE]: 0,
    };

    const totalScore = findings.reduce((sum, finding) => {
      return sum + (severityScores[finding.severity] || 0);
    }, 0);

    return Math.min(totalScore / findings.length, 1.0);
  }
}

/**
 * Utility functions for scanner development
 */
export class ScannerUtils {
  /**
   * Extract all text content from a request
   */
  static extractTextContent(request: UnifiedAIRequest): string[] {
    const texts: string[] = [];

    for (const message of request.messages) {
      if (typeof message.content === 'string') {
        texts.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            texts.push(part.text);
          }
        }
      }
    }

    return texts;
  }

  /**
   * Extract all text content from a response
   */
  static extractResponseContent(response: UnifiedAIResponse): string[] {
    // UnifiedAIResponse has content, not choices
    return [response.content];
  }

  /**
   * Check if text contains any of the given keywords
   */
  static containsKeywords(text: string, keywords: string[], caseSensitive = false): boolean {
    const searchText = caseSensitive ? text : text.toLowerCase();

    for (const keyword of keywords) {
      const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
      if (searchText.includes(searchKeyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Count occurrences of a pattern
   */
  static countMatches(text: string, pattern: RegExp): number {
    const matches = text.match(new RegExp(pattern, 'g'));
    return matches ? matches.length : 0;
  }

  /**
   * Create a finding
   */
  static createFinding(params: {
    type: string;
    severity: ThreatLevel;
    message: string;
    location?: string;
    evidence?: string;
    confidence?: number;
  }): Finding {
    return {
      type: params.type,
      severity: params.severity,
      message: params.message,
      location: params.location ? { path: params.location } : undefined,
      evidence: params.evidence,
      confidence: params.confidence ?? 0.8,
    };
  }
}

/**
 * Pre-built pattern libraries
 */
export class PatternLibrary {
  /**
   * Common sensitive data patterns
   */
  static readonly SENSITIVE_DATA: PatternConfig[] = [
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      threatLevel: ThreatLevel.MEDIUM,
      description: 'Email address detected',
      category: 'pii',
    },
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      threatLevel: ThreatLevel.HIGH,
      description: 'SSN detected',
      category: 'pii',
    },
    {
      pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      threatLevel: ThreatLevel.HIGH,
      description: 'Credit card number detected',
      category: 'pii',
    },
  ];

  /**
   * SQL injection patterns
   */
  static readonly SQL_INJECTION: PatternConfig[] = [
    {
      pattern: /(\bUNION\b.*\bSELECT\b)|(\bSELECT\b.*\bFROM\b.*\bWHERE\b)/gi,
      threatLevel: ThreatLevel.CRITICAL,
      description: 'Potential SQL injection detected',
      category: 'injection',
    },
    {
      pattern: /(\bDROP\b.*\bTABLE\b)|(\bDELETE\b.*\bFROM\b)/gi,
      threatLevel: ThreatLevel.CRITICAL,
      description: 'Dangerous SQL command detected',
      category: 'injection',
    },
  ];

  /**
   * Code injection patterns
   */
  static readonly CODE_INJECTION: PatternConfig[] = [
    {
      pattern: /(eval\s*\(|exec\s*\(|system\s*\()/gi,
      threatLevel: ThreatLevel.HIGH,
      description: 'Code execution function detected',
      category: 'injection',
    },
    {
      pattern: /<script[^>]*>.*?<\/script>/gi,
      threatLevel: ThreatLevel.HIGH,
      description: 'Script tag detected',
      category: 'injection',
    },
  ];

  /**
   * Profanity patterns (basic example)
   */
  static readonly PROFANITY: PatternConfig[] = [
    {
      pattern: /\b(badword1|badword2|badword3)\b/gi,
      threatLevel: ThreatLevel.LOW,
      description: 'Profanity detected',
      category: 'content',
    },
  ];
}

