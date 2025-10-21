/**
 * Scanner orchestrator for managing and executing multiple scanners
 */

import { UnifiedAIRequest, AggregatedScanResult, ThreatLevel, Finding } from '../types/index.js';
import { BaseScanner } from './base-scanner.js';
import { PIIScanner } from './pii-scanner.js';
import { PromptInjectionScanner } from './prompt-injection-scanner.js';
import { ToxicityScanner } from './toxicity-scanner.js';
import { DLPScanner } from './dlp-scanner.js';
import { ComplianceScanner } from './compliance-scanner.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export interface ScannerOrchestratorConfig {
  enableParallelScanning: boolean;
  scanTimeout: number;
}

export class ScannerOrchestrator {
  private scanners: BaseScanner[] = [];

  constructor(private config: ScannerOrchestratorConfig) {
    this.registerDefaultScanners();
  }

  private registerDefaultScanners(): void {
    this.register(new PIIScanner());
    this.register(new PromptInjectionScanner());
    this.register(new ToxicityScanner());
    this.register(new DLPScanner());
    this.register(new ComplianceScanner());
  }

  register(scanner: BaseScanner): void {
    this.scanners.push(scanner);
    logger.info(`Registered scanner: ${scanner.name}`);
  }

  getScanners(): BaseScanner[] {
    return [...this.scanners];
  }

  getScanner(id: string): BaseScanner | undefined {
    return this.scanners.find(s => s.id === id);
  }

  getPIIScanner(): PIIScanner | undefined {
    return this.scanners.find(s => s.id === 'pii-scanner') as PIIScanner | undefined;
  }

  getComplianceScanner(): ComplianceScanner | undefined {
    return this.scanners.find(s => s.id === 'compliance-scanner') as ComplianceScanner | undefined;
  }

  async scan(request: UnifiedAIRequest): Promise<AggregatedScanResult> {
    const startTime = Date.now();

    logger.info('Starting security scan', {
      correlationId: request.metadata.correlationId,
      scannerCount: this.scanners.length,
    });

    try {
      const scanResults = this.config.enableParallelScanning
        ? await this.scanParallel(request)
        : await this.scanSequential(request);

      const totalExecutionTimeMs = Date.now() - startTime;
      const overallThreatLevel = this.calculateOverallThreatLevel(scanResults);
      const overallScore = this.calculateOverallScore(scanResults);

      // Collect all findings from all scanners
      const allFindings: Finding[] = scanResults.reduce((acc, result) => {
        return acc.concat(result.findings);
      }, [] as Finding[]);

      const aggregated: AggregatedScanResult = {
        overallThreatLevel,
        overallScore,
        scanResults,
        findings: allFindings,
        totalExecutionTimeMs,
        timestamp: Date.now(),
      };

      // Record metrics
      metrics.histogram('scan.duration', totalExecutionTimeMs);
      metrics.counter('scan.completed', 1, {
        threatLevel: overallThreatLevel,
      });

      logger.info('Security scan completed', {
        correlationId: request.metadata.correlationId,
        overallThreatLevel,
        overallScore,
        totalExecutionTimeMs,
        findingsCount: scanResults.reduce((sum, r) => sum + r.findings.length, 0),
      });

      return aggregated;
    } catch (error) {
      logger.error('Security scan failed', error as Error, {
        correlationId: request.metadata.correlationId,
      });
      throw error;
    }
  }

  private async scanParallel(request: UnifiedAIRequest) {
    const scanPromises = this.scanners.map((scanner) =>
      this.executeScannerWithTimeout(scanner, request)
    );

    return await Promise.all(scanPromises);
  }

  private async scanSequential(request: UnifiedAIRequest) {
    const results = [];

    for (const scanner of this.scanners) {
      const result = await this.executeScannerWithTimeout(scanner, request);
      results.push(result);
    }

    return results;
  }

  private async executeScannerWithTimeout(scanner: BaseScanner, request: UnifiedAIRequest) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Scanner ${scanner.name} timed out`)), this.config.scanTimeout);
    });

    try {
      const result = await Promise.race([scanner.scan(request), timeoutPromise]);
      
      metrics.histogram('scanner.duration', (result as any).executionTimeMs, {
        scanner: scanner.id,
      });
      
      return result as any;
    } catch (error) {
      logger.error(`Scanner ${scanner.name} failed`, error as Error);
      
      // Return a failed scan result instead of throwing
      return {
        scannerId: scanner.id,
        scannerName: scanner.name,
        passed: false,
        threatLevel: ThreatLevel.NONE,
        score: 0,
        findings: [
          {
            type: 'Scanner Error',
            severity: ThreatLevel.LOW,
            message: `Scanner failed: ${(error as Error).message}`,
            confidence: 1.0,
          },
        ],
        executionTimeMs: this.config.scanTimeout,
      };
    }
  }

  private calculateOverallThreatLevel(results: AggregatedScanResult['scanResults']): ThreatLevel {
    const severityOrder = [
      ThreatLevel.NONE,
      ThreatLevel.LOW,
      ThreatLevel.MEDIUM,
      ThreatLevel.HIGH,
      ThreatLevel.CRITICAL,
    ];

    return results.reduce((max: ThreatLevel, result) => {
      const currentIndex = severityOrder.indexOf(result.threatLevel);
      const maxIndex = severityOrder.indexOf(max);
      return currentIndex > maxIndex ? result.threatLevel : max;
    }, ThreatLevel.NONE as ThreatLevel);
  }

  private calculateOverallScore(results: AggregatedScanResult['scanResults']): number {
    if (results.length === 0) return 0;

    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    return totalScore / results.length;
  }

  getRegisteredScanners(): string[] {
    return this.scanners.map((s) => s.name);
  }
}

