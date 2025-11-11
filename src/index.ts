/**
 * Proxilion - Enterprise AI Security Network Proxy
 * Main entry point
 */

import { Hono } from 'hono';
import { ProxilionRequest, PolicyAction, ProxilionError, AuditEvent, LogLevel, ThreatLevel, UnifiedAIRequest, AggregatedScanResult } from './types/index.js';
import { logger } from './utils/logger.js';
import { metrics } from './utils/metrics.js';
import { ConnectionPool } from './proxy/connection-pool.js';
import { RequestHandler } from './proxy/request-handler.js';
import { ParserRegistry } from './parsers/parser-registry.js';
import { ScannerOrchestrator } from './scanners/scanner-orchestrator.js';
import { PolicyEngine } from './policy/policy-engine.js';
import { CacheManager } from './cache/cache-manager.js';
import { RequestDeduplicator } from './cache/request-deduplicator.js';
import { RateLimiter } from './performance/rate-limiter.js';
import { RequestOptimizer } from './performance/request-optimizer.js';
import { ResponseProcessor } from './response/response-processor.js';
import { HealthChecker, createMemoryHealthCheck, createDependencyHealthCheck } from './health/health-checker.js';
import { SIEMForwarder } from './integrations/siem/siem-forwarder.js';
import { WebhookManager } from './integrations/webhooks/webhook-manager.js';
import { AuthProvider } from './integrations/auth/auth-provider.js';
import { AlertManager } from './integrations/alerting/alert-manager.js';
import { CostTracker } from './cost/cost-tracker.js';
import { AnalyticsEngine } from './analytics/analytics-engine.js';
import { TenantManager } from './tenancy/tenant-manager.js';
import { StreamProcessor } from './streaming/stream-processor.js';
import { IdentityExtractor } from './identity/identity-extractor.js';
import { APIKeyManager } from './identity/api-key-manager.js';
import { BrowserSessionTracker } from './identity/browser-session-tracker.js';
import { UserAnalytics } from './analytics/user-analytics.js';
import { PrometheusExporter } from './observability/prometheus-exporter.js';
import { OpenTelemetryTracer } from './observability/opentelemetry-tracer.js';
import { GrafanaDashboardGenerator } from './observability/grafana-dashboards.js';
import { GraphQLServer } from './graphql/server.js';
import { WorkflowExecutor } from './workflows/workflow-executor.js';
import { WorkflowTemplateManager } from './workflows/workflow-template-manager.js';
import { PromptVersionManager } from './prompts/prompt-version-manager.js';
import { PromptLibrary } from './prompts/prompt-library.js';
import { ModelRegistry } from './models/model-registry.js';
import { RealtimeMonitor } from './monitoring/realtime-monitor.js';

const app = new Hono();

// Initialize components
const connectionPool = new ConnectionPool({
  maxConnections: 100,
  maxIdleTime: 60000,
  acquireTimeout: 5000,
});

const requestHandler = new RequestHandler(
  {
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  connectionPool
);

const parserRegistry = new ParserRegistry();

const scannerOrchestrator = new ScannerOrchestrator({
  enableParallelScanning: true,
  scanTimeout: 10000,
});

const policyEngine = new PolicyEngine();

// Performance optimization components
const cacheManager = new CacheManager({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxEntries: 10000,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  evictionPolicy: 'LRU',
});

const requestDeduplicator = new RequestDeduplicator(30000);

const rateLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  burstSize: 150,
});

const requestOptimizer = new RequestOptimizer({
  enableParallelScanning: true,
  enableEarlyTermination: true,
  enableScanCaching: true,
  enableConnectionPooling: true,
  enableHeaderOptimization: true,
  scanCacheTTL: 60000, // 1 minute
  maxCacheSize: 10000,
});

const responseProcessor = new ResponseProcessor({
  enablePIIRedaction: true,
  enableContentFiltering: true,
  enableValidation: true,
});

const streamProcessor = new StreamProcessor({
  enablePIIRedaction: true,
  enableToxicityScanning: true,
  bufferSize: 1024,
  chunkTimeout: 5000,
  maxBufferedChunks: 100,
});

// Enterprise integration components
const siemForwarder = new SIEMForwarder({
  enabled: process.env.SIEM_ENABLED === 'true',
  vendor: (process.env.SIEM_VENDOR as any) || 'GENERIC',
  format: (process.env.SIEM_FORMAT as any) || 'JSON',
  endpoint: process.env.SIEM_ENDPOINT || '',
  apiKey: process.env.SIEM_API_KEY,
  batchSize: 100,
  batchInterval: 10000,
});

const webhookManager = new WebhookManager();

const authProvider = new AuthProvider({
  method: (process.env.AUTH_METHOD as any) || 'API_KEY',
  apiKeys: process.env.API_KEYS?.split(',') || [],
  jwtSecret: process.env.JWT_SECRET,
  jwtIssuer: process.env.JWT_ISSUER,
});

const alertManager = new AlertManager({
  enabled: process.env.ALERTS_ENABLED === 'true',
  minThreatLevel: (process.env.ALERT_MIN_THREAT_LEVEL as any) || 'MEDIUM',
  channels: [],
  throttle: {
    enabled: true,
    windowMs: 60000,
    maxAlerts: 10,
  },
  aggregation: {
    enabled: true,
    windowMs: 30000,
  },
});

// Advanced features
const costTracker = new CostTracker();
const analyticsEngine = new AnalyticsEngine();
const tenantManager = new TenantManager();

// Identity and user tracking
const identityExtractor = new IdentityExtractor({
  enableAPIKeyMapping: true,
  enableJWTExtraction: true,
  enableHeaderExtraction: true,
  enableCookieExtraction: true,
  enableIPMapping: true,
  defaultOrganizationId: process.env.DEFAULT_ORG_ID || 'default',
});

const apiKeyManager = new APIKeyManager();
const browserSessionTracker = new BrowserSessionTracker({
  sessionDuration: 24 * 60 * 60 * 1000, // 24 hours
  cookieName: 'proxilion_session',
  cookieSecure: true,
  cookieHttpOnly: true,
  cookieSameSite: 'lax',
});

const userAnalytics = new UserAnalytics();

// Register identity extractor with API key manager
// This allows identity extraction to use registered API keys
const apiKeyManagerRef = apiKeyManager;
identityExtractor.registerAPIKey = (metadata) => {
  apiKeyManagerRef.registerKey({
    apiKey: metadata.apiKey,
    userId: metadata.userId,
    email: metadata.email,
    username: metadata.username,
    teamId: metadata.teamId,
    teamName: metadata.teamName,
    organizationId: metadata.organizationId,
    organizationName: metadata.organizationName,
    roles: metadata.roles,
    expiresAt: metadata.expiresAt,
    metadata: metadata.metadata,
  });
};

