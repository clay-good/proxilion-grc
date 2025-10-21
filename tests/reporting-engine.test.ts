/**
 * Tests for Reporting Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReportingEngine, ReportConfig } from '../src/reporting/reporting-engine';
import { MetricsCollector } from '../src/utils/metrics';
import { AnalyticsEngine } from '../src/analytics/analytics-engine';
import { CostTracker } from '../src/cost/cost-tracker';
import { ComplianceStandard } from '../src/scanners/compliance-scanner';
import { ThreatLevel, PolicyAction } from '../src/types/index';

describe('ReportingEngine', () => {
  let reportingEngine: ReportingEngine;
  let metricsCollector: MetricsCollector;
  let analyticsEngine: AnalyticsEngine;
  let costTracker: CostTracker;

  beforeEach(() => {
    metricsCollector = MetricsCollector.getInstance();
    metricsCollector.clear();
    analyticsEngine = new AnalyticsEngine();
    costTracker = new CostTracker();
    
    reportingEngine = new ReportingEngine(
      metricsCollector,
      analyticsEngine,
      costTracker
    );
  });

  describe('Compliance Reports', () => {
    it('should generate compliance report', async () => {
      // Record some compliance findings
      reportingEngine.recordFinding({
        type: 'compliance_violation_gdpr',
        severity: ThreatLevel.HIGH,
        message: 'GDPR violation detected',
        confidence: 0.9,
        metadata: {
          standard: ComplianceStandard.GDPR,
          ruleId: 'gdpr-001',
        },
      });

      reportingEngine.recordFinding({
        type: 'compliance_violation_hipaa',
        severity: ThreatLevel.CRITICAL,
        message: 'HIPAA violation detected',
        confidence: 0.95,
        metadata: {
          standard: ComplianceStandard.HIPAA,
          ruleId: 'hipaa-001',
        },
      });

      const config: ReportConfig = {
        type: 'compliance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect(report.type).toBe('compliance');
      expect(report.id).toBeDefined();
      expect(report.generatedAt).toBeDefined();
      expect('summary' in report && report.summary.totalViolations).toBe(2);
      expect('summary' in report && report.summary.criticalViolations).toBe(1);
      expect('summary' in report && report.summary.highViolations).toBe(1);
    });

    it('should calculate compliance score', async () => {
      // No violations = high score
      const config: ReportConfig = {
        type: 'compliance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('summary' in report && report.summary.complianceScore).toBeGreaterThan(90);
    });

    it('should group violations by standard', async () => {
      reportingEngine.recordFinding({
        type: 'compliance_violation_gdpr',
        severity: ThreatLevel.HIGH,
        message: 'GDPR violation 1',
        confidence: 0.9,
        metadata: {
          standard: ComplianceStandard.GDPR,
        },
      });

      reportingEngine.recordFinding({
        type: 'compliance_violation_gdpr',
        severity: 'MEDIUM',
        message: 'GDPR violation 2',
        confidence: 0.85,
        metadata: {
          standard: ComplianceStandard.GDPR,
        },
      });

      const config: ReportConfig = {
        type: 'compliance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('standards' in report && report.standards.length).toBeGreaterThan(0);
      const gdprStandard = 'standards' in report && report.standards.find(s => s.standard === ComplianceStandard.GDPR);
      expect(gdprStandard).toBeDefined();
      expect(gdprStandard && gdprStandard.violationCount).toBe(2);
    });

    it('should generate compliance recommendations', async () => {
      reportingEngine.recordFinding({
        type: 'compliance_violation_pci_dss',
        severity: ThreatLevel.CRITICAL,
        message: 'PCI DSS violation',
        confidence: 0.95,
        metadata: {
          standard: ComplianceStandard.PCI_DSS,
        },
      });

      const config: ReportConfig = {
        type: 'compliance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('recommendations' in report && report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Security Reports', () => {
    it('should generate security report', async () => {
      // Record some security events
      reportingEngine.recordAuditEvent({
        id: 'event-1',
        timestamp: Date.now(),
        level: 'ERROR',
        type: 'security',
        message: 'Threat detected',
        correlationId: 'corr-1',
        threatLevel: ThreatLevel.HIGH,
        eventType: 'pii.detected',
      });

      reportingEngine.recordAuditEvent({
        id: 'event-2',
        timestamp: Date.now(),
        level: 'CRITICAL',
        type: 'security',
        message: 'Critical threat',
        correlationId: 'corr-2',
        threatLevel: ThreatLevel.CRITICAL,
        eventType: 'injection.detected',
      });

      const config: ReportConfig = {
        type: 'security',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect(report.type).toBe('security');
      expect('threats' in report && report.threats.total).toBe(2);
      expect('threats' in report && report.threats.byLevel[ThreatLevel.HIGH]).toBe(1);
      expect('threats' in report && report.threats.byLevel[ThreatLevel.CRITICAL]).toBe(1);
    });

    it('should calculate security score', async () => {
      const config: ReportConfig = {
        type: 'security',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('securityScore' in report && report.securityScore).toBeGreaterThan(0);
      expect('securityScore' in report && report.securityScore).toBeLessThanOrEqual(100);
    });

    it('should identify top threats', async () => {
      // Record multiple events of same type
      for (let i = 0; i < 5; i++) {
        reportingEngine.recordAuditEvent({
          id: `event-${i}`,
          timestamp: Date.now(),
          level: 'ERROR',
          type: 'security',
          message: 'PII detected',
          correlationId: `corr-${i}`,
          threatLevel: ThreatLevel.HIGH,
          eventType: 'pii.detected',
        });
      }

      const config: ReportConfig = {
        type: 'security',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('threats' in report && report.threats.topThreats.length).toBeGreaterThan(0);
      expect('threats' in report && report.threats.topThreats[0].type).toBe('pii.detected');
      expect('threats' in report && report.threats.topThreats[0].count).toBe(5);
    });

    it('should count blocked and alerted requests', async () => {
      reportingEngine.recordAuditEvent({
        id: 'event-1',
        timestamp: Date.now(),
        level: 'ERROR',
        type: 'security',
        message: 'Request blocked',
        correlationId: 'corr-1',
        threatLevel: ThreatLevel.HIGH,
        decision: PolicyAction.BLOCK,
      });

      reportingEngine.recordAuditEvent({
        id: 'event-2',
        timestamp: Date.now(),
        level: 'WARN',
        type: 'security',
        message: 'Request alerted',
        correlationId: 'corr-2',
        threatLevel: ThreatLevel.MEDIUM,
        decision: PolicyAction.ALERT,
      });

      const config: ReportConfig = {
        type: 'security',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('blockedRequests' in report && report.blockedRequests).toBe(1);
      expect('alertedRequests' in report && report.alertedRequests).toBe(1);
    });
  });

  describe('Cost Reports', () => {
    it('should generate cost report', async () => {
      // Track some costs
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      costTracker.trackCost({
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 2000,
        outputTokens: 1000,
        requestId: 'req-2',
      });

      const config: ReportConfig = {
        type: 'cost',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect(report.type).toBe('cost');
      expect('summary' in report && report.summary.totalRequests).toBe(2);
      expect('summary' in report && report.summary.totalCost).toBeGreaterThan(0);
    });

    it('should break down costs by provider', async () => {
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      const config: ReportConfig = {
        type: 'cost',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('byProvider' in report && report.byProvider.openai).toBeDefined();
      expect('byProvider' in report && report.byProvider.openai.cost).toBeGreaterThan(0);
    });

    it('should break down costs by model', async () => {
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      const config: ReportConfig = {
        type: 'cost',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('byModel' in report && report.byModel['gpt-4']).toBeDefined();
      expect('byModel' in report && report.byModel['gpt-4'].cost).toBeGreaterThan(0);
    });

    it('should calculate cost percentages', async () => {
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      const config: ReportConfig = {
        type: 'cost',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('byProvider' in report && report.byProvider.openai.percentage).toBeCloseTo(100, 0);
    });
  });

  describe('Performance Reports', () => {
    it('should generate performance report', async () => {
      // Record some metrics
      metricsCollector.counter('requestCount', 100);
      metricsCollector.counter('errorCount', 5);
      metricsCollector.histogram('latency', 150);
      metricsCollector.counter('cacheHits', 80);
      metricsCollector.counter('cacheMisses', 20);

      const config: ReportConfig = {
        type: 'performance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect(report.type).toBe('performance');
      expect('metrics' in report && report.metrics.totalRequests).toBeGreaterThan(0);
    });

    it('should calculate cache hit rate', async () => {
      metricsCollector.counter('cacheHits', 80);
      metricsCollector.counter('cacheMisses', 20);

      const config: ReportConfig = {
        type: 'performance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('metrics' in report && report.metrics.cacheHitRate).toBeCloseTo(80, 0);
    });

    it('should calculate throughput', async () => {
      metricsCollector.counter('requestCount', 100);

      const config: ReportConfig = {
        type: 'performance',
        format: 'json',
        startTime: Date.now() - 60000, // 1 minute ago
        endTime: Date.now(),
      };

      const report = await reportingEngine.generateReport(config);

      expect('throughput' in report && report.throughput.requestsPerSecond).toBeGreaterThan(0);
      expect('throughput' in report && report.throughput.requestsPerMinute).toBeGreaterThan(0);
    });
  });

  describe('Executive Reports', () => {
    it('should generate executive report', async () => {
      // Add some data
      metricsCollector.counter('requestCount', 1000);
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 10000,
        outputTokens: 5000,
        requestId: 'req-1',
      });

      const config: ReportConfig = {
        type: 'executive',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect(report.type).toBe('executive');
      expect('summary' in report && report.summary.totalRequests).toBeGreaterThan(0);
      expect('summary' in report && report.summary.securityScore).toBeDefined();
      expect('summary' in report && report.summary.complianceScore).toBeDefined();
      expect('summary' in report && report.summary.performanceScore).toBeDefined();
    });

    it('should include highlights and concerns', async () => {
      const config: ReportConfig = {
        type: 'executive',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('highlights' in report && Array.isArray(report.highlights)).toBe(true);
      expect('concerns' in report && Array.isArray(report.concerns)).toBe(true);
    });

    it('should include key metrics', async () => {
      const config: ReportConfig = {
        type: 'executive',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);

      expect('keyMetrics' in report && report.keyMetrics).toBeDefined();
      expect('keyMetrics' in report && report.keyMetrics['Total Requests']).toBeDefined();
      expect('keyMetrics' in report && report.keyMetrics['Security Score']).toBeDefined();
    });
  });

  describe('Report Export', () => {
    it('should export report as JSON', async () => {
      const config: ReportConfig = {
        type: 'compliance',
        format: 'json',
      };

      const report = await reportingEngine.generateReport(config);
      const exported = await reportingEngine.exportReport(report, 'json');

      expect(typeof exported).toBe('string');
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('should export report as CSV', async () => {
      const config: ReportConfig = {
        type: 'compliance',
        format: 'csv',
      };

      const report = await reportingEngine.generateReport(config);
      const exported = await reportingEngine.exportReport(report, 'csv');

      expect(typeof exported).toBe('string');
      expect(exported).toContain('Report Type');
    });

    it('should export report as HTML', async () => {
      const config: ReportConfig = {
        type: 'compliance',
        format: 'html',
      };

      const report = await reportingEngine.generateReport(config);
      const exported = await reportingEngine.exportReport(report, 'html');

      expect(typeof exported).toBe('string');
      expect(exported).toContain('<!DOCTYPE html>');
      expect(exported).toContain('</html>');
    });
  });

  describe('Time Period Filtering', () => {
    it('should filter events by time period', async () => {
      const now = Date.now();
      const yesterday = now - 24 * 60 * 60 * 1000;

      // Record event from yesterday
      reportingEngine.recordAuditEvent({
        id: 'event-1',
        timestamp: yesterday,
        level: 'ERROR',
        type: 'security',
        message: 'Old threat',
        correlationId: 'corr-1',
        threatLevel: ThreatLevel.HIGH,
      });

      // Record event from today
      reportingEngine.recordAuditEvent({
        id: 'event-2',
        timestamp: now,
        level: 'ERROR',
        type: 'security',
        message: 'New threat',
        correlationId: 'corr-2',
        threatLevel: ThreatLevel.HIGH,
      });

      const config: ReportConfig = {
        type: 'security',
        format: 'json',
        startTime: now - 60000, // Last minute
        endTime: now,
      };

      const report = await reportingEngine.generateReport(config);

      expect('threats' in report && report.threats.total).toBe(1);
    });
  });
});

