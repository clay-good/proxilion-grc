/**
 * Environment Variable Validator
 * Validates and provides defaults for all environment variables
 */

import { logger } from '../utils/logger.js';

export interface ProxilionConfig {
  // Server
  port: number;
  nodeEnv: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Performance
  enableScanCaching: boolean;
  scanCacheTTL: number;
  maxCacheSize: number;
  enableEarlyTermination: boolean;
  enableHeaderOptimization: boolean;
  enableParallelScanning: boolean;

  // Connection Pooling
  maxConnections: number;
  maxIdleTime: number;
  acquireTimeout: number;

  // Rate Limiting
  rateLimitAlgorithm: 'token-bucket' | 'sliding-window';
  maxRequests: number;
  rateLimitWindow: number;
  burstSize: number;

  // Security Scanning
  scanTimeout: number;
  enablePIIScanning: boolean;
  enableComplianceScanning: boolean;
  enableDLPScanning: boolean;
  enablePromptInjectionDetection: boolean;
  enableToxicityDetection: boolean;

  // Response Processing
  enablePIIRedaction: boolean;
  enableContentFiltering: boolean;
  enableResponseValidation: boolean;

  // Audit & Compliance
  enableAuditLogging: boolean;
  auditLogRetentionDays: number;
  enableSIEMForwarding: boolean;
  siemEndpointUrl?: string;
  siemApiKey?: string;

  // Admin API
  enableAdminAuth: boolean;
  adminApiKey?: string;
  corsOrigins: string[];
  adminApiRateLimit: number;

  // GraphQL
  graphqlApiKey?: string;
  enableGraphQLIntrospection: boolean;
  enableGraphQLPlayground: boolean;

  // Observability
  enablePrometheusMetrics: boolean;
  enableOpenTelemetry: boolean;
  otelEndpoint?: string;
  otelServiceName: string;

  // Advanced Features
  enableRequestDeduplication: boolean;
  enableSemanticCaching: boolean;
  enableWorkflowOrchestration: boolean;
  enableABTesting: boolean;
  enableMultiTenancy: boolean;
  enableCostTracking: boolean;
  enableAnomalyDetection: boolean;