// Observability components
const prometheusExporter = new PrometheusExporter({
  prefix: 'proxilion_',
  defaultLabels: {
    service: 'proxilion',
    environment: process.env.ENVIRONMENT || 'production',
  },
  histogramBuckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const openTelemetryTracer = new OpenTelemetryTracer({
  serviceName: 'proxilion',
  serviceVersion: '0.1.0',
  environment: process.env.ENVIRONMENT || 'production',
  exporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:14268/api/traces',
  exporterType: (process.env.OTEL_EXPORTER_TYPE as any) || 'jaeger',
  samplingRate: parseFloat(process.env.OTEL_SAMPLING_RATE || '1.0'),
  exportInterval: 5000,
});

// Workflow and Prompt Management components
const workflowExecutor = new WorkflowExecutor();
const workflowTemplates = new WorkflowTemplateManager();
const promptVersionManager = new PromptVersionManager();
const promptLibrary = new PromptLibrary();
const modelRegistry = new ModelRegistry();
const realtimeMonitor = new RealtimeMonitor(
  metrics,
  analyticsEngine,
  {
    metricsInterval: 1000,
  }
);

// GraphQL API Gateway
const graphqlServer = new GraphQLServer(
  policyEngine,
  scannerOrchestrator,
  costTracker,
  analyticsEngine,
  userAnalytics,
  workflowExecutor,
  workflowTemplates,
  promptVersionManager,
  promptLibrary,
  modelRegistry,
  realtimeMonitor,
  {
    apiKey: process.env.GRAPHQL_API_KEY,
    enableIntrospection: process.env.NODE_ENV !== 'production',
    enablePlayground: process.env.NODE_ENV !== 'production',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
  }
);

// Health checker
const healthChecker = new HealthChecker();

// Register health checks
healthChecker.registerCheck('memory', createMemoryHealthCheck);
healthChecker.registerCheck('openai', () =>
  createDependencyHealthCheck('openai', 'https://api.openai.com', 5000)
);
healthChecker.registerCheck('anthropic', () =>
  createDependencyHealthCheck('anthropic', 'https://api.anthropic.com', 5000)
);

// Start periodic health checks (2 minutes - reduced from 30s to lower overhead)
healthChecker.startPeriodicChecks(120000);

// Health check endpoint
app.get('/health', async (c) => {
  const health = await healthChecker.checkHealth();

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return c.json(health, statusCode);
});

// Status endpoint with detailed information
app.get('/status', (c) => {
  const cacheStats = cacheManager.getStats();
  const pendingDedups = requestDeduplicator.getPendingCount();

  return c.json({
    status: 'operational',
    version: '0.1.0',
    components: {
      parsers: parserRegistry.getRegisteredParsers(),
      scanners: scannerOrchestrator.getRegisteredScanners(),
      policies: policyEngine.getPolicies().length,
    },
    performance: {
      cache: {
        hitRate: cacheStats.hitRate,
        entries: cacheStats.currentEntries,
        size: cacheStats.currentSize,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        evictions: cacheStats.evictions,
      },
      deduplication: {
        pending: pendingDedups,
      },
    },
    connectionPool: connectionPool.getStats(),
    circuitBreakers: requestHandler.getCircuitBreakerStats(),
    timestamp: Date.now(),
  });
});

// Metrics endpoint (JSON format)
app.get('/metrics', (c) => {
  const allMetrics = metrics.getMetrics();
  return c.json({
    metrics: allMetrics,
    timestamp: Date.now(),
  });
});

// Prometheus metrics endpoint (text format)
app.get('/metrics/prometheus', prometheusExporter.getHandler());

// Performance optimization metrics
app.get('/api/performance/metrics', (c) => {
  const optimizerMetrics = requestOptimizer.getMetrics();
  return c.json({
    success: true,
    data: optimizerMetrics,
    timestamp: Date.now(),
  });
});

app.get('/api/performance/cache-stats', (c) => {
  const cacheStats = requestOptimizer.getCacheStats();
  return c.json({
    success: true,
    data: cacheStats,
    timestamp: Date.now(),
  });
});

app.post('/api/performance/cache/clear', (c) => {
  requestOptimizer.clearCache();
  return c.json({
    success: true,
    message: 'Cache cleared successfully',
  });
});

app.post('/api/performance/metrics/reset', (c) => {
  requestOptimizer.resetMetrics();
  return c.json({
    success: true,
    message: 'Metrics reset successfully',
  });
});

// GraphQL API Gateway endpoint
app.all('/graphql', async (c) => {
  const request = c.req.raw;
  const response = await graphqlServer.handleRequest(request);
  return response;
});

// Grafana dashboards endpoint
app.get('/admin/dashboards', (c) => {
  const dashboards = GrafanaDashboardGenerator.exportAll();
  return c.json({
    dashboards,
    timestamp: Date.now(),
  });
});

app.get('/admin/dashboards/:name', (c) => {
  const name = c.req.param('name');
  const dashboards = GrafanaDashboardGenerator.exportAll();

  if (!dashboards[name as keyof typeof dashboards]) {
    return c.json({ error: 'Dashboard not found' }, 404 as any);
  }

  return c.json(dashboards[name as keyof typeof dashboards]);
});

// Cache management endpoints
app.post('/admin/cache/clear', (c) => {
  cacheManager.clear();
  return c.json({ message: 'Cache cleared successfully' });
});

app.get('/admin/cache/stats', (c) => {
  return c.json(cacheManager.getStats());
});

// User Analytics Endpoints
app.get('/admin/analytics/users/training-needed', (c) => {
  const organizationId = c.req.query('organizationId');
  const users = userAnalytics.getUsersNeedingTraining(organizationId);

  return c.json({
    users: users.map(u => ({
      userId: u.userId,
      email: u.email,
      username: u.username,
      teamId: u.teamId,
      organizationId: u.organizationId,
      trainingPriority: u.trainingPriority,
      trainingTopics: u.trainingTopics,
      totalViolations: u.totalViolations,
      criticalViolations: u.criticalViolations,
      highViolations: u.highViolations,
      violationRate: u.totalRequests > 0 ? u.blockedRequests / u.totalRequests : 0,
      lastViolation: u.lastViolation,
    })),
    total: users.length,
    timestamp: Date.now(),
  });
});

app.get('/admin/analytics/users/high-risk', (c) => {
  const organizationId = c.req.query('organizationId');
  const users = userAnalytics.getHighRiskUsers(organizationId);

  return c.json({
    users: users.map(u => ({
      userId: u.userId,
      email: u.email,
      username: u.username,
      teamId: u.teamId,
      organizationId: u.organizationId,
      totalViolations: u.totalViolations,
      criticalViolations: u.criticalViolations,
      highViolations: u.highViolations,
      violationRate: u.totalRequests > 0 ? u.blockedRequests / u.totalRequests : 0,
      lastViolation: u.lastViolation,
    })),
    total: users.length,
    timestamp: Date.now(),
  });
});

app.get('/admin/analytics/users/:userId', (c) => {
  const userId = c.req.param('userId');
  const userMetrics = userAnalytics.getUserMetrics(userId);

  if (!userMetrics) {
    return c.json({ error: 'User not found' }, 404 as any);
  }

  const violations = userAnalytics.getUserViolations(userId, 100);

  return c.json({
    user: userMetrics,
    recentViolations: violations,
    timestamp: Date.now(),
  });
});

app.get('/admin/analytics/teams/:teamId', (c) => {
  const teamId = c.req.param('teamId');
  const teamMetrics = userAnalytics.getTeamMetrics(teamId);

  if (!teamMetrics) {
    return c.json({ error: 'Team not found' }, 404 as any);
  }

  return c.json({
    team: teamMetrics,
    timestamp: Date.now(),
  });
});

app.get('/admin/analytics/organizations/:organizationId', (c) => {
  const organizationId = c.req.param('organizationId');
  const orgMetrics = userAnalytics.getOrganizationMetrics(organizationId);

  if (!orgMetrics) {
    return c.json({ error: 'Organization not found' }, 404 as any);
  }

  return c.json({
    organization: orgMetrics,
    timestamp: Date.now(),
  });
});

app.get('/admin/analytics/stats', (c) => {
  return c.json({
    analytics: userAnalytics.getStats(),
    apiKeys: apiKeyManager.getStats(),
    sessions: browserSessionTracker.getStats(),
    timestamp: Date.now(),
  });
});

// API Key Management Endpoints
app.post('/admin/api-keys/register', async (c) => {
  const registration = await c.req.json();
  apiKeyManager.registerKey(registration);

  return c.json({
    message: 'API key registered successfully',
    userId: registration.userId,
  });
});

app.post('/admin/api-keys/bulk-register', async (c) => {
  const registrations = await c.req.json();
  apiKeyManager.registerKeys(registrations);

  return c.json({
    message: 'API keys registered successfully',
    count: registrations.length,
  });
});

app.post('/admin/api-keys/import/csv', async (c) => {
  const csv = await c.req.text();
  apiKeyManager.importFromCSV(csv);

  return c.json({
    message: 'API keys imported from CSV successfully',
  });
});

app.post('/admin/api-keys/import/json', async (c) => {
  const json = await c.req.text();
  apiKeyManager.importFromJSON(json);

  return c.json({
    message: 'API keys imported from JSON successfully',
  });
});

app.get('/admin/api-keys/user/:userId', (c) => {
  const userId = c.req.param('userId');
  const keys = apiKeyManager.getKeysForUser(userId);
  const stats = apiKeyManager.getUserUsageStats(userId);

  return c.json({
    keys: keys.map(k => ({
      apiKey: k.apiKey,
      organizationId: k.organizationId,
      teamId: k.teamId,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
    })),
    usage: stats,
    timestamp: Date.now(),
  });
});

app.get('/admin/api-keys/organization/:organizationId', (c) => {
  const organizationId = c.req.param('organizationId');
  const keys = apiKeyManager.getKeysForOrganization(organizationId);
  const stats = apiKeyManager.getOrganizationUsageStats(organizationId);

  return c.json({
    keys: keys.map(k => ({
      apiKey: k.apiKey,
      userId: k.userId,
      email: k.email,
      teamId: k.teamId,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
    })),
    usage: stats,
    timestamp: Date.now(),
  });
});

app.get('/admin/api-keys/team/:teamId', (c) => {
  const teamId = c.req.param('teamId');
  const keys = apiKeyManager.getKeysForTeam(teamId);
  const stats = apiKeyManager.getTeamUsageStats(teamId);

  return c.json({
    keys: keys.map(k => ({
      apiKey: k.apiKey,
      userId: k.userId,
      email: k.email,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
    })),
    usage: stats,
    timestamp: Date.now(),
  });
});

// Webhook management endpoints
app.post('/admin/webhooks', async (c) => {
  const webhook = await c.req.json();
  webhookManager.register(webhook);
  return c.json({ message: 'Webhook registered successfully', id: webhook.id });
});

app.get('/admin/webhooks', (c) => {
  return c.json({ webhooks: webhookManager.getWebhooks() });
});

app.get('/admin/webhooks/:id', (c) => {
  const id = c.req.param('id');
  const webhook = webhookManager.getWebhook(id);
  if (!webhook) {
    return c.json({ error: 'Webhook not found' }, 404 as any);
  }
  return c.json(webhook);
});

app.put('/admin/webhooks/:id', async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  try {
    webhookManager.update(id, updates);
    return c.json({ message: 'Webhook updated successfully' });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 404 as any);
  }
});

