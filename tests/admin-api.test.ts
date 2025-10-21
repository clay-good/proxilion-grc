import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminAPI } from '../src/admin/admin-api.js';
import { PolicyEngine } from '../src/policy/policy-engine.js';
import { MetricsCollector } from '../src/utils/metrics.js';
import { CostTracker } from '../src/cost/cost-tracker.js';
import { AnalyticsEngine } from '../src/analytics/analytics-engine.js';
import { ScannerOrchestrator } from '../src/scanners/scanner-orchestrator.js';
import { Policy, PolicyAction, ThreatLevel, AIServiceProvider } from '../src/types/index.js';

describe('AdminAPI', () => {
  let adminAPI: AdminAPI;
  let policyEngine: PolicyEngine;
  let metricsCollector: MetricsCollector;
  let costTracker: CostTracker;
  let analyticsEngine: AnalyticsEngine;
  let scannerOrchestrator: ScannerOrchestrator;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    metricsCollector = new MetricsCollector();
    costTracker = new CostTracker();
    analyticsEngine = new AnalyticsEngine();
    scannerOrchestrator = new ScannerOrchestrator({
      enableParallelScanning: true,
      scanTimeout: 5000,
    });

    adminAPI = new AdminAPI(
      policyEngine,
      metricsCollector,
      costTracker,
      analyticsEngine,
      scannerOrchestrator,
      {
        enableAuth: false, // Disable auth for testing
        corsOrigins: ['*'],
      }
    );
  });

  const makeRequest = async (method: string, path: string, body?: any) => {
    const app = adminAPI.getApp();
    const req = new Request(`http://localhost${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return await app.fetch(req);
  };

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await makeRequest('GET', '/health');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Configuration Endpoints', () => {
    it('should get current configuration', async () => {
      const res = await makeRequest('GET', '/api/config');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.server).toBeDefined();
      expect(data.data.security).toBeDefined();
    });

    it('should update configuration', async () => {
      const updates = {
        server: {
          port: 9000,
        },
      };

      const res = await makeRequest('PUT', '/api/config', updates);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('updated');
    });

    it('should validate configuration', async () => {
      const config = {
        server: {
          port: 8787,
        },
      };

      const res = await makeRequest('POST', '/api/config/validate', config);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBeDefined();
      expect(data.valid).toBeDefined();
      expect(data.errors).toBeDefined();
    });

    it('should reset configuration', async () => {
      const res = await makeRequest('POST', '/api/config/reset');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('reset');
    });

    it('should reject invalid configuration updates', async () => {
      const invalidUpdates = {
        server: {
          port: -1, // Invalid port
        },
      };

      const res = await makeRequest('PUT', '/api/config', invalidUpdates);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Policy Endpoints', () => {
    const testPolicy: Policy = {
      id: 'test-policy-1',
      name: 'Test Policy',
      description: 'Test policy description',
      enabled: true,
      priority: 50,
      conditions: [
        {
          type: 'scanner',
          scanner: 'pii-scanner',
          operator: 'equals',
          value: false,
        },
      ],
      actions: [PolicyAction.ALLOW],
    };

    it('should get all policies', async () => {
      policyEngine.addPolicy(testPolicy);

      const res = await makeRequest('GET', '/api/policies');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.count).toBeGreaterThan(0);
    });

    it('should get single policy by id', async () => {
      policyEngine.addPolicy(testPolicy);

      const res = await makeRequest('GET', `/api/policies/${testPolicy.id}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testPolicy.id);
    });

    it('should return 404 for non-existent policy', async () => {
      const res = await makeRequest('GET', '/api/policies/non-existent');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should create new policy', async () => {
      const newPolicy: Policy = {
        id: 'new-policy',
        name: 'New Policy',
        description: 'New policy description',
        enabled: true,
        priority: 60,
        conditions: [],
        actions: [PolicyAction.ALLOW],
      };

      const res = await makeRequest('POST', '/api/policies', newPolicy);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(newPolicy.id);
    });

    it('should update existing policy', async () => {
      policyEngine.addPolicy(testPolicy);

      const updates = {
        name: 'Updated Policy Name',
        priority: 70,
      };

      const res = await makeRequest('PUT', `/api/policies/${testPolicy.id}`, updates);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(updates.name);
    });

    it('should delete policy', async () => {
      policyEngine.addPolicy(testPolicy);

      const res = await makeRequest('DELETE', `/api/policies/${testPolicy.id}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(policyEngine.getPolicy(testPolicy.id)).toBeUndefined();
    });

    it('should enable policy', async () => {
      const disabledPolicy = { ...testPolicy, enabled: false };
      policyEngine.addPolicy(disabledPolicy);

      const res = await makeRequest('POST', `/api/policies/${testPolicy.id}/enable`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(policyEngine.getPolicy(testPolicy.id)?.enabled).toBe(true);
    });

    it('should disable policy', async () => {
      policyEngine.addPolicy(testPolicy);

      const res = await makeRequest('POST', `/api/policies/${testPolicy.id}/disable`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(policyEngine.getPolicy(testPolicy.id)?.enabled).toBe(false);
    });
  });

  describe('Metrics Endpoints', () => {
    it('should get metrics', async () => {
      metricsCollector.increment('requestCount');
      metricsCollector.increment('errorCount');

      const res = await makeRequest('GET', '/api/metrics');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should get metrics summary', async () => {
      metricsCollector.increment('requestCount');
      metricsCollector.increment('cacheHits');
      metricsCollector.increment('cacheMisses');

      const res = await makeRequest('GET', '/api/metrics/summary');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.totalRequests).toBeDefined();
      expect(data.data.cacheHitRate).toBeDefined();
    });

    it('should reset metrics', async () => {
      metricsCollector.increment('requestCount');

      const res = await makeRequest('POST', '/api/metrics/reset');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Cost Tracking Endpoints', () => {
    it('should get all costs', async () => {
      const res = await makeRequest('GET', '/api/costs');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should get cost summary', async () => {
      const res = await makeRequest('GET', '/api/costs/summary');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should get costs by tenant', async () => {
      const tenantId = 'tenant-123';

      const res = await makeRequest('GET', `/api/costs/by-tenant/${tenantId}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });
  });

  describe('Analytics Endpoints', () => {
    it('should get threat analytics', async () => {
      const res = await makeRequest('GET', '/api/analytics/threats');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should get anomalies', async () => {
      const res = await makeRequest('GET', '/api/analytics/anomalies');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.count).toBeDefined();
    });

    it('should get trends', async () => {
      const res = await makeRequest('GET', '/api/analytics/trends?period=24h');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });
  });

  describe('System Endpoints', () => {
    it('should get system status', async () => {
      const res = await makeRequest('GET', '/api/system/status');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.healthy).toBe(true);
      expect(data.data.version).toBeDefined();
      expect(data.data.scanners).toBeDefined();
    });

    it('should get system stats', async () => {
      const res = await makeRequest('GET', '/api/system/stats');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.requests).toBeDefined();
      expect(data.data.threats).toBeDefined();
      expect(data.data.costs).toBeDefined();
      expect(data.data.policies).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should require API key when auth is enabled', async () => {
      const authAPI = new AdminAPI(
        policyEngine,
        metricsCollector,
        costTracker,
        analyticsEngine,
        {
          enableAuth: true,
          apiKey: 'test-api-key',
        }
      );

      const app = authAPI.getApp();
      const req = new Request('http://localhost/api/config', {
        method: 'GET',
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should accept valid API key', async () => {
      const authAPI = new AdminAPI(
        policyEngine,
        metricsCollector,
        costTracker,
        analyticsEngine,
        scannerOrchestrator,
        {
          enableAuth: true,
          apiKey: 'test-api-key',
        }
      );

      const app = authAPI.getApp();
      const req = new Request('http://localhost/api/config', {
        method: 'GET',
        headers: {
          'X-API-Key': 'test-api-key',
        },
      });

      const res = await app.fetch(req);

      expect(res.status).toBe(200);
    });
  });
});

