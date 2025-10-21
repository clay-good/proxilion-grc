/**
 * Response Audit Logger
 * 
 * Logs all response scanning, filtering, and redaction activities for compliance and forensics
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { UnifiedAIResponse } from '../types/index.js';
import { ResponseScanResult } from './response-scanner.js';
import { FilterResult } from './response-filter.js';

export interface ResponseAuditEntry {
  id: string;
  timestamp: number;
  correlationId: string;
  userId?: string;
  provider: string;
  model: string;
  scanResult: {
    safe: boolean;
    threatLevel: string;
    findingsCount: number;
    redactionsCount: number;
  };
  filterResult: {
    allowed: boolean;
    modified: boolean;
    blocked: boolean;
    appliedFilters: string[];
  };
  originalContentHash: string;
  redactedContentHash?: string;
  findings: Array<{
    type: string;
    severity: string;
    field: string;
    redacted: boolean;
    reason: string;
  }>;
  metadata: Record<string, any>;
}

export interface AuditQueryOptions {
  startTime?: number;
  endTime?: number;
  userId?: string;
  provider?: string;
  model?: string;
  threatLevel?: string;
  blocked?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditStatistics {
  totalResponses: number;
  scannedResponses: number;
  blockedResponses: number;
  modifiedResponses: number;
  redactionsCount: number;
  findingsByType: Record<string, number>;
  findingsBySeverity: Record<string, number>;
  filtersByType: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
  topModels: Array<{ model: string; count: number }>;
}

export class ResponseAuditLogger {
  private logger: Logger;
  private metrics: MetricsCollector;
  private auditLog: ResponseAuditEntry[] = [];
  private maxLogSize: number;
  private retentionPeriod: number;

  constructor(config?: { maxLogSize?: number; retentionPeriod?: number }) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.maxLogSize = config?.maxLogSize ?? 10000;
    this.retentionPeriod = config?.retentionPeriod ?? 30 * 24 * 60 * 60 * 1000; // 30 days

    this.logger.info('Response audit logger initialized', {
      maxLogSize: this.maxLogSize,
      retentionPeriod: this.retentionPeriod,
    });

    // Start cleanup interval
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Log response audit entry
   */
  logAudit(
    response: UnifiedAIResponse,
    scanResult: ResponseScanResult,
    filterResult: FilterResult,
    metadata: {
      correlationId: string;
      userId?: string;
      provider: string;
      model: string;
    }
  ): void {
    const entry: ResponseAuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      correlationId: metadata.correlationId,
      userId: metadata.userId,
      provider: metadata.provider,
      model: metadata.model,
      scanResult: {
        safe: scanResult.safe,
        threatLevel: scanResult.threatLevel,
        findingsCount: scanResult.findings.length,
        redactionsCount: scanResult.metadata.redactionsCount,
      },
      filterResult: {
        allowed: filterResult.allowed,
        modified: filterResult.modified,
        blocked: filterResult.blocked,
        appliedFilters: filterResult.appliedFilters,
      },
      originalContentHash: this.hashContent(this.extractContent(response)),
      redactedContentHash: scanResult.redactedResponse
        ? this.hashContent(this.extractContent(scanResult.redactedResponse))
        : undefined,
      findings: scanResult.findings.map((f) => ({
        type: f.type,
        severity: f.severity,
        field: f.field,
        redacted: f.redacted,
        reason: f.reason,
      })),
      metadata: {},
    };

    this.auditLog.push(entry);

    // Enforce max log size
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog.shift();
    }

    // Log to structured logger
    this.logger.info('Response audit entry', {
      auditId: entry.id,
      correlationId: entry.correlationId,
      userId: entry.userId,
      safe: entry.scanResult.safe,
      blocked: entry.filterResult.blocked,
      findingsCount: entry.scanResult.findingsCount,
    });

    // Collect metrics
    this.metrics.increment('response_audit_entries_total');
    if (entry.filterResult.blocked) {
      this.metrics.increment('response_audit_blocked_total');
    }
    if (entry.filterResult.modified) {
      this.metrics.increment('response_audit_modified_total');
    }
  }

  /**
   * Query audit log
   */
  queryAuditLog(options: AuditQueryOptions = {}): ResponseAuditEntry[] {
    let results = [...this.auditLog];

    // Apply filters
    if (options.startTime) {
      results = results.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter((e) => e.timestamp <= options.endTime!);
    }
    if (options.userId) {
      results = results.filter((e) => e.userId === options.userId);
    }
    if (options.provider) {
      results = results.filter((e) => e.provider === options.provider);
    }
    if (options.model) {
      results = results.filter((e) => e.model === options.model);
    }
    if (options.threatLevel) {
      results = results.filter((e) => e.scanResult.threatLevel === options.threatLevel);
    }
    if (options.blocked !== undefined) {
      results = results.filter((e) => e.filterResult.blocked === options.blocked);
    }

    // Sort by timestamp (descending)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get audit entry by ID
   */
  getAuditEntry(id: string): ResponseAuditEntry | undefined {
    return this.auditLog.find((e) => e.id === id);
  }

  /**
   * Get audit statistics
   */
  getStatistics(options: { startTime?: number; endTime?: number } = {}): AuditStatistics {
    let entries = [...this.auditLog];

    // Apply time filters
    if (options.startTime) {
      entries = entries.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      entries = entries.filter((e) => e.timestamp <= options.endTime!);
    }

    const stats: AuditStatistics = {
      totalResponses: entries.length,
      scannedResponses: entries.length,
      blockedResponses: entries.filter((e) => e.filterResult.blocked).length,
      modifiedResponses: entries.filter((e) => e.filterResult.modified).length,
      redactionsCount: entries.reduce((sum, e) => sum + e.scanResult.redactionsCount, 0),
      findingsByType: {},
      findingsBySeverity: {},
      filtersByType: {},
      topUsers: [],
      topModels: [],
    };

    // Count findings by type
    for (const entry of entries) {
      for (const finding of entry.findings) {
        stats.findingsByType[finding.type] = (stats.findingsByType[finding.type] || 0) + 1;
        stats.findingsBySeverity[finding.severity] =
          (stats.findingsBySeverity[finding.severity] || 0) + 1;
      }

      // Count filters by type
      for (const filter of entry.filterResult.appliedFilters) {
        stats.filtersByType[filter] = (stats.filtersByType[filter] || 0) + 1;
      }
    }

    // Calculate top users
    const userCounts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.userId) {
        userCounts.set(entry.userId, (userCounts.get(entry.userId) || 0) + 1);
      }
    }
    stats.topUsers = Array.from(userCounts.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate top models
    const modelCounts = new Map<string, number>();
    for (const entry of entries) {
      modelCounts.set(entry.model, (modelCounts.get(entry.model) || 0) + 1);
    }
    stats.topModels = Array.from(modelCounts.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Export audit log
   */
  exportAuditLog(options: AuditQueryOptions = {}): string {
    const entries = this.queryAuditLog(options);
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    const count = this.auditLog.length;
    this.auditLog = [];
    this.logger.info('Audit log cleared', { entriesCleared: count });
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const cutoffTime = Date.now() - this.retentionPeriod;
    const before = this.auditLog.length;
    this.auditLog = this.auditLog.filter((e) => e.timestamp >= cutoffTime);
    const after = this.auditLog.length;

    if (before !== after) {
      this.logger.info('Audit log cleanup', {
        entriesRemoved: before - after,
        entriesRemaining: after,
      });
    }
  }

  /**
   * Extract content from response
   */
  private extractContent(response: UnifiedAIResponse): string {
    // UnifiedAIResponse has a content property, not choices
    return response.content || '';
  }

  /**
   * Hash content for audit trail
   */
  private hashContent(content: string): string {
    // Simple hash function for demonstration
    // In production, use a proper cryptographic hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