app.delete('/admin/webhooks/:id', (c) => {
  const id = c.req.param('id');
  webhookManager.unregister(id);
  return c.json({ message: 'Webhook unregistered successfully' });
});

app.post('/admin/webhooks/:id/test', async (c) => {
  const id = c.req.param('id');
  try {
    const result = await webhookManager.test(id);
    return c.json({ success: result });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 404 as any);
  }
});

// SIEM integration endpoints
app.get('/admin/siem/config', (c) => {
  return c.json(siemForwarder.getConfig());
});

app.get('/admin/siem/queue', (c) => {
  return c.json({ queueSize: siemForwarder.getQueueSize() });
});

app.post('/admin/siem/flush', async (c) => {
  await siemForwarder.flush();
  return c.json({ message: 'SIEM queue flushed successfully' });
});

// Cost tracking endpoints
app.get('/admin/cost/summary', (c) => {
  const { userId, tenantId, provider, model, startTime, endTime } = c.req.query();
  const summary = costTracker.getCostSummary({
    userId,
    tenantId,
    provider: provider as any,
    model,
    startTime: startTime ? parseInt(startTime) : undefined,
    endTime: endTime ? parseInt(endTime) : undefined,
  });
  return c.json(summary);
});

app.get('/admin/cost/entries', (c) => {
  const { limit } = c.req.query();
  const entries = costTracker.getCostEntries(limit ? parseInt(limit) : undefined);
  return c.json({ entries });
});

