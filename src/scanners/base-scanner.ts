/**
 * Base scanner interface for security scanning
 */

import { UnifiedAIRequest, ScanResult, ThreatLevel, Finding } from '../types/index.js';

// Re-export types for convenience
export type { ScanResult, Finding, ThreatLevel } from '../types/index.js';

// Scanner interface for custom scanners
export interface Scanner {
  id: string;
  name: string;
  scan(request: UnifiedAIRequest): Promise<ScanResult>;
}

export abstract class BaseScanner implements Scanner {
  abstract id: string;
  abstract name: string;

  abstract scan(request: UnifiedAIRequest): Promise<ScanResult>;

  protected createResult(
    passed: boolean,
    threatLevel: ThreatLevel,
    score: number,
    findings: ScanResult['findings'],
    executionTimeMs: number
  ): ScanResult {
    return {
      scannerId: this.id,
      scannerName: this.name,
      passed,
      threatLevel,
      score,
      findings,
      executionTimeMs,
    };
  }
}

