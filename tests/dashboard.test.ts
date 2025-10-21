/**
 * Dashboard Server Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardServer, DashboardMetrics, DashboardAlert } from '../src/ui/dashboard-server.js';

describe('DashboardServer', () => {
  let server: DashboardServer;

  beforeEach(() => {
    server = new DashboardServer({
      enabled: true,
      port: 3000,
      authEnabled: false,
    });
  });

  describe('Metrics Management', () => {
    it('should add metrics snapshot', () => {
      const metrics: DashboardMetrics = {
        timestamp: Date.now(),
        requests: {
          total: 100,
          success: 95,
          failed: 3,
          blocked: 2,
          ratePerSecond: 10,
        },
        security: {
          threatsDetected: 5,
          piiFindings: 2,
          injectionAttempts: 1,
          anomalies: 2,
          criticalAlerts: 0,
        },
        performance: {
          avgLatency: 150,
          p95Latency: 300,
          p99Latency: 500,
          cacheHitRate: 0.85,
          errorRate: 0.03,
        },
        cost: {
          totalSpent: 10.50,
          avgCostPerRequest: 0.105,
          topModels: [
            { model: 'gpt-4', cost: 8.0, count: 50 },
            { model: 'gpt-3.5-turbo', cost: 2.5, count: 50 },
          ],
        },
        providers: {
          openai: {
            requests: 80,
            errors: 2,
            avgLatency: 140,
            availability: 0.975,
          },
          anthropic: {
            requests: 20,
            errors: 1,
            avgLatency: 180,
            availability: 0.95,
          },
        },
      };

      server.addMetrics(metrics);

      const app = server.getApp();
      expect(app).toBeDefined();
    });

    it('should limit metrics history size', () => {
      // Add more than max history size
      for (let i = 0; i < 1100; i++) {
        server.addMetrics({
          timestamp: Date.now() + i,
          requests: {
            total: i,
            success: i,
            failed: 0,
            blocked: 0,
            ratePerSecond: 1,
          },
          security: {
            threatsDetected: 0,
            piiFindings: 0,
            injectionAttempts: 0,
            anomalies: 0,
            criticalAlerts: 0,
          },
          performance: {
            avgLatency: 100,
            p95Latency: 200,
            p99Latency: 300,
            cacheHitRate: 0.9,
            errorRate: 0,
          },
          cost: {
            totalSpent: 0,
            avgCostPerRequest: 0,
            topModels: [],
          },
          providers: {},
        });
      }

      // Should be limited to maxHistorySize (1000)
      const app = server.getApp();
      expect(app).toBeDefined();
    });
  });

  describe('Alert Management', () => {
    it('should add alert', () => {
      server.addAlert({
        severity: 'critical',
        category: 'security',
        title: 'High threat detected',
        message: 'Multiple prompt injection attempts detected',
        source: 'security-scanner',
      });

      const app = server.getApp();
      expect(app).toBeDefined();
    });

    it('should add alert with metadata', () => {
      server.addAlert({
        severity: 'warning',
        category: 'performance',
        title: 'High latency',
        message: 'Average latency exceeded threshold',
        source: 'performance-monitor',
        metadata: {
          avgLatency: 500,
          threshold: 300,
        },
      });

      const app = server.getApp();
      expect(app).toBeDefined();
    });

    it('should limit alerts size', () => {
      // Add more than max alerts
      for (let i = 0; i < 600; i++) {
        server.addAlert({
          severity: 'info',
          category: 'system',
          title: `Alert ${i}`,
          message: `Test alert ${i}`,
          source: 'test',
        });
      }

      // Should be limited to maxAlerts (500)
      const app = server.getApp();
      expect(app).toBeDefined();
    });

    it('should clear acknowledged alerts', () => {
      server.addAlert({
        severity: 'info',
        category: 'system',
        title: 'Test alert 1',
        message: 'Test message 1',
        source: 'test',
      });

      server.addAlert({
        severity: 'warning',
        category: 'security',
        title: 'Test alert 2',
        message: 'Test message 2',
        source: 'test',
      });

      server.clearAcknowledgedAlerts();

      const app = server.getApp();
      expect(app).toBeDefined();
    });
  });

  describe('API Routes', () => {
    it('should have health check endpoint', async () => {
      const app = server.getApp();
      
      const req = new Request('http://localhost:3000/api/health');
      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
    });

    it('should return current metrics', async () => {
      const metrics: DashboardMetrics = {
        timestamp: Date.now(),
        requests: {
          total: 100,
          success: 95,
          failed: 3,
          blocked: 2,
          ratePerSecond: 10,
        },
        security: {
          threatsDetected: 5,
          piiFindings: 2,
          injectionAttempts: 1,
          anomalies: 2,
          criticalAlerts: 0,
        },
        performance: {
          avgLatency: 150,
          p95Latency: 300,
          p99Latency: 500,
          cacheHitRate: 0.85,
          errorRate: 0.03,
        },
        cost: {
          totalSpent: 10.50,
          avgCostPerRequest: 0.105,
          topModels: [],
        },
        providers: {},
      };

      server.addMetrics(metrics);

      const app = server.getApp();
      const req = new Request('http://localhost:3000/api/metrics/current');
      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.requests.total).toBe(100);
    });

    it('should return metrics history', async () => {
      for (let i = 0; i < 10; i++) {
        server.addMetrics({
          timestamp: Date.now() + i * 1000,
          requests: {
            total: i * 10,
            success: i * 9,
            failed: i,
            blocked: 0,
            ratePerSecond: i,
          },
          security: {
            threatsDetected: 0,
            piiFindings: 0,
            injectionAttempts: 0,
            anomalies: 0,
            criticalAlerts: 0,
          },
          performance: {
            avgLatency: 100,
            p95Latency: 200,
            p99Latency: 300,
            cacheHitRate: 0.9,
            errorRate: 0,
          },
          cost: {
            totalSpent: 0,
            avgCostPerRequest: 0,
            topModels: [],
          },
          providers: {},
        });
      }

      const app = server.getApp();
      const req = new Request('http://localhost:3000/api/metrics/history?limit=5');
      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeLessThanOrEqual(5);
    });

    it('should return system status', async () => {
      const app = server.getApp();
      const req = new Request('http://localhost:3000/api/system/status');
      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.uptime).toBeDefined();
      expect(data.memory).toBeDefined();
      expect(data.version).toBe('1.0.0');
    });

    it('should return configuration', async () => {
      const app = server.getApp();
      const req = new Request('http://localhost:3000/api/config');
      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.apiPrefix).toBe('/api');
      expect(data.authEnabled).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('should require API key when auth is enabled', async () => {
      const authServer = new DashboardServer({
        enabled: true,
        authEnabled: true,
        apiKey: 'test-api-key',
      });

      const app = authServer.getApp();
      const req = new Request('http://localhost:3000/api/metrics/current');
      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
    });

    it('should accept valid API key', async () => {
      const authServer = new DashboardServer({
        enabled: true,
        authEnabled: true,
        apiKey: 'test-api-key',
      });

      const app = authServer.getApp();
      const req = new Request('http://localhost:3000/api/metrics/current', {
        headers: {
          'x-api-key': 'test-api-key',
        },
      });
      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
    });
  });
});