app.post('/admin/cost/budget', async (c) => {
  const budget = await c.req.json();
  costTracker.addBudgetLimit(budget);
  return c.json({ message: 'Budget limit added successfully', id: budget.id });
});

app.get('/admin/cost/budgets', (c) => {
  const budgets = costTracker.getBudgetLimits();
  return c.json({ budgets });
});

app.delete('/admin/cost/budget/:id', (c) => {
  const id = c.req.param('id');
  costTracker.removeBudgetLimit(id);
  return c.json({ message: 'Budget limit removed successfully' });
});

// Analytics endpoints
app.get('/admin/analytics/usage', (c) => {
  const { metric, startTime, endTime } = c.req.query();
  if (!metric) {
    return c.json({ error: 'metric parameter required' }, 400 as any);
  }
  const data = analyticsEngine.getTimeSeries(
    metric,
    startTime ? parseInt(startTime) : undefined,
    endTime ? parseInt(endTime) : undefined
  );
  return c.json({ metric, data });
});

app.get('/admin/analytics/anomalies', (c) => {
  const { limit } = c.req.query();
  const anomalies = analyticsEngine.getAnomalies(limit ? parseInt(limit) : undefined);
  return c.json({ anomalies });
});

app.post('/admin/analytics/detect-anomalies', (c) => {
  const { metric, threshold } = c.req.query();
  if (!metric) {
    return c.json({ error: 'metric parameter required' }, 400 as any);
  }
  const anomalies = analyticsEngine.detectAnomalies(
    metric,
    threshold ? parseFloat(threshold) : undefined
  );
  return c.json({ metric, anomalies });
});

// Tenant management endpoints
app.post('/admin/tenants', async (c) => {
  const params = await c.req.json();
  try {
    const tenant = tenantManager.createTenant(params);
    return c.json({ message: 'Tenant created successfully', tenant });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400 as any);
  }
});

app.get('/admin/tenants', (c) => {
  const tenants = tenantManager.getAllTenants();
  return c.json({ tenants });
});

app.get('/admin/tenants/:id', (c) => {
  const id = c.req.param('id');
  const tenant = tenantManager.getTenant(id);
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404 as any);
  }
  return c.json(tenant);
});

app.put('/admin/tenants/:id', async (c) => {
  const id = c.req.param('id');
  const updates = await c.req.json();
  try {
    const tenant = tenantManager.updateTenant(id, updates);
    return c.json({ message: 'Tenant updated successfully', tenant });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 404 as any);
  }
});

app.delete('/admin/tenants/:id', (c) => {
  const id = c.req.param('id');
  try {
    tenantManager.deleteTenant(id);
    return c.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 404 as any);
  }
});

app.get('/admin/tenants/:id/usage', (c) => {
  const id = c.req.param('id');
  const { period } = c.req.query();
  const usage = tenantManager.getTenantUsage(id, period as any);
  return c.json({ tenantId: id, usage });
});

app.get('/admin/tenants/:id/quotas', (c) => {
  const id = c.req.param('id');
  try {
    const quotas = tenantManager.checkQuotas(id);
    return c.json({ tenantId: id, quotas });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 404 as any);
  }
});

