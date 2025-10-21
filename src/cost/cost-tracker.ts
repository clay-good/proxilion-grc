/**
 * Cost Tracker
 * 
 * Tracks AI API usage costs with:
 * - Per-model pricing
 * - Token-based cost calculation
 * - Budget limits and alerts
 * - Cost aggregation by user/tenant/model
 * - Historical cost data
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { AIProvider, AIServiceProvider } from '../types/index.js';

export interface ModelPricing {
  provider: AIProvider;
  model: string;
  inputTokenPrice: number;  // Price per 1M tokens
  outputTokenPrice: number; // Price per 1M tokens
  imagePrice?: number;      // Price per image
  audioPrice?: number;      // Price per second
}

export interface CostEntry {
  id: string;
  timestamp: number;
  provider: AIProvider;
  model: string;
  userId?: string;
  tenantId?: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  requestId: string;
  cached: boolean;
}

export interface BudgetLimit {
  id: string;
  name: string;
  scope: 'user' | 'tenant' | 'global';
  scopeId?: string;
  limit: number;           // Dollar amount
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  alertThreshold: number;  // Percentage (e.g., 80 = 80%)
  enabled: boolean;
}

export interface BudgetStatus {
  limitId: string;
  current: number;
  limit: number;
  percentage: number;
  exceeded: boolean;
  alertTriggered: boolean;
}

export class CostTracker {
  private logger: Logger;
  private metrics: MetricsCollector;
  private costEntries: CostEntry[];
  private budgetLimits: Map<string, BudgetLimit>;
  private pricing: Map<string, ModelPricing>;
  private maxEntries: number;

  constructor(maxEntries: number = 100000) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.costEntries = [];
    this.budgetLimits = new Map();
    this.pricing = new Map();
    this.maxEntries = maxEntries;

    this.initializeDefaultPricing();
  }

  /**
   * Initialize default pricing for common models
   */
  private initializeDefaultPricing(): void {
    // OpenAI pricing (as of 2024)
    this.addPricing({
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4',
      inputTokenPrice: 30.0,
      outputTokenPrice: 60.0,
    });

    this.addPricing({
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-4-turbo',
      inputTokenPrice: 10.0,
      outputTokenPrice: 30.0,
    });

    this.addPricing({
      provider: AIServiceProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      inputTokenPrice: 0.5,
      outputTokenPrice: 1.5,
    });

    // Anthropic pricing
    this.addPricing({
      provider: AIServiceProvider.ANTHROPIC,
      model: 'claude-3-opus',
      inputTokenPrice: 15.0,
      outputTokenPrice: 75.0,
    });

    this.addPricing({
      provider: AIServiceProvider.ANTHROPIC,
      model: 'claude-3-sonnet',
      inputTokenPrice: 3.0,
      outputTokenPrice: 15.0,
    });

    this.addPricing({
      provider: AIServiceProvider.ANTHROPIC,
      model: 'claude-3-haiku',
      inputTokenPrice: 0.25,
      outputTokenPrice: 1.25,
    });

    // Google pricing
    this.addPricing({
      provider: AIServiceProvider.GOOGLE,
      model: 'gemini-pro',
      inputTokenPrice: 0.5,
      outputTokenPrice: 1.5,
    });

    this.addPricing({
      provider: AIServiceProvider.GOOGLE,
      model: 'gemini-1.5-pro',
      inputTokenPrice: 3.5,
      outputTokenPrice: 10.5,
    });

    // Cohere pricing
    this.addPricing({
      provider: AIServiceProvider.COHERE,
      model: 'command-r-plus',
      inputTokenPrice: 3.0,
      outputTokenPrice: 15.0,
    });

    this.addPricing({
      provider: AIServiceProvider.COHERE,
      model: 'command-r',
      inputTokenPrice: 0.5,
      outputTokenPrice: 1.5,
    });
  }

  /**
   * Add or update model pricing
   */
  addPricing(pricing: ModelPricing): void {
    const key = `${pricing.provider}:${pricing.model}`;
    this.pricing.set(key, pricing);
    this.logger.info('Added pricing', { provider: pricing.provider, model: pricing.model });
  }

  /**
   * Track cost for a request
   */
  trackCost(params: {
    provider: AIProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    userId?: string;
    tenantId?: string;
    requestId: string;
    cached?: boolean;
  }): CostEntry {
    const pricing = this.getPricing(params.provider, params.model);

    if (!pricing) {
      this.logger.warn('No pricing found for model', {
        provider: params.provider,
        model: params.model,
      });
      // Return zero cost entry
      const entry: CostEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        provider: params.provider,
        model: params.model,
        userId: params.userId,
        tenantId: params.tenantId,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        requestId: params.requestId,
        cached: params.cached || false,
      };
      return entry;
    }

    // Calculate costs (pricing is per 1M tokens)
    const inputCost = (params.inputTokens / 1_000_000) * pricing.inputTokenPrice;
    const outputCost = (params.outputTokens / 1_000_000) * pricing.outputTokenPrice;
    const totalCost = inputCost + outputCost;

    const entry: CostEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      provider: params.provider,
      model: params.model,
      userId: params.userId,
      tenantId: params.tenantId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      inputCost,
      outputCost,
      totalCost,
      requestId: params.requestId,
      cached: params.cached || false,
    };

    // Store entry
    this.costEntries.push(entry);

    // Trim old entries if needed
    if (this.costEntries.length > this.maxEntries) {
      this.costEntries = this.costEntries.slice(-this.maxEntries);
    }

    // Update metrics
    this.metrics.counter('cost_total_dollars', totalCost);
    this.metrics.counter('cost_requests_total', 1);
    this.metrics.histogram('cost_per_request_dollars', totalCost);

    this.logger.debug('Cost tracked', {
      requestId: params.requestId,
      model: params.model,
      totalCost: totalCost.toFixed(4),
    });

    return entry;
  }

  /**
   * Get pricing for a model
   */
  private getPricing(provider: AIProvider, model: string): ModelPricing | undefined {
    const key = `${provider}:${model}`;
    return this.pricing.get(key);
  }

  /**
   * Add budget limit
   */
  addBudgetLimit(limit: BudgetLimit): void {
    this.budgetLimits.set(limit.id, limit);
    this.logger.info('Budget limit added', {
      id: limit.id,
      scope: limit.scope,
      limit: limit.limit,
      period: limit.period,
    });
  }

  /**
   * Remove budget limit
   */
  removeBudgetLimit(limitId: string): void {
    this.budgetLimits.delete(limitId);
    this.logger.info('Budget limit removed', { id: limitId });
  }

  /**
   * Check budget limits
   */
  checkBudgetLimits(userId?: string, tenantId?: string): BudgetStatus[] {
    const statuses: BudgetStatus[] = [];

    for (const limit of this.budgetLimits.values()) {
      if (!limit.enabled) {
        continue;
      }

      // Check if limit applies to this request
      if (limit.scope === 'user' && limit.scopeId !== userId) {
        continue;
      }
      if (limit.scope === 'tenant' && limit.scopeId !== tenantId) {
        continue;
      }

      const current = this.calculateCurrentSpend(limit);
      const percentage = (current / limit.limit) * 100;
      const exceeded = current >= limit.limit;
      const alertTriggered = percentage >= limit.alertThreshold;

      const status: BudgetStatus = {
        limitId: limit.id,
        current,
        limit: limit.limit,
        percentage,
        exceeded,
        alertTriggered,
      };

      statuses.push(status);

      if (exceeded) {
        this.logger.warn('Budget limit exceeded', {
          limitId: limit.id,
          current,
          limit: limit.limit,
        });
        this.metrics.increment('budget_exceeded_total');
      } else if (alertTriggered) {
        this.logger.warn('Budget alert threshold reached', {
          limitId: limit.id,
          current,
          limit: limit.limit,
          percentage,
        });
        this.metrics.increment('budget_alert_total');
      }
    }

    return statuses;
  }

  /**
   * Calculate current spend for a budget limit
   */
  private calculateCurrentSpend(limit: BudgetLimit): number {
    const now = Date.now();
    const periodStart = this.getPeriodStart(limit.period, now);

    let total = 0;

    for (const entry of this.costEntries) {
      if (entry.timestamp < periodStart) {
        continue;
      }

      // Filter by scope
      if (limit.scope === 'user' && entry.userId !== limit.scopeId) {
        continue;
      }
      if (limit.scope === 'tenant' && entry.tenantId !== limit.scopeId) {
        continue;
      }

      total += entry.totalCost;
    }

    return total;
  }

  /**
   * Get period start timestamp
   */
  private getPeriodStart(period: BudgetLimit['period'], now: number): number {
    const date = new Date(now);

    switch (period) {
      case 'hourly':
        date.setMinutes(0, 0, 0);
        return date.getTime();

      case 'daily':
        date.setHours(0, 0, 0, 0);
        return date.getTime();

      case 'weekly':
        const day = date.getDay();
        date.setDate(date.getDate() - day);
        date.setHours(0, 0, 0, 0);
        return date.getTime();

      case 'monthly':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date.getTime();

      default:
        return now;
    }
  }

  /**
   * Get cost summary
   */
  getCostSummary(params?: {
    userId?: string;
    tenantId?: string;
    provider?: AIProvider;
    model?: string;
    startTime?: number;
    endTime?: number;
  }): {
    totalCost: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    averageCostPerRequest: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
  } {
    let filteredEntries = this.costEntries;

    // Apply filters
    if (params?.userId) {
      filteredEntries = filteredEntries.filter((e) => e.userId === params.userId);
    }
    if (params?.tenantId) {
      filteredEntries = filteredEntries.filter((e) => e.tenantId === params.tenantId);
    }
    if (params?.provider) {
      filteredEntries = filteredEntries.filter((e) => e.provider === params.provider);
    }
    if (params?.model) {
      filteredEntries = filteredEntries.filter((e) => e.model === params.model);
    }
    if (params?.startTime) {
      filteredEntries = filteredEntries.filter((e) => e.timestamp >= params.startTime!);
    }
    if (params?.endTime) {
      filteredEntries = filteredEntries.filter((e) => e.timestamp <= params.endTime!);
    }

    // Calculate totals
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const byProvider: Record<string, number> = {};
    const byModel: Record<string, number> = {};

    for (const entry of filteredEntries) {
      totalCost += entry.totalCost;
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;

      byProvider[entry.provider] = (byProvider[entry.provider] || 0) + entry.totalCost;
      byModel[entry.model] = (byModel[entry.model] || 0) + entry.totalCost;
    }

    return {
      totalCost,
      totalRequests: filteredEntries.length,
      totalInputTokens,
      totalOutputTokens,
      averageCostPerRequest: filteredEntries.length > 0 ? totalCost / filteredEntries.length : 0,
      byProvider,
      byModel,
    };
  }

  /**
   * Get all cost entries
   */
  getCostEntries(limit?: number): CostEntry[] {
    if (limit) {
      return this.costEntries.slice(-limit);
    }
    return [...this.costEntries];
  }

  /**
   * Get all budget limits
   */
  getBudgetLimits(): BudgetLimit[] {
    return Array.from(this.budgetLimits.values());
  }

  /**
   * Clear old cost entries
   */
  clearOldEntries(olderThan: number): number {
    const before = this.costEntries.length;
    this.costEntries = this.costEntries.filter((e) => e.timestamp >= olderThan);
    const removed = before - this.costEntries.length;

    if (removed > 0) {
      this.logger.info('Cleared old cost entries', { removed });
    }

    return removed;
  }
}

