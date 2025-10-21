/**
 * Reporting Engine
 * 
 * Generates comprehensive reports for:
 * - Compliance (GDPR, HIPAA, PCI DSS, SOC 2, CCPA, ISO 27001)
 * - Security insights and threat analysis
 * - Cost analysis and optimization
 * - Performance metrics
 * - Export to multiple formats (JSON, CSV, PDF-ready)
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { AnalyticsEngine, Anomaly } from '../analytics/analytics-engine.js';
import { CostTracker, CostEntry } from '../cost/cost-tracker.js';
import { ComplianceStandard } from '../scanners/compliance-scanner.js';
import { ThreatLevel, Finding, AuditEvent, PolicyAction } from '../types/index.js';

export type ReportFormat = 'json' | 'csv' | 'html';
export type ReportType = 'compliance' | 'security' | 'cost' | 'performance' | 'executive';

export interface ReportConfig {
  type: ReportType;
  format: ReportFormat;
  startTime?: number;
  endTime?: number;
  filters?: Record<string, any>;
  includeCharts?: boolean;
  includeRecommendations?: boolean;
}

export interface ComplianceReport {
  id: string;
  type: 'compliance';
  generatedAt: number;
  period: { start: number; end: number };
  standards: ComplianceStandardReport[];
  summary: {
    totalViolations: number;
    criticalViolations: number;
    highViolations: number;
    mediumViolations: number;
    lowViolations: number;
    complianceScore: number;
  };
  recommendations: string[];
}

export interface ComplianceStandardReport {
  standard: ComplianceStandard;
  violations: Finding[];
  violationCount: number;
  criticalCount: number;
  complianceScore: number;
  status: 'compliant' | 'non-compliant' | 'needs-review';
}

export interface SecurityReport {
  id: string;
  type: 'security';
  generatedAt: number;
  period: { start: number; end: number };
  threats: {
    total: number;
    byLevel: Record<ThreatLevel, number>;
    byType: Record<string, number>;
    topThreats: Array<{ type: string; count: number; severity: ThreatLevel }>;
  };
  anomalies: Anomaly[];
  blockedRequests: number;
  alertedRequests: number;
  securityScore: number;
  recommendations: string[];
}

export interface CostReport {
  id: string;
  type: 'cost';
  generatedAt: number;
  period: { start: number; end: number };
  summary: {
    totalCost: number;
    totalRequests: number;
    averageCostPerRequest: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  byProvider: Record<string, { cost: number; requests: number; percentage: number }>;
  byModel: Record<string, { cost: number; requests: number; percentage: number }>;
  byUser?: Record<string, { cost: number; requests: number }>;
  byTenant?: Record<string, { cost: number; requests: number }>;
  trends: Array<{ timestamp: number; cost: number; requests: number }>;
  recommendations: string[];
}

export interface PerformanceReport {
  id: string;
  type: 'performance';
  generatedAt: number;
  period: { start: number; end: number };
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    cacheHitRate: number;
    errorRate: number;
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  recommendations: string[];
}

export interface ExecutiveReport {
  id: string;
  type: 'executive';
  generatedAt: number;
  period: { start: number; end: number };
  summary: {
    totalRequests: number;
    totalCost: number;
    securityScore: number;
    complianceScore: number;
    performanceScore: number;
  };
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  keyMetrics: Record<string, number>;
}

export type Report = ComplianceReport | SecurityReport | CostReport | PerformanceReport | ExecutiveReport;

export class ReportingEngine {
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private analyticsEngine: AnalyticsEngine;
  private costTracker: CostTracker;
  private auditEvents: AuditEvent[] = [];
  private findings: Finding[] = [];

  constructor(
    metricsCollector: MetricsCollector,
    analyticsEngine: AnalyticsEngine,
    costTracker: CostTracker
  ) {
    this.logger = new Logger();
    this.metricsCollector = metricsCollector;
    this.analyticsEngine = analyticsEngine;
    this.costTracker = costTracker;
  }

  /**
   * Record audit event for reporting
   */
  recordAuditEvent(event: AuditEvent): void {
    this.auditEvents.push(event);

    // Keep only recent events (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.auditEvents = this.auditEvents.filter(e => e.timestamp >= thirtyDaysAgo);
  }

  /**
   * Record finding for reporting
   */
  recordFinding(finding: Finding): void {
    this.findings.push(finding);

    // Keep only recent findings (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.findings = this.findings.filter(f => {
      // Findings don't have timestamp, so we'll keep all for now
      return true;
    });
  }

  /**
   * Generate report
   */
  async generateReport(config: ReportConfig): Promise<Report> {
    this.logger.info('Generating report', { type: config.type, format: config.format });

    const startTime = config.startTime || Date.now() - 24 * 60 * 60 * 1000; // Default: last 24 hours
    const endTime = config.endTime || Date.now();

    let report: Report;

    switch (config.type) {
      case 'compliance':
        report = await this.generateComplianceReport(startTime, endTime, config);
        break;
      case 'security':
        report = await this.generateSecurityReport(startTime, endTime, config);
        break;
      case 'cost':
        report = await this.generateCostReport(startTime, endTime, config);
        break;
      case 'performance':
        report = await this.generatePerformanceReport(startTime, endTime, config);
        break;
      case 'executive':
        report = await this.generateExecutiveReport(startTime, endTime, config);
        break;
      default:
        throw new Error(`Unknown report type: ${config.type}`);
    }

    this.logger.info('Report generated', { reportId: report.id, type: report.type });

    return report;
  }

  /**
   * Generate compliance report
   */
  private async generateComplianceReport(
    startTime: number,
    endTime: number,
    config: ReportConfig
  ): Promise<ComplianceReport> {
    // Filter findings by time period
    const periodFindings = this.findings.filter(f => {
      // Since findings don't have timestamps, we'll use all findings
      return f.type.startsWith('compliance_violation_');
    });

    // Group by standard
    const standardsMap = new Map<ComplianceStandard, Finding[]>();
    
    for (const finding of periodFindings) {
      const standard = finding.metadata?.standard as ComplianceStandard;
      if (standard) {
        if (!standardsMap.has(standard)) {
          standardsMap.set(standard, []);
        }
        standardsMap.get(standard)!.push(finding);
      }
    }

    // Generate standard reports
    const standards: ComplianceStandardReport[] = [];
    
    for (const [standard, violations] of standardsMap.entries()) {
      const criticalCount = violations.filter(v => v.severity === ThreatLevel.CRITICAL).length;
      const violationCount = violations.length;
      const complianceScore = Math.max(0, 100 - (violationCount * 5) - (criticalCount * 10));
      
      standards.push({
        standard,
        violations,
        violationCount,
        criticalCount,
        complianceScore,
        status: criticalCount > 0 ? 'non-compliant' : violationCount > 0 ? 'needs-review' : 'compliant',
      });
    }

    // Calculate summary
    const totalViolations = periodFindings.length;
    const criticalViolations = periodFindings.filter(f => f.severity === ThreatLevel.CRITICAL).length;
    const highViolations = periodFindings.filter(f => f.severity === ThreatLevel.HIGH).length;
    const mediumViolations = periodFindings.filter(f => f.severity === ThreatLevel.MEDIUM).length;
    const lowViolations = periodFindings.filter(f => f.severity === ThreatLevel.LOW).length;
    const complianceScore = Math.max(0, 100 - (totalViolations * 3) - (criticalViolations * 15));

    // Generate recommendations
    const recommendations = this.generateComplianceRecommendations(standards);

    return {
      id: crypto.randomUUID(),
      type: 'compliance',
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      standards,
      summary: {
        totalViolations,
        criticalViolations,
        highViolations,
        mediumViolations,
        lowViolations,
        complianceScore,
      },
      recommendations,
    };
  }

  /**
   * Generate security report
   */
  private async generateSecurityReport(
    startTime: number,
    endTime: number,
    config: ReportConfig
  ): Promise<SecurityReport> {
    // Filter events by time period
    const periodEvents = this.auditEvents.filter(e => 
      e.timestamp >= startTime && e.timestamp <= endTime && e.threatLevel
    );

    // Count threats by level
    const byLevel: Record<ThreatLevel, number> = {
      [ThreatLevel.NONE]: 0,
      [ThreatLevel.LOW]: 0,
      [ThreatLevel.MEDIUM]: 0,
      [ThreatLevel.HIGH]: 0,
      [ThreatLevel.CRITICAL]: 0,
    };

    const byType: Record<string, number> = {};
    const threatDetails: Array<{ type: string; count: number; severity: ThreatLevel }> = [];

    for (const event of periodEvents) {
      if (event.threatLevel) {
        byLevel[event.threatLevel]++;
      }

      if (event.eventType) {
        byType[event.eventType] = (byType[event.eventType] || 0) + 1;
      }
    }

    // Get top threats
    const topThreats = Object.entries(byType)
      .map(([type, count]) => ({
        type,
        count,
        severity: this.inferThreatSeverity(type),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get anomalies
    const anomalies = this.analyticsEngine.getAnomalies(50);

    // Count blocked and alerted requests
    const blockedRequests = periodEvents.filter(e => e.decision === PolicyAction.BLOCK).length;
    const alertedRequests = periodEvents.filter(e => e.decision === PolicyAction.ALERT).length;

    // Calculate security score
    const totalThreats = periodEvents.length;
    const criticalThreats = byLevel[ThreatLevel.CRITICAL];
    const highThreats = byLevel[ThreatLevel.HIGH];
    const securityScore = Math.max(0, 100 - (totalThreats * 0.5) - (criticalThreats * 10) - (highThreats * 5));

    // Generate recommendations
    const recommendations = this.generateSecurityRecommendations(byLevel, topThreats);

    return {
      id: crypto.randomUUID(),
      type: 'security',
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      threats: {
        total: totalThreats,
        byLevel,
        byType,
        topThreats,
      },
      anomalies,
      blockedRequests,
      alertedRequests,
      securityScore,
      recommendations,
    };
  }

  /**
   * Generate cost report
   */
  private async generateCostReport(
    startTime: number,
    endTime: number,
    config: ReportConfig
  ): Promise<CostReport> {
    const summary = this.costTracker.getCostSummary({
      startTime,
      endTime,
      ...config.filters,
    });

    // Calculate percentages
    const byProvider: Record<string, { cost: number; requests: number; percentage: number }> = {};
    for (const [provider, cost] of Object.entries(summary.byProvider)) {
      byProvider[provider] = {
        cost,
        requests: 0, // Would need to track this separately
        percentage: (cost / summary.totalCost) * 100,
      };
    }

    const byModel: Record<string, { cost: number; requests: number; percentage: number }> = {};
    for (const [model, cost] of Object.entries(summary.byModel)) {
      byModel[model] = {
        cost,
        requests: 0, // Would need to track this separately
        percentage: (cost / summary.totalCost) * 100,
      };
    }

    // Generate trends (simplified - would need time-series data)
    const trends: Array<{ timestamp: number; cost: number; requests: number }> = [];

    // Generate recommendations
    const recommendations = this.generateCostRecommendations(summary);

    return {
      id: crypto.randomUUID(),
      type: 'cost',
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      summary: {
        totalCost: summary.totalCost,
        totalRequests: summary.totalRequests,
        averageCostPerRequest: summary.averageCostPerRequest,
        totalInputTokens: summary.totalInputTokens,
        totalOutputTokens: summary.totalOutputTokens,
      },
      byProvider,
      byModel,
      trends,
      recommendations,
    };
  }

  /**
   * Generate performance report
   */
  private async generatePerformanceReport(
    startTime: number,
    endTime: number,
    config: ReportConfig
  ): Promise<PerformanceReport> {
    const requestCountStats = this.metricsCollector.getStats('requestCount');
    const errorCountStats = this.metricsCollector.getStats('errorCount');
    const latencyStats = this.metricsCollector.getStats('latency');
    const cacheHitsStats = this.metricsCollector.getStats('cacheHits');
    const cacheMissesStats = this.metricsCollector.getStats('cacheMisses');

    const totalRequests = requestCountStats?.sum || 0;
    const totalErrors = errorCountStats?.sum || 0;
    const successfulRequests = totalRequests - totalErrors;
    const cacheHits = cacheHitsStats?.sum || 0;
    const cacheMisses = cacheMissesStats?.sum || 0;
    const cacheHitRate = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

    const periodSeconds = (endTime - startTime) / 1000;
    const requestsPerSecond = totalRequests / periodSeconds;

    const recommendations = this.generatePerformanceRecommendations({
      cacheHitRate,
      errorRate: (totalErrors / totalRequests) * 100,
      averageLatency: latencyStats?.mean || 0,
    });

    return {
      id: crypto.randomUUID(),
      type: 'performance',
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      metrics: {
        totalRequests,
        successfulRequests,
        failedRequests: totalErrors,
        averageLatency: latencyStats?.mean || 0,
        p95Latency: latencyStats?.p95 || 0,
        p99Latency: latencyStats?.p99 || 0,
        cacheHitRate,
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      },
      throughput: {
        requestsPerSecond,
        requestsPerMinute: requestsPerSecond * 60,
        requestsPerHour: requestsPerSecond * 3600,
      },
      recommendations,
    };
  }

  /**
   * Generate executive report
   */
  private async generateExecutiveReport(
    startTime: number,
    endTime: number,
    config: ReportConfig
  ): Promise<ExecutiveReport> {
    // Generate sub-reports
    const complianceReport = await this.generateComplianceReport(startTime, endTime, config);
    const securityReport = await this.generateSecurityReport(startTime, endTime, config);
    const costReport = await this.generateCostReport(startTime, endTime, config);
    const performanceReport = await this.generatePerformanceReport(startTime, endTime, config);

    // Calculate performance score
    const performanceScore = Math.max(0, 100 - (performanceReport.metrics.errorRate * 2) - 
      ((100 - performanceReport.metrics.cacheHitRate) * 0.5));

    // Generate highlights
    const highlights: string[] = [];
    if (securityReport.securityScore >= 90) {
      highlights.push(`Excellent security posture with ${securityReport.securityScore.toFixed(1)}% security score`);
    }
    if (complianceReport.summary.complianceScore >= 90) {
      highlights.push(`Strong compliance with ${complianceReport.summary.complianceScore.toFixed(1)}% compliance score`);
    }
    if (performanceReport.metrics.cacheHitRate >= 80) {
      highlights.push(`High cache efficiency at ${performanceReport.metrics.cacheHitRate.toFixed(1)}%`);
    }

    // Generate concerns
    const concerns: string[] = [];
    if (securityReport.threats.byLevel[ThreatLevel.CRITICAL] > 0) {
      concerns.push(`${securityReport.threats.byLevel[ThreatLevel.CRITICAL]} critical security threats detected`);
    }
    if (complianceReport.summary.criticalViolations > 0) {
      concerns.push(`${complianceReport.summary.criticalViolations} critical compliance violations found`);
    }
    if (costReport.summary.totalCost > 1000) {
      concerns.push(`High AI API costs: $${costReport.summary.totalCost.toFixed(2)}`);
    }

    // Combine recommendations
    const recommendations = [
      ...complianceReport.recommendations.slice(0, 2),
      ...securityReport.recommendations.slice(0, 2),
      ...costReport.recommendations.slice(0, 2),
    ];

    return {
      id: crypto.randomUUID(),
      type: 'executive',
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      summary: {
        totalRequests: performanceReport.metrics.totalRequests,
        totalCost: costReport.summary.totalCost,
        securityScore: securityReport.securityScore,
        complianceScore: complianceReport.summary.complianceScore,
        performanceScore,
      },
      highlights,
      concerns,
      recommendations,
      keyMetrics: {
        'Total Requests': performanceReport.metrics.totalRequests,
        'Total Cost ($)': costReport.summary.totalCost,
        'Security Score': securityReport.securityScore,
        'Compliance Score': complianceReport.summary.complianceScore,
        'Performance Score': performanceScore,
        'Cache Hit Rate (%)': performanceReport.metrics.cacheHitRate,
        'Error Rate (%)': performanceReport.metrics.errorRate,
      },
    };
  }

  // Helper methods for generating recommendations
  private generateComplianceRecommendations(standards: ComplianceStandardReport[]): string[] {
    const recommendations: string[] = [];

    for (const standard of standards) {
      if (standard.status === 'non-compliant') {
        recommendations.push(
          `Address ${standard.criticalCount} critical ${standard.standard.toUpperCase()} violations immediately`
        );
      }
    }

    return recommendations.slice(0, 5);
  }

  private generateSecurityRecommendations(
    byLevel: Record<ThreatLevel, number>,
    topThreats: Array<{ type: string; count: number; severity: ThreatLevel }>
  ): string[] {
    const recommendations: string[] = [];

    if (byLevel[ThreatLevel.CRITICAL] > 0) {
      recommendations.push(`Investigate and remediate ${byLevel[ThreatLevel.CRITICAL]} critical security threats`);
    }

    if (topThreats.length > 0) {
      recommendations.push(`Focus on top threat type: ${topThreats[0].type} (${topThreats[0].count} occurrences)`);
    }

    return recommendations;
  }

  private generateCostRecommendations(summary: any): string[] {
    const recommendations: string[] = [];

    if (summary.averageCostPerRequest > 0.1) {
      recommendations.push('Consider using more cost-effective models for simple requests');
    }

    return recommendations;
  }

  private generatePerformanceRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];

    if (metrics.cacheHitRate < 50) {
      recommendations.push('Improve cache hit rate by increasing TTL or enabling more caching');
    }

    if (metrics.errorRate > 5) {
      recommendations.push('Investigate and reduce error rate');
    }

    return recommendations;
  }

  private inferThreatSeverity(eventType: string): ThreatLevel {
    if (eventType.includes('critical') || eventType.includes('injection')) {
      return ThreatLevel.CRITICAL;
    }
    if (eventType.includes('high') || eventType.includes('pii')) {
      return ThreatLevel.HIGH;
    }
    if (eventType.includes('medium')) {
      return ThreatLevel.MEDIUM;
    }
    return ThreatLevel.LOW;
  }

  /**
   * Export report to specified format
   */
  async exportReport(report: Report, format: ReportFormat): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'csv':
        return this.exportToCSV(report);
      case 'html':
        return this.exportToHTML(report);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private exportToCSV(report: Report): string {
    // Simplified CSV export - would need more sophisticated implementation
    const lines: string[] = [];
    lines.push(`Report Type,${report.type}`);
    lines.push(`Generated At,${new Date(report.generatedAt).toISOString()}`);
    lines.push('');

    // Add type-specific data
    if (report.type === 'compliance') {
      lines.push('Standard,Violations,Critical,Score,Status');
      for (const std of report.standards) {
        lines.push(`${std.standard},${std.violationCount},${std.criticalCount},${std.complianceScore},${std.status}`);
      }
    }

    return lines.join('\n');
  }

  private exportToHTML(report: Report): string {
    // Simplified HTML export - would need proper templating
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${report.type.toUpperCase()} Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
        </style>
      </head>
      <body>
        <h1>${report.type.toUpperCase()} Report</h1>
        <p>Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
        <pre>${JSON.stringify(report, null, 2)}</pre>
      </body>
      </html>
    `;
  }
}

