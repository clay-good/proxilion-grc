/**
 * Prompt injection detection scanner
 */

import { UnifiedAIRequest, ScanResult, ThreatLevel, Finding } from '../types/index.js';
import { BaseScanner } from './base-scanner.js';

interface InjectionPattern {
  name: string;
  patterns: RegExp[];
  severity: ThreatLevel;
  description: string;
}

export class PromptInjectionScanner extends BaseScanner {
  id = 'prompt-injection-scanner';
  name = 'Prompt Injection Detection Scanner';

  private injectionPatterns: InjectionPattern[] = [
    {
      name: 'Ignore Previous Instructions',
      patterns: [
        /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
        /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
        /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
      ],
      severity: ThreatLevel.HIGH,
      description: 'Attempt to override system instructions',
    },
    {
      name: 'System Prompt Override',
      patterns: [
        /new\s+instructions?:/gi,
        /system\s*:\s*.+/gi,
        /\[system\]/gi,
        /<\|system\|>/gi,
      ],
      severity: ThreatLevel.HIGH,
      description: 'Attempt to inject system-level prompts',
    },
    {
      name: 'Role Manipulation',
      patterns: [
        /you\s+are\s+now\s+a/gi,
        /act\s+as\s+(if\s+)?you\s+(are|were)/gi,
        /pretend\s+(to\s+be|you\s+are)/gi,
        /roleplay\s+as/gi,
      ],
      severity: ThreatLevel.MEDIUM,
      description: 'Attempt to manipulate AI role or behavior',
    },
    {
      name: 'Jailbreak Attempt',
      patterns: [
        /DAN\s+mode/gi,
        /developer\s+mode/gi,
        /evil\s+mode/gi,
        /unrestricted\s+mode/gi,
        /bypass\s+(all\s+)?restrictions?/gi,
      ],
      severity: ThreatLevel.CRITICAL,
      description: 'Known jailbreak pattern detected',
    },
    {
      name: 'Prompt Leakage',
      patterns: [
        /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?)/gi,
        /what\s+(are|were)\s+your\s+(original\s+)?instructions?/gi,
        /reveal\s+your\s+prompt/gi,
        /print\s+your\s+instructions?/gi,
      ],
      severity: ThreatLevel.HIGH,
      description: 'Attempt to extract system prompt',
    },
    {
      name: 'Encoding Obfuscation',
      patterns: [
        /base64\s*:/gi,
        /rot13\s*:/gi,
        /hex\s*:/gi,
        /\\x[0-9a-f]{2}/gi,
      ],
      severity: ThreatLevel.MEDIUM,
      description: 'Potential encoding-based obfuscation',
    },
    {
      name: 'Delimiter Injection',
      patterns: [
        /---\s*end\s+of\s+(prompt|instructions?)/gi,
        /\[end\s+system\]/gi,
        /<\/system>/gi,
      ],
      severity: ThreatLevel.HIGH,
      description: 'Attempt to inject prompt delimiters',
    },
  ];

  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    // Extract text content from user messages only
    const userMessages = request.messages.filter((m) => m.role === 'user');
    const textContent = this.extractTextContent(userMessages);

    // Check for injection patterns
    for (const injectionPattern of this.injectionPatterns) {
      for (const pattern of injectionPattern.patterns) {
        const matches = textContent.matchAll(pattern);

        for (const match of matches) {
          findings.push({
            type: injectionPattern.name,
            severity: injectionPattern.severity,
            message: `Potential prompt injection detected: ${injectionPattern.description}`,
            evidence: this.truncateEvidence(match[0]),
            remediation: 'Review and sanitize user input before processing',
            confidence: this.calculateConfidence(match[0], injectionPattern),
          });
        }
      }
    }

    // Check for anomalous patterns
    const anomalyFindings = this.detectAnomalies(textContent);
    findings.push(...anomalyFindings);

    const executionTimeMs = Date.now() - startTime;
    const passed = findings.length === 0;
    const threatLevel = this.calculateThreatLevel(findings);
    const score = this.calculateScore(findings);

    return this.createResult(passed, threatLevel, score, findings, executionTimeMs);
  }

  private extractTextContent(messages: UnifiedAIRequest['messages']): string {
    const texts: string[] = [];

    for (const message of messages) {
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

    return texts.join('\n');
  }

  private detectAnomalies(text: string): Finding[] {
    const findings: Finding[] = [];

    // Check for excessive special characters
    const specialCharRatio = (text.match(/[^a-zA-Z0-9\s]/g) || []).length / text.length;
    if (specialCharRatio > 0.3) {
      findings.push({
        type: 'Anomalous Character Distribution',
        severity: ThreatLevel.MEDIUM,
        message: 'Unusually high ratio of special characters detected',
        evidence: `Special character ratio: ${(specialCharRatio * 100).toFixed(1)}%`,
        remediation: 'Review input for potential obfuscation attempts',
        confidence: 0.7,
      });
    }

    // Check for excessive repetition
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = 1 - uniqueWords.size / words.length;
    if (repetitionRatio > 0.5 && words.length > 20) {
      findings.push({
        type: 'Excessive Repetition',
        severity: ThreatLevel.LOW,
        message: 'Unusual repetition pattern detected',
        evidence: `Repetition ratio: ${(repetitionRatio * 100).toFixed(1)}%`,
        remediation: 'Review for potential prompt stuffing',
        confidence: 0.6,
      });
    }

    // Check for very long inputs (potential token exhaustion)
    if (text.length > 50000) {
      findings.push({
        type: 'Excessive Input Length',
        severity: ThreatLevel.MEDIUM,
        message: 'Unusually long input detected',
        evidence: `Input length: ${text.length} characters`,
        remediation: 'Consider implementing input length limits',
        confidence: 0.8,
      });
    }

    return findings;
  }

  private calculateConfidence(match: string, pattern: InjectionPattern): number {
    // Higher confidence for exact matches of known patterns
    let confidence = 0.8;

    // Increase confidence if multiple indicators present
    if (match.length > 50) {
      confidence += 0.1;
    }

    // Decrease confidence for very short matches
    if (match.length < 10) {
      confidence -= 0.2;
    }

    return Math.max(0.5, Math.min(1.0, confidence));
  }

  private truncateEvidence(evidence: string, maxLength: number = 100): string {
    if (evidence.length <= maxLength) {
      return evidence;
    }
    return evidence.substring(0, maxLength) + '...';
  }

  private calculateThreatLevel(findings: Finding[]): ThreatLevel {
    if (findings.length === 0) return ThreatLevel.NONE;

    const severityOrder = [
      ThreatLevel.NONE,
      ThreatLevel.LOW,
      ThreatLevel.MEDIUM,
      ThreatLevel.HIGH,
      ThreatLevel.CRITICAL,
    ];

    return findings.reduce((max: ThreatLevel, finding) => {
      const currentIndex = severityOrder.indexOf(finding.severity);
      const maxIndex = severityOrder.indexOf(max);
      return currentIndex > maxIndex ? finding.severity : max;
    }, ThreatLevel.NONE as ThreatLevel);
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
}