  // Development
  debug: boolean;
  hotReload: boolean;
  mockAIResponses: boolean;
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from environment variable
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse string array from comma-separated environment variable
 */
function parseArray(value: string | undefined, defaultValue: string[]): string[] {
  if (value === undefined || value.trim() === '') return defaultValue;
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/**
 * Validate and load environment configuration
 */
export function loadConfig(): ProxilionConfig {
  const config: ProxilionConfig = {
    // Server
    port: parseInteger(process.env.PORT, 8787),
    nodeEnv: (process.env.NODE_ENV as any) || 'development',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',

    // Performance
    enableScanCaching: parseBoolean(process.env.ENABLE_SCAN_CACHING, true),
    scanCacheTTL: parseInteger(process.env.SCAN_CACHE_TTL, 60000),
    maxCacheSize: parseInteger(process.env.MAX_CACHE_SIZE, 10000),
    enableEarlyTermination: parseBoolean(process.env.ENABLE_EARLY_TERMINATION, true),
    enableHeaderOptimization: parseBoolean(process.env.ENABLE_HEADER_OPTIMIZATION, true),
    enableParallelScanning: parseBoolean(process.env.ENABLE_PARALLEL_SCANNING, true),

    // Connection Pooling
    maxConnections: parseInteger(process.env.MAX_CONNECTIONS, 100),
    maxIdleTime: parseInteger(process.env.MAX_IDLE_TIME, 60000),
    acquireTimeout: parseInteger(process.env.ACQUIRE_TIMEOUT, 5000),

    // Rate Limiting
    rateLimitAlgorithm: (process.env.RATE_LIMIT_ALGORITHM as any) || 'token-bucket',
    maxRequests: parseInteger(process.env.MAX_REQUESTS, 100),
    rateLimitWindow: parseInteger(process.env.RATE_LIMIT_WINDOW, 60000),
    burstSize: parseInteger(process.env.BURST_SIZE, 150),

    // Security Scanning
    scanTimeout: parseInteger(process.env.SCAN_TIMEOUT, 10000),
    enablePIIScanning: parseBoolean(process.env.ENABLE_PII_SCANNING, true),
    enableComplianceScanning: parseBoolean(process.env.ENABLE_COMPLIANCE_SCANNING, true),
    enableDLPScanning: parseBoolean(process.env.ENABLE_DLP_SCANNING, true),
    enablePromptInjectionDetection: parseBoolean(process.env.ENABLE_PROMPT_INJECTION_DETECTION, true),
    enableToxicityDetection: parseBoolean(process.env.ENABLE_TOXICITY_DETECTION, true),

    // Response Processing
    enablePIIRedaction: parseBoolean(process.env.ENABLE_PII_REDACTION, true),
    enableContentFiltering: parseBoolean(process.env.ENABLE_CONTENT_FILTERING, true),
    enableResponseValidation: parseBoolean(process.env.ENABLE_RESPONSE_VALIDATION, true),

    // Audit & Compliance
    enableAuditLogging: parseBoolean(process.env.ENABLE_AUDIT_LOGGING, true),
    auditLogRetentionDays: parseInteger(process.env.AUDIT_LOG_RETENTION_DAYS, 90),
    enableSIEMForwarding: parseBoolean(process.env.ENABLE_SIEM_FORWARDING, false),
    siemEndpointUrl: process.env.SIEM_ENDPOINT_URL,
    siemApiKey: process.env.SIEM_API_KEY,

    // Admin API
    enableAdminAuth: parseBoolean(process.env.ENABLE_ADMIN_AUTH, true),
    adminApiKey: process.env.ADMIN_API_KEY,
    corsOrigins: parseArray(process.env.CORS_ORIGINS, ['*']),
    adminApiRateLimit: parseInteger(process.env.ADMIN_API_RATE_LIMIT, 100),

    // GraphQL
    graphqlApiKey: process.env.GRAPHQL_API_KEY,
    enableGraphQLIntrospection: parseBoolean(process.env.ENABLE_GRAPHQL_INTROSPECTION, false),
    enableGraphQLPlayground: parseBoolean(process.env.ENABLE_GRAPHQL_PLAYGROUND, false),

    // Observability
    enablePrometheusMetrics: parseBoolean(process.env.ENABLE_PROMETHEUS_METRICS, true),
    enableOpenTelemetry: parseBoolean(process.env.ENABLE_OPENTELEMETRY, false),
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelServiceName: process.env.OTEL_SERVICE_NAME || 'proxilion',

    // Advanced Features
    enableRequestDeduplication: parseBoolean(process.env.ENABLE_REQUEST_DEDUPLICATION, true),
    enableSemanticCaching: parseBoolean(process.env.ENABLE_SEMANTIC_CACHING, false),
    enableWorkflowOrchestration: parseBoolean(process.env.ENABLE_WORKFLOW_ORCHESTRATION, false),
    enableABTesting: parseBoolean(process.env.ENABLE_AB_TESTING, false),
    enableMultiTenancy: parseBoolean(process.env.ENABLE_MULTI_TENANCY, false),
    enableCostTracking: parseBoolean(process.env.ENABLE_COST_TRACKING, true),
    enableAnomalyDetection: parseBoolean(process.env.ENABLE_ANOMALY_DETECTION, true),

    // Development
    debug: parseBoolean(process.env.DEBUG, false),
    hotReload: parseBoolean(process.env.HOT_RELOAD, false),
    mockAIResponses: parseBoolean(process.env.MOCK_AI_RESPONSES, false),
  };

  // Validate critical configuration
  validateConfig(config);

  return config;
}

/**
 * Validate configuration
 */
function validateConfig(config: ProxilionConfig): void {
  const errors: string[] = [];

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid PORT: ${config.port}. Must be between 1 and 65535.`);
  }

  // Validate node environment
  if (!['development', 'staging', 'production'].includes(config.nodeEnv)) {
    errors.push(`Invalid NODE_ENV: ${config.nodeEnv}. Must be development, staging, or production.`);
  }

  // Validate log level
  if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    errors.push(`Invalid LOG_LEVEL: ${config.logLevel}. Must be debug, info, warn, or error.`);
  }

  // Validate admin auth in production
  if (config.nodeEnv === 'production' && config.enableAdminAuth && !config.adminApiKey) {
    errors.push('ADMIN_API_KEY is required when ENABLE_ADMIN_AUTH=true in production.');
  }

  // Validate SIEM configuration
  if (config.enableSIEMForwarding && !config.siemEndpointUrl) {
    errors.push('SIEM_ENDPOINT_URL is required when ENABLE_SIEM_FORWARDING=true.');
  }

  // Validate GraphQL configuration
  if (config.nodeEnv === 'production' && !config.graphqlApiKey) {
    logger.warn('GRAPHQL_API_KEY not set. GraphQL API will be accessible without authentication.');
  }

  // Validate OpenTelemetry configuration
  if (config.enableOpenTelemetry && !config.otelEndpoint) {
    errors.push('OTEL_EXPORTER_OTLP_ENDPOINT is required when ENABLE_OPENTELEMETRY=true.');
  }

  // Validate cache configuration
  if (config.maxCacheSize < 100) {
    errors.push(`MAX_CACHE_SIZE too small: ${config.maxCacheSize}. Minimum is 100.`);
  }

  if (config.scanCacheTTL < 1000) {
    errors.push(`SCAN_CACHE_TTL too small: ${config.scanCacheTTL}ms. Minimum is 1000ms.`);
  }

  // Validate rate limiting
  if (config.maxRequests < 1) {
    errors.push(`MAX_REQUESTS too small: ${config.maxRequests}. Minimum is 1.`);
  }

  if (config.rateLimitWindow < 1000) {
    errors.push(`RATE_LIMIT_WINDOW too small: ${config.rateLimitWindow}ms. Minimum is 1000ms.`);
  }

  // Log errors and exit if critical
  if (errors.length > 0) {
    logger.error('Configuration validation failed:');
    errors.forEach(error => logger.error(`  - ${error}`));
    throw new Error('Invalid configuration. Please check your environment variables.');
  }

  // Log warnings for production
  if (config.nodeEnv === 'production') {
    if (!config.enableAdminAuth) {
      logger.warn('⚠️  Admin API authentication is DISABLED in production. This is not recommended.');
    }

    if (config.corsOrigins.includes('*')) {
      logger.warn('⚠️  CORS is set to allow all origins (*) in production. This is not recommended.');
    }

    if (config.enableGraphQLIntrospection) {
      logger.warn('⚠️  GraphQL introspection is ENABLED in production. This may expose schema details.');
    }

    if (config.enableGraphQLPlayground) {
      logger.warn('⚠️  GraphQL playground is ENABLED in production. This should be disabled.');
    }
  }

  // Log configuration summary
  logger.info('Configuration loaded successfully:');
  logger.info(`  Environment: ${config.nodeEnv}`);
  logger.info(`  Port: ${config.port}`);
  logger.info(`  Log Level: ${config.logLevel}`);
  logger.info(`  Scan Caching: ${config.enableScanCaching ? 'enabled' : 'disabled'}`);
  logger.info(`  Parallel Scanning: ${config.enableParallelScanning ? 'enabled' : 'disabled'}`);
  logger.info(`  Admin Auth: ${config.enableAdminAuth ? 'enabled' : 'disabled'}`);
  logger.info(`  Audit Logging: ${config.enableAuditLogging ? 'enabled' : 'disabled'}`);
}

/**
 * Get configuration value
 */
export function getConfig(): ProxilionConfig {
  return loadConfig();
}

