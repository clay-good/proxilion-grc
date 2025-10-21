/**
 * Toxicity and Harm Detection Scanner
 * Detects hate speech, violence, misinformation, illegal activity, and age-inappropriate content
 */

import { BaseScanner } from './base-scanner.js';
import { UnifiedAIRequest, ScanResult, ThreatLevel, Finding } from '../types/index.js';
import { Logger } from '../utils/logger.js';

interface ToxicityPattern {
  category: string;
  patterns: RegExp[];
  severity: ThreatLevel;
  description: string;
}

interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  toxicity: number;
}

export class ToxicityScanner extends BaseScanner {
  id = 'toxicity-scanner';
  name = 'ToxicityScanner';
  description = 'Detects toxic content, hate speech, violence, and harmful content';
  version = '1.0.0';
  private logger: Logger;
  private toxicityPatterns: ToxicityPattern[];

  constructor() {
    super();
    this.logger = new Logger();
    this.toxicityPatterns = this.initializeToxicityPatterns();
  }

  private initializeToxicityPatterns(): ToxicityPattern[] {
    return [
      // Hate Speech & Discrimination
      {
        category: 'Hate Speech',
        severity: ThreatLevel.CRITICAL,
        description: 'Content contains hate speech or discriminatory language',
        patterns: [
          /\b(hate|despise|loathe)\s+(all\s+)?(jews|muslims|christians|blacks|whites|asians|latinos|lgbtq|gays|trans)/gi,
          /\b(kill|murder|eliminate|exterminate)\s+(all\s+)?(jews|muslims|blacks|whites|asians|latinos|lgbtq)/gi,
          /\b(racial|ethnic|religious)\s+(slur|epithet|hatred|supremacy)/gi,
          /\b(white|black|racial)\s+supremacy/gi,
          /\bnazi\s+(ideology|propaganda|beliefs)/gi,
          /\bgenocide\s+(advocacy|promotion|justification)/gi,
        ],
      },
      // Violence & Self-Harm
      {
        category: 'Violence',
        severity: ThreatLevel.CRITICAL,
        description: 'Content promotes or describes violence or self-harm',
        patterns: [
          /\b(how\s+to|ways\s+to|methods\s+to)\s+(kill|murder|assassinate|harm|hurt|torture)\s+(someone|people|person)/gi,
          /\b(suicide|self-harm|self-mutilation)\s+(methods|techniques|ways|instructions)/gi,
          /\b(make|build|create|construct)\s+(a\s+)?(bomb|explosive|weapon|poison|toxin)/gi,
          /\b(school|mass|public)\s+(shooting|attack|violence)/gi,
          /\b(terrorist|terrorism)\s+(attack|plan|strategy|tactics)/gi,
          /\b(graphic|explicit)\s+(violence|gore|torture)/gi,
        ],
      },
      // Illegal Activity
      {
        category: 'Illegal Activity',
        severity: ThreatLevel.HIGH,
        description: 'Content describes or promotes illegal activities',
        patterns: [
          /\b(how\s+to|ways\s+to)\s+(hack|crack|break\s+into|steal|rob|fraud)/gi,
          /\b(sell|buy|purchase|obtain)\s+(drugs|cocaine|heroin|meth|fentanyl|illegal\s+substances)/gi,
          /\b(money\s+laundering|tax\s+evasion|fraud|embezzlement)\s+(scheme|method|technique)/gi,
          /\b(child\s+pornography|child\s+exploitation|csam)/gi,
          /\b(human\s+trafficking|sex\s+trafficking)/gi,
          /\b(identity\s+theft|credit\s+card\s+fraud|phishing\s+scam)/gi,
          /\b(counterfeit|fake)\s+(money|currency|documents|id)/gi,
        ],
      },
      // Sexual Content
      {
        category: 'Sexual Content',
        severity: ThreatLevel.HIGH,
        description: 'Content contains explicit sexual material',
        patterns: [
          /\b(explicit|graphic|pornographic)\s+(sexual|sex|content|material)/gi,
          /\b(sexual|sex)\s+(act|intercourse|activity)\s+(with|involving)\s+(minor|child|underage)/gi,
          /\b(grooming|solicitation)\s+(of\s+)?(minor|child|underage)/gi,
        ],
      },
      // Misinformation & Disinformation
      {
        category: 'Misinformation',
        severity: ThreatLevel.MEDIUM,
        description: 'Content may contain misinformation or conspiracy theories',
        patterns: [
          /\b(covid|coronavirus|pandemic)\s+(is\s+a\s+)?(hoax|fake|conspiracy|planned)/gi,
          /\b(vaccine|vaccination)s?\s+(contain|contains|dangerous|deadly|poison|microchip|tracking)/gi,
          /\b(election|vote)\s+(fraud|rigged|stolen|fake)/gi,
          /\b(flat\s+earth|earth\s+is\s+flat)/gi,
          /\b(climate\s+change|global\s+warming)\s+(hoax|fake|conspiracy)/gi,
          /\b(5g|5-g)\s+(causes|spreads)\s+(cancer|covid|disease)/gi,
        ],
      },
      // Harassment & Bullying
      {
        category: 'Harassment',
        severity: ThreatLevel.MEDIUM,
        description: 'Content contains harassment or bullying',
        patterns: [
          /\b(you\s+are|you're)\s+(stupid|idiot|moron|retard|worthless|pathetic)/gi,
          /\b(kill\s+yourself|kys)/gi,
          /\b(doxx|dox|swat)\s+(someone|them|him|her)/gi,
          /\b(cyberbullying|online\s+harassment)/gi,
        ],
      },
      // Dangerous Activities
      {
        category: 'Dangerous Activities',
        severity: ThreatLevel.MEDIUM,
        description: 'Content promotes dangerous or reckless activities',
        patterns: [
          /\b(drunk|intoxicated)\s+driving/gi,
          /\b(dangerous|deadly|extreme)\s+(challenge|stunt)/gi,
          /\b(eating\s+disorder|anorexia|bulimia)\s+(tips|tricks|methods|pro-ana|pro-mia)/gi,
        ],
      },
    ];
  }

  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    try {
      // Extract all text content from the request
      const textContent = this.extractTextContent(request);

      // Scan for toxicity patterns
      for (const pattern of this.toxicityPatterns) {
        const matches = this.findPatternMatches(textContent, pattern);
        findings.push(...matches);
      }

      // Perform sentiment analysis
      const sentiment = this.analyzeSentiment(textContent);
      if (sentiment.toxicity > 0.7) {
        findings.push({
          type: 'High Toxicity Score',
          severity: ThreatLevel.HIGH,
          message: `Content has high toxicity score: ${(sentiment.toxicity * 100).toFixed(1)}%`,
          evidence: '[REDACTED - Toxic content]',
          location: { path: 'request.messages' },
          confidence: sentiment.toxicity,
        });
      }

      // Calculate overall threat level
      const threatLevel = this.calculateThreatLevel(findings);

      const executionTimeMs = Date.now() - startTime;

      this.logger.info('Toxicity scan completed', {
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
      this.logger.error('Toxicity scan failed', error as Error);
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
    const texts: string[] = [];

    // Extract from messages
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

    return texts.join(' ');
  }

  private findPatternMatches(text: string, pattern: ToxicityPattern): Finding[] {
    const findings: Finding[] = [];

    for (const regex of pattern.patterns) {
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        findings.push({
          type: pattern.category,
          severity: pattern.severity,
          message: pattern.description,
          evidence: '[REDACTED - Harmful content detected]',
          location: { path: 'request.messages' },
          confidence: 0.85,
          metadata: {
            matchCount: matches.length,
            pattern: regex.source,
          },
        });
      }
    }

    return findings;
  }

  private analyzeSentiment(text: string): SentimentScore {
    // Simple sentiment analysis based on keyword matching
    // In production, this would use a proper NLP model
    
    const positiveWords = ['good', 'great', 'excellent', 'wonderful', 'amazing', 'love', 'happy', 'joy'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'angry', 'sad', 'pain'];
    const toxicWords = ['kill', 'die', 'death', 'murder', 'hate', 'stupid', 'idiot', 'moron'];

    const words = text.toLowerCase().split(/\s+/);
    const totalWords = words.length;

    let positiveCount = 0;
    let negativeCount = 0;
    let toxicCount = 0;

    for (const word of words) {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
      if (toxicWords.includes(word)) toxicCount++;
    }

    return {
      positive: totalWords > 0 ? positiveCount / totalWords : 0,
      negative: totalWords > 0 ? negativeCount / totalWords : 0,
      neutral: totalWords > 0 ? (totalWords - positiveCount - negativeCount) / totalWords : 1,
      toxicity: totalWords > 0 ? Math.min(toxicCount / totalWords * 10, 1) : 0,
    };
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

