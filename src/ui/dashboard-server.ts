/**
 * Dashboard Server
 * 
 * Serves the Web UI Dashboard and provides API endpoints for:
 * - Real-time metrics and monitoring
 * - Policy management
 * - Security analytics
 * - System configuration
 * - User management
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/serve-static';

export interface DashboardConfig {
  enabled: boolean;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  authEnabled: boolean;
  apiKey?: string;
  sessionSecret?: string;
  staticPath?: string;
}

export interface DashboardMetrics {
  timestamp: number;
  requests: {
    total: number;
    success: number;
    failed: number;
    blocked: number;
    ratePerSecond: number;
  };
  security: {
    threatsDetected: number;
    piiFindings: number;
    injectionAttempts: number;
    anomalies: number;
    criticalAlerts: number;
  };
  performance: {
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    cacheHitRate: number;
    errorRate: number;
  };
  cost: {
    totalSpent: number;
    avgCostPerRequest: number;
    topModels: Array<{ model: string; cost: number; count: number }>;
  };
  providers: {
    [provider: string]: {
      requests: number;
      errors: number;
      avgLatency: number;
      availability: number;
    };
  };
}

export interface DashboardAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'security' | 'performance' | 'cost' | 'system';
  title: string;
  message: string;
  source: string;
  acknowledged: boolean;
  metadata?: Record<string, any>;
}

export class DashboardServer {
  private app: Hono;
  private config: Required<DashboardConfig>;
  private metricsHistory: DashboardMetrics[] = [];
  private alerts: DashboardAlert[] = [];
  private maxHistorySize = 1000;
  private maxAlerts = 500;

  constructor(config: Partial<DashboardConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      port: config.port ?? 3000,
      apiPrefix: config.apiPrefix ?? '/api',
      corsOrigins: config.corsOrigins ?? ['*'],
      authEnabled: config.authEnabled ?? false,
      apiKey: config.apiKey ?? '',
      sessionSecret: config.sessionSecret ?? 'change-me-in-production',
      staticPath: config.staticPath ?? './public',
    };

    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(
      '*',
      cors({
        origin: this.config.corsOrigins,
        credentials: true,
      })
    );

    // Authentication middleware
    if (this.config.authEnabled) {
      this.app.use(`${this.config.apiPrefix}/*`, async (c, next) => {
        const apiKey = c.req.header('x-api-key') || c.req.query('api_key');
        
        if (!apiKey || apiKey !== this.config.apiKey) {
          return c.json({ error: 'Unauthorized' }, 401);
        }

        await next();
      });
    }
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const api = this.app.basePath(this.config.apiPrefix);

    // Health check
    api.get('/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: Date.now(),
        version: '1.0.0',
      });
    });

    // Get current metrics
    api.get('/metrics/current', (c) => {
      const latest = this.metricsHistory[this.metricsHistory.length - 1];
      return c.json(latest || this.getEmptyMetrics());
    });

    // Get metrics history
    api.get('/metrics/history', (c) => {
      const limit = parseInt(c.req.query('limit') || '100');
      const history = this.metricsHistory.slice(-limit);
      return c.json(history);
    });

    // Get metrics time series
    api.get('/metrics/timeseries', (c) => {
      const metric = c.req.query('metric') || 'requests.total';
      const limit = parseInt(c.req.query('limit') || '100');
      
      const data = this.metricsHistory.slice(-limit).map((m) => ({
        timestamp: m.timestamp,
        value: this.getNestedValue(m, metric),
      }));

      return c.json(data);
    });

    // Get alerts
    api.get('/alerts', (c) => {
      const severity = c.req.query('severity');
      const category = c.req.query('category');
      const acknowledged = c.req.query('acknowledged');

      let filtered = [...this.alerts];

      if (severity) {
        filtered = filtered.filter((a) => a.severity === severity);
      }

      if (category) {
        filtered = filtered.filter((a) => a.category === category);
      }

      if (acknowledged !== undefined) {
        const ack = acknowledged === 'true';
        filtered = filtered.filter((a) => a.acknowledged === ack);
      }

      return c.json(filtered);
    });

    // Acknowledge alert
    api.post('/alerts/:id/acknowledge', async (c) => {
      const id = c.req.param('id');
      const alert = this.alerts.find((a) => a.id === id);

      if (!alert) {
        return c.json({ error: 'Alert not found' }, 404);
      }

      alert.acknowledged = true;
      return c.json(alert);
    });

    // Get system status
    api.get('/system/status', (c) => {
      return c.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      });
    });

    // Get configuration
    api.get('/config', (c) => {
      return c.json({
        apiPrefix: this.config.apiPrefix,
        authEnabled: this.config.authEnabled,
        corsOrigins: this.config.corsOrigins,
      });
    });

    // Serve static files (UI) - Note: serveStatic requires additional configuration
    // For production, serve the UI separately or use a proper static file server
    // this.app.use('/*', serveStatic({ root: this.config.staticPath }));
  }

  /**
   * Add metrics snapshot
   */
  addMetrics(metrics: DashboardMetrics): void {
    this.metricsHistory.push(metrics);

    // Limit history size
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Add alert
   */
  addAlert(alert: Omit<DashboardAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const newAlert: DashboardAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      acknowledged: false,
      ...alert,
    };

    this.alerts.unshift(newAlert);

    // Limit alerts size
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.pop();
    }
  }

  /**
   * Clear acknowledged alerts
   */
  clearAcknowledgedAlerts(): void {
    this.alerts = this.alerts.filter((a) => !a.acknowledged);
  }

  /**
   * Get Hono app instance
   */
  getApp(): Hono {
    return this.app;
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('Dashboard server is disabled');
      return;
    }

    console.log(`Dashboard server starting on port ${this.config.port}`);
    console.log(`API available at http://localhost:${this.config.port}${this.config.apiPrefix}`);
    console.log(`UI available at http://localhost:${this.config.port}`);
  }

  /**
   * Get empty metrics
   */
  private getEmptyMetrics(): DashboardMetrics {
    return {
      timestamp: Date.now(),
      requests: {
        total: 0,
        success: 0,
        failed: 0,
        blocked: 0,
        ratePerSecond: 0,
      },
      security: {
        threatsDetected: 0,
        piiFindings: 0,
        injectionAttempts: 0,
        anomalies: 0,
        criticalAlerts: 0,
      },
      performance: {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        cacheHitRate: 0,
        errorRate: 0,
      },
      cost: {
        totalSpent: 0,
        avgCostPerRequest: 0,
        topModels: [],
      },
      providers: {},
    };
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

