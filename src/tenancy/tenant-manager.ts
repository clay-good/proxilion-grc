/**
 * Tenant Manager
 * 
 * Manages multi-tenancy with:
 * - Tenant isolation
 * - Per-tenant policies
 * - Per-tenant quotas and limits
 * - Tenant-specific configuration
 * - Usage tracking per tenant
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { Policy } from '../policy/policy-engine.js';

export interface Tenant {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  metadata: Record<string, any>;
  
  // Configuration
  config: TenantConfig;
  
  // Quotas
  quotas: TenantQuotas;
  
  // Policies
  policyIds: string[];
}

export interface TenantConfig {
  // Security settings
  enablePIIDetection: boolean;
  enableInjectionDetection: boolean;
  enableResponseRedaction: boolean;
  
  // Performance settings
  enableCaching: boolean;
  enableDeduplication: boolean;
  cacheMaxAge: number;
  
  // Rate limiting
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
  
  // Cost management
  budgetLimit?: {
    amount: number;
    period: 'daily' | 'weekly' | 'monthly';
  };
  
  // Allowed providers
  allowedProviders: string[];
  allowedModels: string[];
  
  // Webhooks
  webhookUrl?: string;
  webhookSecret?: string;
  
  // Custom settings
  custom: Record<string, any>;
}

export interface TenantQuotas {
  // Request quotas
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  maxRequestsPerMonth: number;
  
  // Token quotas
  maxTokensPerRequest: number;
  maxTokensPerDay: number;
  
  // Cost quotas
  maxCostPerDay: number;
  maxCostPerMonth: number;
  
  // Storage quotas
  maxCacheSize: number;
  maxAuditLogRetention: number; // days
}

export interface TenantUsage {
  tenantId: string;
  period: 'hour' | 'day' | 'month';
  requests: number;
  tokens: number;
  cost: number;
  cacheHits: number;
  cacheMisses: number;
  blockedRequests: number;
  errors: number;
  timestamp: number;
}

export interface QuotaStatus {
  quotaType: string;
  current: number;
  limit: number;
  percentage: number;
  exceeded: boolean;
}

export class TenantManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  private tenants: Map<string, Tenant>;
  private usage: Map<string, TenantUsage[]>;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.tenants = new Map();
    this.usage = new Map();
  }

  /**
   * Create a new tenant
   */
  createTenant(params: {
    id: string;
    name: string;
    config?: Partial<TenantConfig>;
    quotas?: Partial<TenantQuotas>;
    metadata?: Record<string, any>;
  }): Tenant {
    if (this.tenants.has(params.id)) {
      throw new Error(`Tenant already exists: ${params.id}`);
    }

    const tenant: Tenant = {
      id: params.id,
      name: params.name,
      enabled: true,
      createdAt: Date.now(),
      metadata: params.metadata || {},
      config: this.getDefaultConfig(params.config),
      quotas: this.getDefaultQuotas(params.quotas),
      policyIds: [],
    };

    this.tenants.set(tenant.id, tenant);
    this.logger.info('Tenant created', { tenantId: tenant.id, name: tenant.name });
    this.metrics.increment('tenant_created_total');

    return tenant;
  }

  /**
   * Get default tenant configuration
   */
  private getDefaultConfig(overrides?: Partial<TenantConfig>): TenantConfig {
    return {
      enablePIIDetection: true,
      enableInjectionDetection: true,
      enableResponseRedaction: true,
      enableCaching: true,
      enableDeduplication: true,
      cacheMaxAge: 300000, // 5 minutes
      rateLimit: {
        enabled: true,
        maxRequests: 1000,
        windowMs: 60000, // 1 minute
      },
      allowedProviders: ['openai', 'anthropic', 'google', 'cohere'],
      allowedModels: [],
      custom: {},
      ...overrides,
    };
  }

  /**
   * Get default tenant quotas
   */
  private getDefaultQuotas(overrides?: Partial<TenantQuotas>): TenantQuotas {
    return {
      maxRequestsPerHour: 10000,
      maxRequestsPerDay: 100000,
      maxRequestsPerMonth: 2000000,
      maxTokensPerRequest: 100000,
      maxTokensPerDay: 10000000,
      maxCostPerDay: 1000,
      maxCostPerMonth: 20000,
      maxCacheSize: 1024 * 1024 * 1024, // 1GB
      maxAuditLogRetention: 90,
      ...overrides,
    };
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Update tenant
   */
  updateTenant(
    tenantId: string,
    updates: {
      name?: string;
      enabled?: boolean;
      config?: Partial<TenantConfig>;
      quotas?: Partial<TenantQuotas>;
      metadata?: Record<string, any>;
    }
  ): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (updates.name) tenant.name = updates.name;
    if (updates.enabled !== undefined) tenant.enabled = updates.enabled;
    if (updates.config) tenant.config = { ...tenant.config, ...updates.config };
    if (updates.quotas) tenant.quotas = { ...tenant.quotas, ...updates.quotas };
    if (updates.metadata) tenant.metadata = { ...tenant.metadata, ...updates.metadata };

    this.tenants.set(tenantId, tenant);
    this.logger.info('Tenant updated', { tenantId });

    return tenant;
  }

  /**
   * Delete tenant
   */
  deleteTenant(tenantId: string): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    this.tenants.delete(tenantId);
    this.usage.delete(tenantId);

    this.logger.info('Tenant deleted', { tenantId });
    this.metrics.increment('tenant_deleted_total');
  }

  /**
   * Record tenant usage
   */
  recordUsage(params: {
    tenantId: string;
    requests?: number;
    tokens?: number;
    cost?: number;
    cacheHit?: boolean;
    blocked?: boolean;
    error?: boolean;
  }): void {
    const tenant = this.tenants.get(params.tenantId);
    if (!tenant) {
      this.logger.warn('Usage recorded for unknown tenant', { tenantId: params.tenantId });
      return;
    }

    const now = Date.now();
    const periods: Array<'hour' | 'day' | 'month'> = ['hour', 'day', 'month'];

    for (const period of periods) {
      const usage = this.getOrCreateUsage(params.tenantId, period, now);

      if (params.requests) usage.requests += params.requests;
      if (params.tokens) usage.tokens += params.tokens;
      if (params.cost) usage.cost += params.cost;
      if (params.cacheHit) usage.cacheHits++;
      if (params.cacheHit === false) usage.cacheMisses++;
      if (params.blocked) usage.blockedRequests++;
      if (params.error) usage.errors++;
    }
  }

  /**
   * Get or create usage record for period
   */
  private getOrCreateUsage(tenantId: string, period: 'hour' | 'day' | 'month', now: number): TenantUsage {
    const usageList = this.usage.get(tenantId) || [];
    const periodStart = this.getPeriodStart(period, now);

    // Find existing usage for this period
    let usage = usageList.find((u) => u.period === period && u.timestamp === periodStart);

    if (!usage) {
      usage = {
        tenantId,
        period,
        requests: 0,
        tokens: 0,
        cost: 0,
        cacheHits: 0,
        cacheMisses: 0,
        blockedRequests: 0,
        errors: 0,
        timestamp: periodStart,
      };
      usageList.push(usage);
      this.usage.set(tenantId, usageList);
    }

    return usage;
  }

  /**
   * Get period start timestamp
   */
  private getPeriodStart(period: 'hour' | 'day' | 'month', now: number): number {
    const date = new Date(now);

    switch (period) {
      case 'hour':
        date.setMinutes(0, 0, 0);
        return date.getTime();

      case 'day':
        date.setHours(0, 0, 0, 0);
        return date.getTime();

      case 'month':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }
  }

  /**
   * Check tenant quotas
   */
  checkQuotas(tenantId: string): QuotaStatus[] {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const statuses: QuotaStatus[] = [];
    const usageList = this.usage.get(tenantId) || [];

    // Get current usage
    const hourUsage = usageList.find((u) => u.period === 'hour' && u.timestamp === this.getPeriodStart('hour', Date.now()));
    const dayUsage = usageList.find((u) => u.period === 'day' && u.timestamp === this.getPeriodStart('day', Date.now()));
    const monthUsage = usageList.find((u) => u.period === 'month' && u.timestamp === this.getPeriodStart('month', Date.now()));

    // Check hourly request quota
    if (hourUsage) {
      statuses.push(this.createQuotaStatus(
        'Requests per hour',
        hourUsage.requests,
        tenant.quotas.maxRequestsPerHour
      ));
    }

    // Check daily request quota
    if (dayUsage) {
      statuses.push(this.createQuotaStatus(
        'Requests per day',
        dayUsage.requests,
        tenant.quotas.maxRequestsPerDay
      ));

      statuses.push(this.createQuotaStatus(
        'Tokens per day',
        dayUsage.tokens,
        tenant.quotas.maxTokensPerDay
      ));

      statuses.push(this.createQuotaStatus(
        'Cost per day',
        dayUsage.cost,
        tenant.quotas.maxCostPerDay
      ));
    }

    // Check monthly quotas
    if (monthUsage) {
      statuses.push(this.createQuotaStatus(
        'Requests per month',
        monthUsage.requests,
        tenant.quotas.maxRequestsPerMonth
      ));

      statuses.push(this.createQuotaStatus(
        'Cost per month',
        monthUsage.cost,
        tenant.quotas.maxCostPerMonth
      ));
    }

    return statuses;
  }

  /**
   * Create quota status
   */
  private createQuotaStatus(quotaType: string, current: number, limit: number): QuotaStatus {
    const percentage = (current / limit) * 100;
    const exceeded = current >= limit;

    return {
      quotaType,
      current,
      limit,
      percentage,
      exceeded,
    };
  }

  /**
   * Get tenant usage
   */
  getTenantUsage(tenantId: string, period?: 'hour' | 'day' | 'month'): TenantUsage[] {
    const usageList = this.usage.get(tenantId) || [];

    if (period) {
      return usageList.filter((u) => u.period === period);
    }

    return usageList;
  }

  /**
   * Get all tenants
   */
  getAllTenants(): Tenant[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Validate tenant access
   */
  validateAccess(tenantId: string, provider: string, model: string): {
    allowed: boolean;
    reason?: string;
  } {
    const tenant = this.tenants.get(tenantId);

    if (!tenant) {
      return { allowed: false, reason: 'Tenant not found' };
    }

    if (!tenant.enabled) {
      return { allowed: false, reason: 'Tenant is disabled' };
    }

    // Check provider
    if (tenant.config.allowedProviders.length > 0 && !tenant.config.allowedProviders.includes(provider)) {
      return { allowed: false, reason: `Provider ${provider} not allowed for this tenant` };
    }

    // Check model
    if (tenant.config.allowedModels.length > 0 && !tenant.config.allowedModels.includes(model)) {
      return { allowed: false, reason: `Model ${model} not allowed for this tenant` };
    }

    // Check quotas
    const quotaStatuses = this.checkQuotas(tenantId);
    const exceededQuota = quotaStatuses.find((q) => q.exceeded);

    if (exceededQuota) {
      return { allowed: false, reason: `Quota exceeded: ${exceededQuota.quotaType}` };
    }

    return { allowed: true };
  }
}