// Main proxy endpoint - handles all AI service requests
app.all('/proxy/*', async (c) => {
  const correlationId = crypto.randomUUID();
  logger.setCorrelationId(correlationId);

  const startTime = Date.now();

  // Start OpenTelemetry span
  const span = openTelemetryTracer.startSpan('proxy.request', {
    kind: 'SERVER',
    attributes: {
      'http.method': c.req.method,
      'http.url': c.req.url,
      'correlation.id': correlationId,
    },
  });

  try {
    // Extract target URL from path
    const targetPath = c.req.path.replace('/proxy/', '');
    const targetUrl = targetPath.startsWith('http') ? targetPath : `https://${targetPath}`;

    span.setAttribute('target.url', targetUrl);

    // Build Proxilion request
    const proxilionRequest: ProxilionRequest = {
      id: correlationId,
      timestamp: Date.now(),
      method: c.req.method,
      url: targetUrl,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      body: c.req.method !== 'GET' ? await c.req.json().catch(() => undefined) : undefined,
      sourceIp: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent'),
    };

    logger.info('Received proxy request', {
      correlationId,
      method: proxilionRequest.method,
      url: targetUrl,
    });

    // Step 0: Authentication
    const authContext = await authProvider.authenticate(proxilionRequest.headers);
    if (!authContext.authenticated) {
      logger.warn('Authentication failed', { correlationId });
      return c.json(
        {
          error: 'Authentication required',
          correlationId,
        },
        401
      );
    }

    logger.info('Authentication successful', {
      correlationId,
      userId: authContext.userId,
      method: authContext.method,
    });

    // Step 0.3: Extract user identity
    const userIdentity = await identityExtractor.extractIdentity(proxilionRequest);

    logger.info('User identity extracted', {
      correlationId,
      userId: userIdentity.userId,
      email: userIdentity.email,
      organizationId: userIdentity.organizationId,
      teamId: userIdentity.teamId,
      source: userIdentity.source,
      confidence: userIdentity.confidence,
    });

    // Step 0.4: Create or update browser session (if browser-based)
    const isBrowserRequest = proxilionRequest.userAgent?.includes('Mozilla') ||
                             proxilionRequest.userAgent?.includes('Chrome') ||
                             proxilionRequest.userAgent?.includes('Safari');

    let browserSession;
    if (isBrowserRequest) {
      browserSession = await browserSessionTracker.getOrCreateSession(proxilionRequest, userIdentity);

      logger.info('Browser session tracked', {
        correlationId,
        sessionId: browserSession.sessionId,
        userId: browserSession.userId,
      });
    }

    // Step 0.5: Tenant validation (if tenantId provided)
    const tenantId = authContext.tenantId || c.req.header('x-tenant-id');
    if (tenantId) {
      const tenant = tenantManager.getTenant(tenantId);
      if (!tenant) {
        logger.warn('Tenant not found', { correlationId, tenantId });
        return c.json({ error: 'Tenant not found', correlationId }, 404);
      }

      if (!tenant.enabled) {
        logger.warn('Tenant disabled', { correlationId, tenantId });
        return c.json({ error: 'Tenant is disabled', correlationId }, 403);
      }
    }

    // Step 1: Parse the request
    const unifiedRequest = await parserRegistry.parse(proxilionRequest);

    if (!unifiedRequest) {
      // SECURITY: Never bypass scanning - reject unparseable requests
      logger.error('Unable to parse request - REJECTING for security', undefined, {
        correlationId,
        method: proxilionRequest.method,
        url: proxilionRequest.url,
      });

      metrics.counter('request.parse_failed', 1);

      // Complete span
      span.setAttributes({
        'http.status_code': 400,
        'error.type': 'parse_failure',
      });
      span.setStatus('ERROR', 'Unable to parse request');
      span.end();

      return c.json(
        {
          error: 'Invalid request format',
          message: 'Request could not be parsed for security scanning',
          correlationId,
        },
        400
      );
    }

    // Step 1.5: Rate limiting
    const rateLimitKey = `user:${proxilionRequest.sourceIp || 'unknown'}`;
    const rateLimitResult = await rateLimiter.checkLimit(rateLimitKey);

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', {
        correlationId,
        key: rateLimitKey,
        retryAfter: rateLimitResult.retryAfter,
      });

      return c.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          correlationId,
        },
        429,
        {
          'Retry-After': String(Math.ceil((rateLimitResult.retryAfter || 0) / 1000)),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        }
      );
    }

    // Step 1.6: Check cache
    const cachedResponse = await cacheManager.get(unifiedRequest);
    if (cachedResponse) {
      logger.info('Cache hit', { correlationId });
      metrics.counter('request.cache_hit', 1);

      const duration = Date.now() - startTime;
      metrics.histogram('request.duration', duration);

      return c.json(cachedResponse.body, cachedResponse.status as any, {
        ...cachedResponse.headers,
        'X-Cache': 'HIT',
        'X-Response-Time': `${duration}ms`,
      });
    }

    // Step 2: Security scanning
    const scanResult = await scannerOrchestrator.scan(unifiedRequest);

    logger.info('Security scan completed', {
      correlationId,
      threatLevel: scanResult.overallThreatLevel,
      score: scanResult.overallScore,
    });

    // Step 3: Policy evaluation
    const policyDecision = await policyEngine.evaluate(unifiedRequest, scanResult);

    logger.info('Policy decision made', {
      correlationId,
      action: policyDecision.action,
      policyId: policyDecision.policyId,
    });

    // Step 3.5: Create audit event
    const auditEvent: AuditEvent = {
      id: correlationId,
      requestId: correlationId,
      timestamp: Date.now(),
      level: LogLevel.INFO,
      type: `request.${policyDecision.action.toLowerCase()}`,
      message: `Request ${policyDecision.action.toLowerCase()}`,
      correlationId,
      eventType: `request.${policyDecision.action.toLowerCase()}`,
      action: 'proxy',
      decision: policyDecision.action,
      threatLevel: scanResult.overallThreatLevel,
      userId: authContext.userId,
      sourceIp: proxilionRequest.sourceIp,
      provider: unifiedRequest.provider,
      model: unifiedRequest.model,
      duration: Date.now() - startTime,
      findings: scanResult.findings,
      policyId: policyDecision.policyId,
      targetService: new URL(targetUrl).hostname,
    };

    // Forward to SIEM
    await siemForwarder.forward(auditEvent);

    // Trigger webhooks
    await webhookManager.trigger(auditEvent);

    // Send alerts for high-severity events
    await alertManager.alert(auditEvent);

    // Step 3.7: Track user analytics
    if (scanResult.findings.length > 0) {
      // Record security violation
      const violation = {
        id: correlationId,
        timestamp: Date.now(),
        userId: userIdentity.userId,
        email: userIdentity.email,
        teamId: userIdentity.teamId,
        organizationId: userIdentity.organizationId,
        violationType: scanResult.findings[0].type,
        threatLevel: scanResult.overallThreatLevel,
        findings: scanResult.findings,
        requestId: correlationId,
        blocked: policyDecision.action === PolicyAction.BLOCK,
        model: unifiedRequest.model,
        provider: unifiedRequest.provider,
      };

      userAnalytics.recordViolation(violation);

      logger.info('Security violation recorded for user analytics', {
        correlationId,
        userId: userIdentity.userId,
        violationType: violation.violationType,
        blocked: violation.blocked,
      });
    } else {
      // Record successful request (no violations)
      userAnalytics.recordSuccessfulRequest(userIdentity, correlationId);
    }

    // Step 3.8: Track API key usage
    const authHeader = proxilionRequest.headers['authorization'] || proxilionRequest.headers['Authorization'];
    if (authHeader) {
      const apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      const success = policyDecision.action !== PolicyAction.BLOCK;
      const cost = 0; // Would be calculated from response
      apiKeyManager.trackUsage(apiKey, success, cost);
    }

    // Step 4: Execute policy action
    switch (policyDecision.action) {
      case PolicyAction.BLOCK:
        metrics.counter('request.blocked', 1);

        // Complete span with block status
        span.setAttributes({
          'http.status_code': 403,
          'policy.action': 'BLOCK',
          'threat.level': scanResult.overallThreatLevel,
        });
        span.addEvent('request.blocked', {
          reason: policyDecision.reason || 'Security policy violation',
        });
        span.setStatus('OK'); // Not an error, just blocked by policy
        span.end();

        return c.json(
          {
            error: 'Request blocked by security policy',
            reason: policyDecision.reason,
            correlationId,
            threatLevel: scanResult.overallThreatLevel,
          },
          403
        );

      case PolicyAction.ALLOW:
        // Forward request to AI service with deduplication
        const response = await requestDeduplicator.execute(unifiedRequest, async () => {
          return await requestHandler.handleRequest(proxilionRequest);
        });

        // Check if response is streaming
        if (response.streaming && response.body instanceof ReadableStream) {
          logger.info('Handling streaming response', { correlationId });
          metrics.counter('request.streaming', 1);

          // Process stream with security scanning
          const processedStream = streamProcessor.processStream(
            response.body as ReadableStream<Uint8Array>,
            correlationId
          );

          // Return streaming response
          return new Response(processedStream, {
            status: response.status,
            headers: {
              ...response.headers,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-Proxilion-Streaming': 'true',
            },
          });
        }

        // Non-streaming response - process normally
        const processedResponse = await responseProcessor.process(response);

        // Cache the response if applicable
        if (processedResponse.response.status === 200) {
          await cacheManager.set(unifiedRequest, processedResponse.response);
        }

        const duration = Date.now() - startTime;
        metrics.histogram('request.total.duration', duration);
        metrics.counter('request.allowed', 1);

        // Track cost (estimate tokens from response)
        const responseBody = processedResponse.response.body as any;
        const inputTokens = responseBody?.usage?.prompt_tokens || 0;
        const outputTokens = responseBody?.usage?.completion_tokens || 0;

        if (inputTokens > 0 || outputTokens > 0) {
          costTracker.trackCost({
            provider: unifiedRequest.provider,
            model: unifiedRequest.model,
            inputTokens,
            outputTokens,
            userId: authContext.userId,
            tenantId,
            requestId: correlationId,
            cached: false,
          });

          // Check budget limits
          const budgetStatuses = costTracker.checkBudgetLimits(authContext.userId, tenantId);
          for (const status of budgetStatuses) {
            if (status.alertTriggered) {
              const budgetAlertEvent: AuditEvent = {
                id: `${correlationId}-budget`,
                requestId: correlationId,
                timestamp: Date.now(),
                level: LogLevel.WARN,
                type: 'budget.alert',
                message: `Budget alert: ${status.percentage.toFixed(1)}% of limit reached`,
                correlationId,
                eventType: 'budget.alert',
                action: 'alert',
                decision: PolicyAction.ALERT,
                threatLevel: ThreatLevel.MEDIUM,
                userId: authContext.userId,
                sourceIp: proxilionRequest.sourceIp,
                provider: unifiedRequest.provider,
                model: unifiedRequest.model,
                duration,
                findings: [{
                  type: 'budget',
                  severity: ThreatLevel.MEDIUM,
                  message: `Budget alert: ${status.percentage.toFixed(1)}% of limit reached`,
                  location: { path: 'cost_tracker' },
                  confidence: 1.0,
                }],
                policyId: 'budget-limit',
                targetService: new URL(targetUrl).hostname,
              };
              await alertManager.alert(budgetAlertEvent);
            }
          }
        }

        // Record analytics
        analyticsEngine.recordDataPoint('request.latency', duration);
        analyticsEngine.recordDataPoint('request.count', 1);
        if (tenantId) {
          tenantManager.recordUsage({
            tenantId,
            requests: 1,
            tokens: inputTokens + outputTokens,
            cost: 0, // Would be calculated from costTracker
            cacheHit: false,
          });
        }

        logger.info('Request completed successfully', {
          correlationId,
          duration,
          status: processedResponse.response.status,
          modified: processedResponse.modified,
          redactions: processedResponse.redactions,
          cost: inputTokens + outputTokens > 0 ? 'tracked' : 'unknown',
        });

        // Complete span successfully
        span.setAttributes({
          'http.status_code': processedResponse.response.status,
          'request.duration_ms': duration,
          'request.tokens.input': inputTokens,
          'request.tokens.output': outputTokens,
          'response.modified': processedResponse.modified,
        });
        span.setStatus('OK');
        span.end();

        return c.json(processedResponse.response.body, processedResponse.response.status as any, {
          ...processedResponse.response.headers,
          'X-Cache': 'MISS',
          'X-Response-Time': `${duration}ms`,
          'X-Content-Modified': processedResponse.modified ? 'true' : 'false',
        });

      case PolicyAction.ALERT:
        // Log alert and allow
        logger.warn('Security alert triggered', {
          correlationId,
          reason: policyDecision.reason,
          threatLevel: scanResult.overallThreatLevel,
          findings: scanResult.scanResults.flatMap((r) => r.findings),
        });

        const alertResponse = await requestDeduplicator.execute(unifiedRequest, async () => {
          return await requestHandler.handleRequest(proxilionRequest);
        });

        const processedAlertResponse = await responseProcessor.process(alertResponse);

        return c.json(
          processedAlertResponse.response.body,
          processedAlertResponse.response.status as any,
          processedAlertResponse.response.headers
        );

      case PolicyAction.MODIFY:
        // Redact sensitive data from request before forwarding
        logger.info('Modifying request to redact sensitive data', {
          correlationId,
          findingsCount: scanResult.findings.length,
        });

        // Create a modified version of the request with redacted content
        const modifiedRequest = redactSensitiveData(unifiedRequest, scanResult);

        // Convert back to ProxilionRequest format
        const modifiedProxilionRequest = {
          ...proxilionRequest,
          body: modifiedRequest,
        };

        metrics.counter('request.modified', 1);
        metrics.counter('request.redactions', scanResult.findings.length);

        // Forward the modified request
        const modifyResponse = await requestDeduplicator.execute(modifiedRequest, async () => {
          return await requestHandler.handleRequest(modifiedProxilionRequest);
        });

        const processedModifyResponse = await responseProcessor.process(modifyResponse);

        return c.json(
          processedModifyResponse.response.body,
          processedModifyResponse.response.status as any,
          processedModifyResponse.response.headers
        );

      case PolicyAction.QUEUE:
        metrics.counter('request.queued', 1);
        return c.json(
          {
            message: 'Request queued for manual review',
            correlationId,
            estimatedReviewTime: '1-2 hours',
          },
          202
        );

      default:
        logger.warn(`Unknown policy action: ${policyDecision.action}`, {
          correlationId,
        });
        return c.json(
          {
            error: 'Internal error processing request',
            correlationId,
          },
          500
        );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.counter('request.error', 1);

    logger.error('Request processing failed', error as Error, {
      correlationId,
      duration,
    });

    // Complete span with error
    span.setAttributes({
      'error': true,
      'error.type': (error as Error).name,
      'error.message': (error as Error).message,
      'request.duration_ms': duration,
    });
    span.setStatus('ERROR', (error as Error).message);
    span.end();

    if (error instanceof ProxilionError) {
      return c.json(
        {
          error: error.message,
          code: error.code,
          correlationId,
          details: error.details,
        },
        error.statusCode as any
      );
    }

    return c.json(
      {
        error: 'Internal server error',
        message: (error as Error).message,
        correlationId,
      },
      500
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Redact sensitive data from request based on scan findings
 */
function redactSensitiveData(request: UnifiedAIRequest, scanResult: AggregatedScanResult): UnifiedAIRequest {
  const redactedRequest = JSON.parse(JSON.stringify(request)) as UnifiedAIRequest;

  // Define PII patterns to redact
  const piiPatterns: Array<{ type: string; pattern: RegExp }> = [
    { type: 'Email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
    { type: 'Phone', pattern: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
    { type: 'Social Security', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
    { type: 'Credit Card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
    { type: 'IP Address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { type: 'API Key', pattern: /\b[A-Za-z0-9]{32,}\b/g },
    { type: 'AWS', pattern: /AKIA[0-9A-Z]{16}/g },
    { type: 'GitHub', pattern: /ghp_[a-zA-Z0-9]{36}/g },
  ];

  // Redact content in messages
  for (const message of redactedRequest.messages) {
    if (typeof message.content === 'string') {
      let content = message.content;

      // Apply redactions based on findings
      for (const finding of scanResult.findings) {
        for (const pattern of piiPatterns) {
          if (finding.type.toLowerCase().includes(pattern.type.toLowerCase())) {
            content = content.replace(pattern.pattern, '[REDACTED]');
          }
        }
      }

      message.content = content;
    }
  }

  return redactedRequest;
}

// ============================================================================
// TRANSPARENT PROXY MODE
// ============================================================================

// Transparent proxy mode - handles direct API calls based on Host header
// This allows Proxilion to act as a true MITM proxy when DNS is configured to route through it
app.all('*', async (c) => {
  const host = c.req.header('host');
  const path = c.req.path;

  // Check if this is a known AI API host (including browser-based UIs)
  const knownHosts = [
    // API endpoints
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'api.cohere.ai',
    'api.cohere.com',
    // Browser-based UIs
    'chat.openai.com',
    'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'bard.google.com',
  ];

  const isAIHost = knownHosts.some(knownHost => host?.includes(knownHost));

  if (!isAIHost) {
    // Not an AI API request - return 404
    return c.json(
      {
        error: 'Not found',
        message: 'Use /proxy/* to proxy requests through Proxilion, or configure DNS to route AI API traffic',
        documentation: 'https://github.com/proxilion/proxilion',
        transparentProxyMode: 'Supported hosts: ' + knownHosts.join(', '),
      },
      404
    );
  }

  // This is an AI API request in transparent proxy mode
  const correlationId = crypto.randomUUID();
  logger.setCorrelationId(correlationId);

  const startTime = Date.now();

  try {
    // Build target URL from Host header and path
    const protocol = c.req.header('x-forwarded-proto') || 'https';
    const targetUrl = `${protocol}://${host}${path}`;

    // Build Proxilion request
    const proxilionRequest: ProxilionRequest = {
      id: correlationId,
      timestamp: Date.now(),
      method: c.req.method,
      url: targetUrl,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      body: c.req.method !== 'GET' ? await c.req.json().catch(() => undefined) : undefined,
      sourceIp: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent'),
    };

    logger.info('Received transparent proxy request', {
      correlationId,
      method: proxilionRequest.method,
      url: targetUrl,
      host,
    });

    // Step 0: Authentication (optional in transparent mode - can be disabled via config)
    const authContext = await authProvider.authenticate(proxilionRequest.headers);
    if (!authContext.authenticated) {
      logger.warn('Authentication failed in transparent mode', { correlationId });
      // In transparent mode, we might want to allow unauthenticated requests
      // but still scan them. This can be configured.
      // For now, we'll proceed with scanning but log the auth failure
    }

    // Step 0.3: Extract user identity (transparent mode)
    const userIdentity = await identityExtractor.extractIdentity(proxilionRequest);

    logger.info('User identity extracted (transparent mode)', {
      correlationId,
      userId: userIdentity.userId,
      email: userIdentity.email,
      organizationId: userIdentity.organizationId,
      teamId: userIdentity.teamId,
      source: userIdentity.source,
      confidence: userIdentity.confidence,
    });

    // Step 0.4: Create or update browser session (if browser-based)
    const isBrowserRequest = proxilionRequest.userAgent?.includes('Mozilla') ||
                             proxilionRequest.userAgent?.includes('Chrome') ||
                             proxilionRequest.userAgent?.includes('Safari');

    let browserSession;
    if (isBrowserRequest) {
      browserSession = await browserSessionTracker.getOrCreateSession(proxilionRequest, userIdentity);

      logger.info('Browser session tracked (transparent mode)', {
        correlationId,
        sessionId: browserSession.sessionId,
        userId: browserSession.userId,
      });
    }

    // Step 0.5: Tenant validation (if tenantId provided)
    const tenantId = authContext.tenantId || c.req.header('x-tenant-id');
    if (tenantId) {
      const tenant = tenantManager.getTenant(tenantId);
      if (!tenant) {
        logger.warn('Tenant not found', { correlationId, tenantId });
        return c.json({ error: 'Tenant not found', correlationId }, 404);
      }

      if (!tenant.enabled) {
        logger.warn('Tenant disabled', { correlationId, tenantId });
        return c.json({ error: 'Tenant is disabled', correlationId }, 403);
      }
    }

    // Step 1: Parse the request
    const unifiedRequest = await parserRegistry.parse(proxilionRequest);

    if (!unifiedRequest) {
      // SECURITY: Never bypass scanning - reject unparseable requests even in transparent mode
      logger.error('Unable to parse request in transparent mode - REJECTING for security', undefined, {
        correlationId,
        method: proxilionRequest.method,
        url: proxilionRequest.url,
      });

      metrics.counter('request.parse_failed_transparent', 1);

      return c.json(
        {
          error: 'Invalid request format',
          message: 'Request could not be parsed for security scanning',
          correlationId,
        },
        400
      );
    }

    logger.info('Request parsed successfully', {
      correlationId,
      provider: unifiedRequest.provider,
      model: unifiedRequest.model,
    });

    // Step 2: Check rate limits
    const userId = authContext.userId || proxilionRequest.sourceIp || 'anonymous';
    const rateLimitResult = await rateLimiter.checkLimit(userId);

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', {
        correlationId,
        userId,
        retryAfter: rateLimitResult.retryAfter,
      });

      return c.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          correlationId,
        },
        429,
        {
          'Retry-After': String(Math.ceil((rateLimitResult.retryAfter || 0) / 1000)),
        }
      );
    }

    // Step 3: Check cache
    const cachedResponse = await cacheManager.get(unifiedRequest);
    if (cachedResponse) {
      logger.info('Cache hit', { correlationId });
      metrics.counter('cache.hits', 1);

      return c.json(cachedResponse.body, cachedResponse.status as any, cachedResponse.headers);
    }

    metrics.counter('cache.misses', 1);

    // Step 4: Security scanning
    const scanResult = await scannerOrchestrator.scan(unifiedRequest);

    logger.info('Security scan completed', {
      correlationId,
      threatLevel: scanResult.overallThreatLevel,
      findingsCount: scanResult.scanResults.reduce((sum, r) => sum + r.findings.length, 0),
    });

    // Step 5: Policy evaluation
    const policyDecision = await policyEngine.evaluate(unifiedRequest, scanResult);

    logger.info('Policy decision made', {
      correlationId,
      action: policyDecision.action,
      reason: policyDecision.reason,
    });

    // Step 5.5: Track user analytics (transparent mode)
    if (scanResult.findings.length > 0) {
      // Record security violation
      const violation = {
        id: correlationId,
        timestamp: Date.now(),
        userId: userIdentity.userId,
        email: userIdentity.email,
        teamId: userIdentity.teamId,
        organizationId: userIdentity.organizationId,
        violationType: scanResult.findings[0].type,
        threatLevel: scanResult.overallThreatLevel,
        findings: scanResult.findings,
        requestId: correlationId,
        blocked: policyDecision.action === PolicyAction.BLOCK,
        model: unifiedRequest.model,
        provider: unifiedRequest.provider,
      };

      userAnalytics.recordViolation(violation);

      logger.info('Security violation recorded for user analytics (transparent mode)', {
        correlationId,
        userId: userIdentity.userId,
        violationType: violation.violationType,
        blocked: violation.blocked,
      });
    } else {
      // Record successful request (no violations)
      userAnalytics.recordSuccessfulRequest(userIdentity, correlationId);
    }

    // Step 5.6: Track API key usage (transparent mode)
    const authHeader = proxilionRequest.headers['authorization'] || proxilionRequest.headers['Authorization'];
    if (authHeader) {
      const apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      const success = policyDecision.action !== PolicyAction.BLOCK;
      const cost = 0; // Would be calculated from response
      apiKeyManager.trackUsage(apiKey, success, cost);
    }

    // Step 6: Execute action based on policy decision
    switch (policyDecision.action) {
      case PolicyAction.ALLOW:
        // Forward request to AI service
        const response = await requestDeduplicator.execute(unifiedRequest, async () => {
          return await requestHandler.handleRequest(proxilionRequest);
        });

        // Check if response is streaming
        if (response.streaming && response.body instanceof ReadableStream) {
          logger.info('Handling streaming response (transparent mode)', { correlationId });
          metrics.counter('request.streaming.transparent', 1);

          // Process stream with security scanning
          const processedStream = streamProcessor.processStream(
            response.body as ReadableStream<Uint8Array>,
            correlationId
          );

          // Return streaming response
          return new Response(processedStream, {
            status: response.status,
            headers: {
              ...response.headers,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-Proxilion-Streaming': 'true',
            },
          });
        }

        // Non-streaming response - process normally
        const processedResponse = await responseProcessor.process(response);

        // Cache the response if applicable
        if (processedResponse.response.status === 200) {
          await cacheManager.set(unifiedRequest, processedResponse.response);
        }

        // Track cost - extract tokens from response body
        try {
          const responseBody = typeof processedResponse.response.body === 'string'
            ? JSON.parse(processedResponse.response.body)
            : processedResponse.response.body;

          const inputTokens = responseBody?.usage?.prompt_tokens || 0;
          const outputTokens = responseBody?.usage?.completion_tokens || 0;

          if (inputTokens || outputTokens) {
            costTracker.trackCost({
              provider: unifiedRequest.provider,
              model: unifiedRequest.model,
              inputTokens,
              outputTokens,
              requestId: correlationId,
              userId: authContext.userId,
              tenantId,
            });
          }
        } catch (error) {
          // Ignore cost tracking errors
        }

        // Send to SIEM
        const completedEvent: AuditEvent = {
          id: correlationId,
          requestId: correlationId,
          timestamp: Date.now(),
          level: LogLevel.INFO,
          type: 'request.completed',
          message: 'Request completed successfully',
          correlationId,
          eventType: 'request.completed',
          action: 'process',
          decision: policyDecision.action,
          threatLevel: scanResult.overallThreatLevel,
          userId: authContext.userId,
          sourceIp: proxilionRequest.sourceIp,
          provider: unifiedRequest.provider,
          model: unifiedRequest.model,
          duration: Date.now() - startTime,
        };
        await siemForwarder.forward(completedEvent);

        // Trigger webhooks
        await webhookManager.trigger(completedEvent);

        return c.json(
          processedResponse.response.body,
          processedResponse.response.status as any,
          processedResponse.response.headers
        );

      case PolicyAction.BLOCK:
        // Block the request
        logger.warn('Request blocked by policy', {
          correlationId,
          reason: policyDecision.reason,
        });

        // Send alert
        const blockedEvent: AuditEvent = {
          id: correlationId,
          requestId: correlationId,
          timestamp: Date.now(),
          level: LogLevel.WARN,
          type: 'request.blocked',
          message: `Request blocked: ${policyDecision.reason}`,
          correlationId,
          eventType: 'request.blocked',
          action: 'block',
          decision: PolicyAction.BLOCK,
          threatLevel: scanResult.overallThreatLevel,
          userId: authContext.userId,
          sourceIp: proxilionRequest.sourceIp,
          provider: unifiedRequest.provider,
          model: unifiedRequest.model,
          duration: Date.now() - startTime,
          findings: scanResult.findings,
          policyId: policyDecision.policyId || 'unknown',
        };
        await alertManager.alert(blockedEvent);

        return c.json(
          {
            error: 'Request blocked by security policy',
            reason: policyDecision.reason,
            correlationId,
          },
          403
        );

      case PolicyAction.ALERT:
        // Log alert and allow
        logger.warn('Security alert triggered', {
          correlationId,
          reason: policyDecision.reason,
        });

        const alertResponse = await requestDeduplicator.execute(unifiedRequest, async () => {
          return await requestHandler.handleRequest(proxilionRequest);
        });

        const processedAlertResponse = await responseProcessor.process(alertResponse);

        return c.json(
          processedAlertResponse.response.body,
          processedAlertResponse.response.status as any,
          processedAlertResponse.response.headers
        );

      default:
        throw new Error(`Unknown policy action: ${policyDecision.action}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Transparent proxy request failed', error as Error, {
      correlationId,
      duration,
    });

    return c.json(
      {
        error: 'Internal server error',
        message: (error as Error).message,
        correlationId,
      },
      500
    );
  }
});

export default app;

