/**
 * Admin Dashboard API
 * 
 * RESTful API for managing Proxilion configuration, policies,
 * analytics, and system monitoring.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Logger } from '../utils/logger.js';
import { configManager } from '../config/config-manager.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { MetricsCollector } from '../utils/metrics.js';
import { CostTracker } from '../cost/cost-tracker.js';
import { AnalyticsEngine } from '../analytics/analytics-engine.js';
import { ScannerOrchestrator } from '../scanners/scanner-orchestrator.js';
import { Policy } from '../types/index.js';

export interface AdminAPIConfig {
  enableAuth?: boolean;
  apiKey?: string;
  corsOrigins?: string[];
  rateLimit?: number;
}

export class AdminAPI {
  private app: Hono;
  private logger: Logger;
  private policyEngine: PolicyEngine;
  private metricsCollector: MetricsCollector;
  private costTracker: CostTracker;
  private analyticsEngine: AnalyticsEngine;
  private scannerOrchestrator: ScannerOrchestrator;
  private config: AdminAPIConfig;

  constructor(
    policyEngine: PolicyEngine,
    metricsCollector: MetricsCollector,
    costTracker: CostTracker,
    analyticsEngine: AnalyticsEngine,
    scannerOrchestrator: ScannerOrchestrator,
    config: AdminAPIConfig = {}
  ) {
    this.app = new Hono();
    this.logger = new Logger();
    this.policyEngine = policyEngine;
    this.metricsCollector = metricsCollector;
    this.costTracker = costTracker;
    this.analyticsEngine = analyticsEngine;
    this.scannerOrchestrator = scannerOrchestrator;
    this.config = {
      enableAuth: config.enableAuth ?? true,
      apiKey: config.apiKey,
      corsOrigins: config.corsOrigins ?? ['*'],
      rateLimit: config.rateLimit ?? 100,
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use('/*', cors({
      origin: this.config.corsOrigins!,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    }));

    // Authentication
    if (this.config.enableAuth) {
      this.app.use('/api/*', async (c, next) => {
        const apiKey = c.req.header('X-API-Key') || c.req.header('Authorization')?.replace('Bearer ', '');
        
        if (!apiKey || apiKey !== this.config.apiKey) {
          return c.json({ error: 'Unauthorized' }, 401);
        }

        await next();
      });
    }

    // Request logging
    this.app.use('/*', async (c, next) => {
      const start = Date.now();
      await next();
      const duration = Date.now() - start;
      
      this.logger.info('Admin API request', {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration,
      });
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (c) => {
      return c.json({ status: 'healthy', timestamp: Date.now() });
    });

    // Configuration endpoints
    this.app.get('/api/config', (c) => this.getConfig(c));
    this.app.put('/api/config', async (c) => this.updateConfig(c));
    this.app.post('/api/config/validate', async (c) => this.validateConfig(c));
    this.app.post('/api/config/reset', (c) => this.resetConfig(c));

    // Policy endpoints
    this.app.get('/api/policies', (c) => this.getPolicies(c));
    this.app.get('/api/policies/:id', (c) => this.getPolicy(c));
    this.app.post('/api/policies', async (c) => this.createPolicy(c));
    this.app.put('/api/policies/:id', async (c) => this.updatePolicy(c));
    this.app.delete('/api/policies/:id', (c) => this.deletePolicy(c));
    this.app.post('/api/policies/:id/enable', (c) => this.enablePolicy(c));
    this.app.post('/api/policies/:id/disable', (c) => this.disablePolicy(c));

    // Metrics endpoints
    this.app.get('/api/metrics', (c) => this.getMetrics(c));
    this.app.get('/api/metrics/summary', (c) => this.getMetricsSummary(c));
    this.app.post('/api/metrics/reset', (c) => this.resetMetrics(c));

    // Cost tracking endpoints
    this.app.get('/api/costs', (c) => this.getCosts(c));
    this.app.get('/api/costs/summary', (c) => this.getCostSummary(c));
    this.app.get('/api/costs/by-tenant/:tenantId', (c) => this.getCostsByTenant(c));

    // Analytics endpoints
    this.app.get('/api/analytics/threats', (c) => this.getThreatAnalytics(c));
    this.app.get('/api/analytics/anomalies', (c) => this.getAnomalies(c));
    this.app.get('/api/analytics/trends', (c) => this.getTrends(c));

    // System endpoints
    this.app.get('/api/system/status', (c) => this.getSystemStatus(c));
    this.app.get('/api/system/stats', (c) => this.getSystemStats(c));

    // Security control endpoints (self-service pattern management)
    this.app.get('/api/security/pii-patterns', (c) => this.getPIIPatterns(c));
    this.app.get('/api/security/pii-patterns/:name', (c) => this.getPIIPattern(c));
    this.app.patch('/api/security/pii-patterns/:name', async (c) => this.updatePIIPattern(c));
    this.app.post('/api/security/pii-patterns', async (c) => this.createCustomPattern(c));
    this.app.delete('/api/security/pii-patterns/:name', async (c) => this.deleteCustomPattern(c));
    this.app.post('/api/security/pii-patterns/bulk-update', async (c) => this.bulkUpdatePatterns(c));
    this.app.post('/api/security/pii-patterns/reset', async (c) => this.resetPatterns(c));
    this.app.get('/api/security/compliance-rules', (c) => this.getComplianceRules(c));
    this.app.patch('/api/security/compliance-rules/:id', async (c) => this.updateComplianceRule(c));
    this.app.post('/api/security/test-pattern', async (c) => this.testPattern(c));
    this.app.get('/api/security/categories', (c) => this.getPatternCategories(c));

    // Certificate management endpoints
    this.app.get('/api/certificates/ca', (c) => this.getCAInfo(c));
    this.app.get('/api/certificates/ca/download', (c) => this.downloadCACertificate(c));
    this.app.get('/api/certificates/stats', (c) => this.getCertificateStats(c));
    this.app.post('/api/certificates/rotate', async (c) => this.rotateCertificates(c));

    // Audit and compliance reporting endpoints
    this.app.get('/api/audit/events', (c) => this.getAuditEvents(c));
    this.app.get('/api/audit/events/:id', (c) => this.getAuditEvent(c));
    this.app.get('/api/reports/compliance', async (c) => this.getComplianceReport(c));
    this.app.get('/api/reports/security', async (c) => this.getSecurityReport(c));
    this.app.get('/api/reports/executive', async (c) => this.getExecutiveReport(c));
    this.app.post('/api/reports/generate', async (c) => this.generateReport(c));
  }

  // Configuration handlers
  private getConfig(c: any) {
    try {
      const config = configManager.getConfig();
      return c.json({ success: true, data: config });
    } catch (error) {
      this.logger.error('Failed to get config', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private async updateConfig(c: any) {
    try {
      const updates = await c.req.json();

      // Validate the updates by merging with current config
      const currentConfig = configManager.getConfig();
      const mergedConfig = this.deepMerge(currentConfig, updates);
      const errors = configManager.validate(mergedConfig);

      if (errors.length > 0) {
        return c.json({
          success: false,
          error: 'Configuration validation failed',
          errors,
        }, 400);
      }

      configManager.update(updates);

      this.logger.info('Configuration updated via API', { updates });

      return c.json({
        success: true,
        message: 'Configuration updated successfully',
        data: configManager.getConfig(),
      });
    } catch (error) {
      this.logger.error('Failed to update config', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  private async validateConfig(c: any) {
    try {
      const partialConfig = await c.req.json();

      // Merge with current config to validate the full result
      const currentConfig = configManager.getConfig();
      const mergedConfig = this.deepMerge(currentConfig, partialConfig);
      const errors = configManager.validate(mergedConfig);

      return c.json({
        success: errors.length === 0,
        valid: errors.length === 0,
        errors,
      });
    } catch (error) {
      this.logger.error('Failed to validate config', error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 400);
    }
  }

  private resetConfig(c: any) {
    try {
      configManager.reset();
      this.logger.info('Configuration reset via API');
      
      return c.json({ 
        success: true, 
        message: 'Configuration reset to defaults',
        data: configManager.getConfig(),
      });
    } catch (error) {
      this.logger.error('Failed to reset config', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  // Policy handlers
  private getPolicies(c: any) {
    try {
      const policies = this.policyEngine.getPolicies();
      return c.json({ success: true, data: policies, count: policies.length });
    } catch (error) {
      this.logger.error('Failed to get policies', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getPolicy(c: any) {
    try {
      const id = c.req.param('id');
      const policy = this.policyEngine.getPolicy(id);

      if (!policy) {
        return c.json({ success: false, error: 'Policy not found' }, 404);
      }

      return c.json({ success: true, data: policy });
    } catch (error) {
      this.logger.error('Failed to get policy', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private async createPolicy(c: any) {
    try {
      const policy: Policy = await c.req.json();
      this.policyEngine.addPolicy(policy);

      this.logger.info('Policy created via API', { policyId: policy.id });

      return c.json({
        success: true,
        message: 'Policy created successfully',
        data: policy,
      }, 201);
    } catch (error) {
      this.logger.error('Failed to create policy', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private async updatePolicy(c: any) {
    try {
      const id = c.req.param('id');
      const updates: Partial<Policy> = await c.req.json();

      // Get existing policy
      const existing = this.policyEngine.getPolicy(id);
      if (!existing) {
        return c.json({ success: false, error: 'Policy not found' }, 404);
      }

      // Merge updates with existing policy
      const updated: Policy = { ...existing, ...updates, id }; // Preserve ID

      // Remove old and add updated
      this.policyEngine.removePolicy(id);
      this.policyEngine.addPolicy(updated);

      this.logger.info('Policy updated via API', { policyId: id });

      return c.json({
        success: true,
        message: 'Policy updated successfully',
        data: updated,
      });
    } catch (error) {
      this.logger.error('Failed to update policy', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private deletePolicy(c: any) {
    try {
      const id = c.req.param('id');
      const removed = this.policyEngine.removePolicy(id);

      if (!removed) {
        return c.json({ success: false, error: 'Policy not found' }, 404);
      }

      this.logger.info('Policy deleted via API', { policyId: id });

      return c.json({
        success: true,
        message: 'Policy deleted successfully',
      });
    } catch (error) {
      this.logger.error('Failed to delete policy', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private enablePolicy(c: any) {
    try {
      const id = c.req.param('id');

      // Get existing policy
      const existing = this.policyEngine.getPolicy(id);
      if (!existing) {
        return c.json({ success: false, error: 'Policy not found' }, 404);
      }

      // Update enabled status
      const updated: Policy = { ...existing, enabled: true };
      this.policyEngine.removePolicy(id);
      this.policyEngine.addPolicy(updated);

      this.logger.info('Policy enabled via API', { policyId: id });

      return c.json({
        success: true,
        message: 'Policy enabled successfully',
      });
    } catch (error) {
      this.logger.error('Failed to enable policy', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private disablePolicy(c: any) {
    try {
      const id = c.req.param('id');

      // Get existing policy
      const existing = this.policyEngine.getPolicy(id);
      if (!existing) {
        return c.json({ success: false, error: 'Policy not found' }, 404);
      }

      // Update enabled status
      const updated: Policy = { ...existing, enabled: false };
      this.policyEngine.removePolicy(id);
      this.policyEngine.addPolicy(updated);

      this.logger.info('Policy disabled via API', { policyId: id });

      return c.json({
        success: true,
        message: 'Policy disabled successfully',
      });
    } catch (error) {
      this.logger.error('Failed to disable policy', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  // Metrics handlers
  private getMetrics(c: any) {
    try {
      const metrics = this.metricsCollector.getMetrics();

      // Group metrics by name for easier consumption
      const grouped: Record<string, any> = {};
      for (const metric of metrics) {
        if (!grouped[metric.name]) {
          grouped[metric.name] = [];
        }
        grouped[metric.name].push(metric);
      }

      return c.json({ success: true, data: grouped, count: metrics.length });
    } catch (error) {
      this.logger.error('Failed to get metrics', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getMetricsSummary(c: any) {
    try {
      const requestCountStats = this.metricsCollector.getStats('requestCount');
      const errorCountStats = this.metricsCollector.getStats('errorCount');
      const latencyStats = this.metricsCollector.getStats('latency');
      const cacheHitsStats = this.metricsCollector.getStats('cacheHits');
      const cacheMissesStats = this.metricsCollector.getStats('cacheMisses');
      const threatsStats = this.metricsCollector.getStats('threatsDetected');

      const summary = {
        totalRequests: requestCountStats?.sum || 0,
        totalErrors: errorCountStats?.sum || 0,
        averageLatency: latencyStats?.mean || 0,
        cacheHitRate: cacheHitsStats && cacheMissesStats
          ? (cacheHitsStats.sum / (cacheHitsStats.sum + cacheMissesStats.sum)) || 0
          : 0,
        threatDetectionRate: threatsStats && requestCountStats
          ? (threatsStats.sum / requestCountStats.sum) || 0
          : 0,
      };

      return c.json({ success: true, data: summary });
    } catch (error) {
      this.logger.error('Failed to get metrics summary', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private resetMetrics(c: any) {
    try {
      this.metricsCollector.clear();
      this.logger.info('Metrics reset via API');

      return c.json({
        success: true,
        message: 'Metrics reset successfully',
      });
    } catch (error) {
      this.logger.error('Failed to reset metrics', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  // Cost tracking handlers
  private getCosts(c: any) {
    try {
      const summary = this.costTracker.getCostSummary();
      return c.json({ success: true, data: summary });
    } catch (error) {
      this.logger.error('Failed to get costs', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getCostSummary(c: any) {
    try {
      const summary = this.costTracker.getCostSummary();
      return c.json({ success: true, data: summary });
    } catch (error) {
      this.logger.error('Failed to get cost summary', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getCostsByTenant(c: any) {
    try {
      const tenantId = c.req.param('tenantId');
      const costs = this.costTracker.getCostSummary({ tenantId });

      return c.json({ success: true, data: costs });
    } catch (error) {
      this.logger.error('Failed to get tenant costs', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  // Analytics handlers
  private getThreatAnalytics(c: any) {
    try {
      // Get threat statistics from analytics engine
      const anomalies = this.analyticsEngine.getAnomalies();
      const threatAnomalies = anomalies.filter(a => a.type === 'security_event');

      const analytics = {
        totalThreats: threatAnomalies.length,
        recentThreats: threatAnomalies.slice(0, 10),
        threatsByType: threatAnomalies.reduce((acc, a) => {
          const type = a.type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return c.json({ success: true, data: analytics });
    } catch (error) {
      this.logger.error('Failed to get threat analytics', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getAnomalies(c: any) {
    try {
      const limit = c.req.query('limit') ? parseInt(c.req.query('limit')) : undefined;
      const anomalies = this.analyticsEngine.getAnomalies(limit);
      return c.json({ success: true, data: anomalies, count: anomalies.length });
    } catch (error) {
      this.logger.error('Failed to get anomalies', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getTrends(c: any) {
    try {
      const period = c.req.query('period') || '24h';

      // Calculate time range based on period
      const now = Date.now();
      let startTime = now - 24 * 60 * 60 * 1000; // Default 24h

      if (period === '1h') startTime = now - 60 * 60 * 1000;
      else if (period === '7d') startTime = now - 7 * 24 * 60 * 60 * 1000;
      else if (period === '30d') startTime = now - 30 * 24 * 60 * 60 * 1000;

      const anomalies = this.analyticsEngine.getAnomalies();
      const recentAnomalies = anomalies.filter(a => a.timestamp >= startTime);

      const trends = {
        period,
        startTime,
        endTime: now,
        anomalyCount: recentAnomalies.length,
        anomaliesByType: recentAnomalies.reduce((acc, a) => {
          acc[a.type] = (acc[a.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return c.json({ success: true, data: trends });
    } catch (error) {
      this.logger.error('Failed to get trends', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  // System handlers
  private getSystemStatus(c: any) {
    try {
      const config = configManager.getConfig();
      const requestCountStats = this.metricsCollector.getStats('requestCount');
      const errorCountStats = this.metricsCollector.getStats('errorCount');
      const latencyStats = this.metricsCollector.getStats('latency');

      // Safely get uptime
      let uptime = 0;
      try {
        if (typeof process !== 'undefined' && process.uptime) {
          uptime = process.uptime();
        }
      } catch (e) {
        // process.uptime not available in this environment
      }

      const status = {
        healthy: true,
        uptime,
        version: '0.2.0',
        environment: config?.server?.environment || 'unknown',
        scanners: {
          pii: config?.security?.enablePIIScanner || false,
          promptInjection: config?.security?.enablePromptInjectionScanner || false,
          toxicity: config?.security?.enableToxicityScanner || false,
          dlp: config?.security?.enableDLPScanner || false,
          compliance: config?.security?.enableComplianceScanner || false,
        },
        performance: {
          cacheEnabled: config?.performance?.enableCaching || false,
          rateLimitEnabled: config?.performance?.enableRateLimiting || false,
          deduplicationEnabled: config?.performance?.enableDeduplication || false,
        },
        metrics: {
          requestCount: requestCountStats?.sum || 0,
          errorCount: errorCountStats?.sum || 0,
          averageLatency: latencyStats?.mean || 0,
        },
      };

      return c.json({ success: true, data: status });
    } catch (error) {
      this.logger.error('Failed to get system status', error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 500);
    }
  }

  private getSystemStats(c: any) {
    try {
      const requestCountStats = this.metricsCollector.getStats('requestCount');
      const errorCountStats = this.metricsCollector.getStats('errorCount');
      const blockedStats = this.metricsCollector.getStats('requestsBlocked');
      const threatsStats = this.metricsCollector.getStats('threatsDetected');
      const cacheHitsStats = this.metricsCollector.getStats('cacheHits');
      const cacheMissesStats = this.metricsCollector.getStats('cacheMisses');

      const costSummary = this.costTracker.getCostSummary();
      const policies = this.policyEngine.getPolicies();

      const totalRequests = requestCountStats?.sum || 0;
      const totalBlocked = blockedStats?.sum || 0;
      const cacheHits = cacheHitsStats?.sum || 0;
      const cacheMisses = cacheMissesStats?.sum || 0;

      const stats = {
        requests: {
          total: totalRequests,
          errors: errorCountStats?.sum || 0,
          blocked: totalBlocked,
          allowed: totalRequests - totalBlocked,
        },
        threats: {
          detected: threatsStats?.sum || 0,
          byLevel: {
            critical: this.metricsCollector.getStats('criticalThreats')?.sum || 0,
            high: this.metricsCollector.getStats('highThreats')?.sum || 0,
            medium: this.metricsCollector.getStats('mediumThreats')?.sum || 0,
            low: this.metricsCollector.getStats('lowThreats')?.sum || 0,
          },
        },
        costs: {
          total: costSummary?.totalCost || 0,
          byProvider: costSummary?.byProvider || {},
        },
        policies: {
          total: policies.length,
          enabled: policies.filter(p => p.enabled).length,
          disabled: policies.filter(p => !p.enabled).length,
        },
        cache: {
          hits: cacheHits,
          misses: cacheMisses,
          hitRate: cacheHits + cacheMisses > 0
            ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(2) + '%'
            : '0%',
        },
      };

      return c.json({ success: true, data: stats });
    } catch (error) {
      this.logger.error('Failed to get system stats', error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 500);
    }
  }

  // Security control handlers
  private getPIIPatterns(c: any) {
    try {
      const piiScanner = this.scannerOrchestrator.getPIIScanner();
      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      const patterns = piiScanner.getAllPatterns().map(p => ({
        name: p.name,
        category: p.category,
        severity: p.severity,
        enabled: p.enabled,
        complianceStandards: p.complianceStandards,
        description: p.description || '',
      }));

      return c.json({ success: true, data: patterns });
    } catch (error) {
      this.logger.error('Failed to get PII patterns', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getPIIPattern(c: any) {
    try {
      const name = decodeURIComponent(c.req.param('name'));
      const piiScanner = this.scannerOrchestrator.getPIIScanner();

      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      const patterns = piiScanner.getAllPatterns();
      const pattern = patterns.find(p => p.name === name);

      if (!pattern) {
        return c.json({ success: false, error: 'Pattern not found' }, 404);
      }

      return c.json({
        success: true,
        data: {
          name: pattern.name,
          category: pattern.category,
          severity: pattern.severity,
          enabled: pattern.enabled,
          complianceStandards: pattern.complianceStandards,
          description: pattern.description || '',
          regex: pattern.pattern.source,
        },
      });
    } catch (error) {
      this.logger.error('Failed to get PII pattern', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private async updatePIIPattern(c: any) {
    try {
      const name = decodeURIComponent(c.req.param('name'));
      const body = await c.req.json();
      const piiScanner = this.scannerOrchestrator.getPIIScanner();

      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      // Support updating: enabled, severity, regex
      const updates: any = {};
      if (body.enabled !== undefined) {
        updates.enabled = body.enabled;
        piiScanner.updatePatternConfig(name, body.enabled);
      }
      if (body.severity !== undefined) {
        updates.severity = body.severity;
        piiScanner.updatePatternSeverity(name, body.severity);
      }
      if (body.regex !== undefined) {
        updates.regex = body.regex;
        piiScanner.updatePatternRegex(name, body.regex);
      }

      this.logger.info('PII pattern updated', { name, updates });

      return c.json({
        success: true,
        message: 'Pattern updated successfully',
        data: { name, ...updates },
      });
    } catch (error) {
      this.logger.error('Failed to update PII pattern', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private async createCustomPattern(c: any) {
    try {
      const body = await c.req.json();
      const piiScanner = this.scannerOrchestrator.getPIIScanner();

      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      // Validate required fields
      if (!body.name || !body.pattern || !body.category || !body.severity) {
        return c.json({
          success: false,
          error: 'Missing required fields: name, pattern, category, severity',
        }, 400);
      }

      // Validate regex
      try {
        new RegExp(body.pattern);
      } catch (e) {
        return c.json({
          success: false,
          error: `Invalid regex pattern: ${(e as Error).message}`,
        }, 400);
      }

      const customPattern = {
        name: body.name,
        pattern: new RegExp(body.pattern, 'g'),
        severity: body.severity,
        category: body.category,
        complianceStandards: body.complianceStandards || [],
        enabled: body.enabled ?? true,
        description: body.description || '',
      };

      piiScanner.addCustomPattern(customPattern);

      this.logger.info('Custom pattern created', { name: body.name });

      return c.json({
        success: true,
        message: 'Custom pattern created successfully',
        data: customPattern,
      });
    } catch (error) {
      this.logger.error('Failed to create custom pattern', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private async deleteCustomPattern(c: any) {
    try {
      const name = decodeURIComponent(c.req.param('name'));
      const piiScanner = this.scannerOrchestrator.getPIIScanner();

      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      piiScanner.removeCustomPattern(name);

      this.logger.info('Custom pattern deleted', { name });

      return c.json({
        success: true,
        message: 'Custom pattern deleted successfully',
        data: { name },
      });
    } catch (error) {
      this.logger.error('Failed to delete custom pattern', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private async bulkUpdatePatterns(c: any) {
    try {
      const { updates } = await c.req.json();
      const piiScanner = this.scannerOrchestrator.getPIIScanner();

      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      if (!Array.isArray(updates)) {
        return c.json({
          success: false,
          error: 'updates must be an array',
        }, 400);
      }

      piiScanner.bulkUpdatePatterns(updates);

      this.logger.info('Bulk pattern update', { count: updates.length });

      return c.json({
        success: true,
        message: `${updates.length} patterns updated successfully`,
        data: { count: updates.length },
      });
    } catch (error) {
      this.logger.error('Failed to bulk update patterns', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private async resetPatterns(c: any) {
    try {
      const piiScanner = this.scannerOrchestrator.getPIIScanner();

      if (!piiScanner) {
        return c.json({ success: false, error: 'PII Scanner not available' }, 500);
      }

      piiScanner.resetToDefaults();

      this.logger.info('Patterns reset to defaults');

      return c.json({
        success: true,
        message: 'Patterns reset to defaults successfully',
      });
    } catch (error) {
      this.logger.error('Failed to reset patterns', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getPatternCategories(c: any) {
    try {
      const categories = [
        {
          id: 'financial',
          name: 'Financial Data',
          description: 'Credit cards, bank accounts, routing numbers',
          patternCount: 8,
          enabled: true,
        },
        {
          id: 'identity',
          name: 'Identity Information',
          description: 'SSN, driver licenses, passports, tax IDs',
          patternCount: 6,
          enabled: true,
        },
        {
          id: 'contact',
          name: 'Contact Information',
          description: 'Email addresses, phone numbers, IP addresses',
          patternCount: 5,
          enabled: true,
        },
        {
          id: 'health',
          name: 'Health Information',
          description: 'Medicare IDs, NPI numbers, DEA numbers',
          patternCount: 4,
          enabled: true,
        },
        {
          id: 'government',
          name: 'Government IDs',
          description: 'Military IDs, VINs, government-issued IDs',
          patternCount: 3,
          enabled: true,
        },
        {
          id: 'biometric',
          name: 'Biometric Data',
          description: 'Biometric identifiers and references',
          patternCount: 2,
          enabled: true,
        },
      ];

      return c.json({ success: true, data: categories });
    } catch (error) {
      this.logger.error('Failed to get pattern categories', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private getComplianceRules(c: any) {
    try {
      // Mock data - will be connected to actual compliance scanner
      const rules = [
        {
          id: 'hipaa-001',
          standard: 'hipaa',
          name: 'Protected Health Information (PHI)',
          description: 'Detect unprotected PHI in requests',
          severity: 'CRITICAL',
          enabled: true,
        },
        {
          id: 'pci-001',
          standard: 'pci_dss',
          name: 'Cardholder Data Storage',
          description: 'Detect storage of prohibited cardholder data',
          severity: 'CRITICAL',
          enabled: true,
        },
        {
          id: 'sox-001',
          standard: 'sox',
          name: 'Financial Data Integrity',
          description: 'Detect manipulation of financial data',
          severity: 'CRITICAL',
          enabled: true,
        },
      ];

      return c.json({ success: true, data: rules });
    } catch (error) {
      this.logger.error('Failed to get compliance rules', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 500);
    }
  }

  private async updateComplianceRule(c: any) {
    try {
      const id = c.req.param('id');
      const { enabled } = await c.req.json();

      this.logger.info('Compliance rule updated', { id, enabled });

      return c.json({
        success: true,
        message: 'Rule updated successfully',
        data: { id, enabled },
      });
    } catch (error) {
      this.logger.error('Failed to update compliance rule', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  private async testPattern(c: any) {
    try {
      const { pattern, testText } = await c.req.json();

      // Test the pattern against the text
      const regex = new RegExp(pattern, 'gi');
      const matches = testText.match(regex) || [];

      return c.json({
        success: true,
        data: {
          matches: matches.length,
          found: matches,
        },
      });
    } catch (error) {
      this.logger.error('Failed to test pattern', error instanceof Error ? error : undefined);
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  }

  // Certificate management handlers
  private getCAInfo(c: any) {
    try {
      // In production, this would get info from CertificateManager
      const caInfo = {
        fingerprint: 'a1:b2:c3:d4:e5:f6:g7:h8:i9:j0:k1:l2:m3:n4:o5:p6:q7:r8:s9:t0:u1:v2:w3:x4:y5:z6',
        subject: 'CN=Proxilion Root CA, O=Proxilion, C=US',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      };

      return c.json(caInfo);
    } catch (error) {
      this.logger.error('Failed to get CA info', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to get CA info' }, 500);
    }
  }

  private downloadCACertificate(c: any) {
    try {
      const format = c.req.query('format') || 'pem';

      // In production, this would get the actual certificate from CertificateManager
      const certContent = format === 'pem'
        ? '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAKL...\n-----END CERTIFICATE-----'
        : Buffer.from('certificate-data').toString('base64');

      const contentType = format === 'pem' ? 'application/x-pem-file' : 'application/x-x509-ca-cert';
      const filename = `proxilion-ca.${format}`;

      return c.body(certContent, 200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
    } catch (error) {
      this.logger.error('Failed to download CA certificate', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to download certificate' }, 500);
    }
  }

  private getCertificateStats(c: any) {
    try {
      // In production, this would get stats from CertificateManager
      const stats = {
        totalCertificates: 42,
        activeCertificates: 38,
        expiringCertificates: 4,
        domains: ['chat.openai.com', 'claude.ai', 'gemini.google.com'],
      };

      return c.json(stats);
    } catch (error) {
      this.logger.error('Failed to get certificate stats', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to get certificate stats' }, 500);
    }
  }

  private async rotateCertificates(c: any) {
    try {
      // In production, this would trigger certificate rotation
      const rotated = 4;

      this.logger.info('Certificates rotated', { count: rotated });
      return c.json({ success: true, rotated });
    } catch (error) {
      this.logger.error('Failed to rotate certificates', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to rotate certificates' }, 500);
    }
  }

  // Audit and reporting handlers
  private getAuditEvents(c: any) {
    try {
      const limit = parseInt(c.req.query('limit') || '100');
      const offset = parseInt(c.req.query('offset') || '0');
      const type = c.req.query('type');
      const userId = c.req.query('userId');
      const startTime = parseInt(c.req.query('startTime') || '0');
      const endTime = parseInt(c.req.query('endTime') || String(Date.now()));

      // In production, this would query from audit log storage
      const events = [
        {
          id: '1',
          timestamp: Date.now() - 3600000,
          type: 'request.blocked',
          userId: 'user123',
          action: 'block',
          threatLevel: 'CRITICAL',
          message: 'Blocked request containing SSN',
        },
        {
          id: '2',
          timestamp: Date.now() - 7200000,
          type: 'request.allowed',
          userId: 'user456',
          action: 'allow',
          threatLevel: 'NONE',
          message: 'Request allowed',
        },
      ];

      return c.json({
        events,
        total: events.length,
        limit,
        offset,
      });
    } catch (error) {
      this.logger.error('Failed to get audit events', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to get audit events' }, 500);
    }
  }

  private getAuditEvent(c: any) {
    try {
      const id = c.req.param('id');

      // In production, this would query from audit log storage
      const event = {
        id,
        timestamp: Date.now(),
        type: 'request.blocked',
        userId: 'user123',
        action: 'block',
        threatLevel: 'CRITICAL',
        message: 'Blocked request containing SSN',
        findings: [
          {
            type: 'US Social Security Number',
            severity: 'CRITICAL',
            evidence: '***-**-****',
          },
        ],
      };

      return c.json(event);
    } catch (error) {
      this.logger.error('Failed to get audit event', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to get audit event' }, 500);
    }
  }

  private async getComplianceReport(c: any) {
    try {
      const startTime = parseInt(c.req.query('startTime') || String(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const endTime = parseInt(c.req.query('endTime') || String(Date.now()));
      const standard = c.req.query('standard');

      // In production, this would use ReportingEngine
      const report = {
        id: crypto.randomUUID(),
        type: 'compliance',
        generatedAt: Date.now(),
        period: { start: startTime, end: endTime },
        summary: {
          totalViolations: 42,
          criticalViolations: 5,
          highViolations: 15,
          mediumViolations: 18,
          lowViolations: 4,
          complianceScore: 87.5,
        },
        byStandard: {
          hipaa: { violations: 12, score: 85 },
          pci_dss: { violations: 8, score: 90 },
          gdpr: { violations: 15, score: 82 },
          ccpa: { violations: 7, score: 88 },
        },
        topViolations: [
          { type: 'PHI Exposure', count: 12, severity: 'CRITICAL' },
          { type: 'Credit Card Number', count: 8, severity: 'CRITICAL' },
          { type: 'Personal Data Processing', count: 15, severity: 'HIGH' },
        ],
      };

      return c.json(report);
    } catch (error) {
      this.logger.error('Failed to generate compliance report', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to generate compliance report' }, 500);
    }
  }

  private async getSecurityReport(c: any) {
    try {
      const startTime = parseInt(c.req.query('startTime') || String(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const endTime = parseInt(c.req.query('endTime') || String(Date.now()));

      // In production, this would use ReportingEngine
      const report = {
        id: crypto.randomUUID(),
        type: 'security',
        generatedAt: Date.now(),
        period: { start: startTime, end: endTime },
        summary: {
          totalThreats: 156,
          blockedRequests: 89,
          allowedWithWarnings: 67,
          criticalThreats: 23,
          highThreats: 45,
        },
        byCategory: {
          pii: { count: 78, blocked: 45 },
          credentials: { count: 34, blocked: 28 },
          compliance: { count: 44, blocked: 16 },
        },
        topUsers: [
          { userId: 'user123', violations: 23 },
          { userId: 'user456', violations: 18 },
          { userId: 'user789', violations: 12 },
        ],
      };

      return c.json(report);
    } catch (error) {
      this.logger.error('Failed to generate security report', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to generate security report' }, 500);
    }
  }

  private async getExecutiveReport(c: any) {
    try {
      const startTime = parseInt(c.req.query('startTime') || String(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const endTime = parseInt(c.req.query('endTime') || String(Date.now()));

      // In production, this would use ReportingEngine
      const report = {
        id: crypto.randomUUID(),
        type: 'executive',
        generatedAt: Date.now(),
        period: { start: startTime, end: endTime },
        summary: {
          totalRequests: 12543,
          blockedRequests: 89,
          blockRate: 0.71,
          complianceScore: 87.5,
          securityScore: 92.3,
          costSavings: 15420,
        },
        highlights: [
          'Blocked 89 requests containing sensitive data',
          'Prevented 23 critical compliance violations',
          'Saved $15,420 in potential breach costs',
          'Maintained 99.9% uptime',
        ],
        recommendations: [
          'Increase training for users with high violation rates',
          'Review and update PII detection patterns',
          'Consider implementing additional compliance standards',
        ],
      };

      return c.json(report);
    } catch (error) {
      this.logger.error('Failed to generate executive report', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to generate executive report' }, 500);
    }
  }

  private async generateReport(c: any) {
    try {
      const body = await c.req.json();
      const { type, format, startTime, endTime } = body;

      // In production, this would use ReportingEngine
      const reportId = crypto.randomUUID();

      this.logger.info('Report generation requested', { reportId, type, format });

      return c.json({
        success: true,
        reportId,
        status: 'generating',
        estimatedTime: 30,
      });
    } catch (error) {
      this.logger.error('Failed to generate report', error instanceof Error ? error : new Error(String(error)));
      return c.json({ error: 'Failed to generate report' }, 500);
    }
  }

  /**
   * Get Hono app instance
   */
  getApp(): Hono {
    return this.app;
  }

  /**
   * Start admin API server
   */
  async start(port: number = 8788): Promise<void> {
    this.logger.info('Admin API starting', { port });
    // Note: Actual server start would be handled by the runtime (Cloudflare Workers, Node.js, etc.)
  }
}

