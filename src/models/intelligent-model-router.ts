/**
 * Intelligent Model Router
 * 
 * Routes requests to optimal AI models based on cost, latency, capabilities,
 * quality requirements, and provider health.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { ModelRegistry, ModelMetadata, ModelCapability } from './model-registry.js';
import { ProviderHealthMonitor } from './provider-health-monitor.js';

export type RoutingStrategy = 
  | 'cost-optimized'      // Minimize cost
  | 'latency-optimized'   // Minimize latency
  | 'quality-optimized'   // Maximize quality
  | 'balanced'            // Balance cost, latency, quality
  | 'availability-first'; // Prioritize availability

export interface RoutingRequirements {
  capabilities: ModelCapability[];  // Required capabilities
  maxCost?: number;                 // Maximum cost per request (USD)
  maxLatency?: number;              // Maximum acceptable latency (ms)
  minQuality?: number;              // Minimum quality score (0-1)
  preferredProviders?: string[];    // Preferred providers
  excludedProviders?: string[];     // Excluded providers
  preferredModels?: string[];       // Preferred models
  excludedModels?: string[];        // Excluded models
  requireAvailable?: boolean;       // Only route to available models
}

export interface RoutingDecision {
  model: ModelMetadata;
  score: number;                    // Routing score (0-1)
  reason: string;                   // Reason for selection
  alternatives: ModelMetadata[];    // Alternative models
  estimatedCost: number;            // Estimated cost (USD)
  estimatedLatency: number;         // Estimated latency (ms)
  timestamp: number;
}

export interface ModelRouterConfig {
  strategy: RoutingStrategy;
  enableHealthChecks: boolean;
  costWeight: number;               // Weight for cost (0-1)
  latencyWeight: number;            // Weight for latency (0-1)
  qualityWeight: number;            // Weight for quality (0-1)
  availabilityWeight: number;       // Weight for availability (0-1)
  maxAlternatives: number;          // Max alternative models to return
}

export class IntelligentModelRouter {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<ModelRouterConfig>;
  private modelRegistry: ModelRegistry;
  private healthMonitor: ProviderHealthMonitor;

  constructor(
    modelRegistry: ModelRegistry,
    healthMonitor: ProviderHealthMonitor,
    config?: Partial<ModelRouterConfig>
  ) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.modelRegistry = modelRegistry;
    this.healthMonitor = healthMonitor;
    
    this.config = {
      strategy: config?.strategy ?? 'balanced',
      enableHealthChecks: config?.enableHealthChecks ?? true,
      costWeight: config?.costWeight ?? 0.3,
      latencyWeight: config?.latencyWeight ?? 0.3,
      qualityWeight: config?.qualityWeight ?? 0.2,
      availabilityWeight: config?.availabilityWeight ?? 0.2,
      maxAlternatives: config?.maxAlternatives ?? 3,
    };

    this.logger.info('Initialized intelligent model router', { 
      strategy: this.config.strategy 
    });
  }

  /**
   * Route a request to the optimal model
   */
  async route(requirements: RoutingRequirements): Promise<RoutingDecision | null> {
    const startTime = Date.now();

    // Get candidate models
    const candidates = this.getCandidateModels(requirements);

    if (candidates.length === 0) {
      this.logger.warn('No candidate models found', { requirements });
      this.metrics.increment('model_router_no_candidates_total');
      return null;
    }

    // Score each candidate
    const scoredCandidates = candidates.map(model => ({
      model,
      score: this.scoreModel(model, requirements),
    }));

    // Sort by score (descending)
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Select best model
    const best = scoredCandidates[0];
    const alternatives = scoredCandidates
      .slice(1, this.config.maxAlternatives + 1)
      .map(c => c.model);

    const decision: RoutingDecision = {
      model: best.model,
      score: best.score,
      reason: this.getRoutingReason(best.model, requirements),
      alternatives,
      estimatedCost: this.estimateCost(best.model, 1000), // Estimate for 1K tokens
      estimatedLatency: best.model.performance.averageLatency,
      timestamp: Date.now(),
    };

    const duration = Date.now() - startTime;
    this.metrics.histogram('model_router_decision_duration_ms', duration);
    this.metrics.increment('model_router_decisions_total', 1, {
      model: best.model.id,
      provider: best.model.provider,
      strategy: this.config.strategy,
    });

    this.logger.info('Routed request to model', {
      model: best.model.id,
      provider: best.model.provider,
      score: best.score,
      duration,
    });

    return decision;
  }

  /**
   * Get candidate models that meet requirements
   */
  private getCandidateModels(requirements: RoutingRequirements): ModelMetadata[] {
    let candidates = this.modelRegistry.getAvailableModels();

    // Filter by capabilities
    if (requirements.capabilities.length > 0) {
      candidates = candidates.filter(model =>
        requirements.capabilities.every(cap => model.capabilities.includes(cap))
      );
    }

    // Filter by preferred providers
    if (requirements.preferredProviders && requirements.preferredProviders.length > 0) {
      candidates = candidates.filter(model =>
        requirements.preferredProviders!.includes(model.provider)
      );
    }

    // Filter by excluded providers
    if (requirements.excludedProviders && requirements.excludedProviders.length > 0) {
      candidates = candidates.filter(model =>
        !requirements.excludedProviders!.includes(model.provider)
      );
    }

    // Filter by preferred models
    if (requirements.preferredModels && requirements.preferredModels.length > 0) {
      candidates = candidates.filter(model =>
        requirements.preferredModels!.includes(model.id)
      );
    }

    // Filter by excluded models
    if (requirements.excludedModels && requirements.excludedModels.length > 0) {
      candidates = candidates.filter(model =>
        !requirements.excludedModels!.includes(model.id)
      );
    }

    // Filter by availability
    if (requirements.requireAvailable !== false && this.config.enableHealthChecks) {
      candidates = candidates.filter(model =>
        this.healthMonitor.isProviderAvailable(model.provider)
      );
    }

    // Filter by max cost
    if (requirements.maxCost !== undefined) {
      candidates = candidates.filter(model => {
        const estimatedCost = this.estimateCost(model, 1000);
        return estimatedCost <= requirements.maxCost!;
      });
    }

    // Filter by max latency
    if (requirements.maxLatency !== undefined) {
      candidates = candidates.filter(model =>
        model.performance.averageLatency <= requirements.maxLatency!
      );
    }

    return candidates;
  }

  /**
   * Score a model based on routing strategy and requirements
   */
  private scoreModel(model: ModelMetadata, requirements: RoutingRequirements): number {
    let score = 0;

    // Cost score (lower is better)
    const costScore = this.calculateCostScore(model);
    score += costScore * this.config.costWeight;

    // Latency score (lower is better)
    const latencyScore = this.calculateLatencyScore(model);
    score += latencyScore * this.config.latencyWeight;

    // Quality score (higher is better)
    const qualityScore = this.calculateQualityScore(model);
    score += qualityScore * this.config.qualityWeight;

    // Availability score (higher is better)
    const availabilityScore = this.calculateAvailabilityScore(model);
    score += availabilityScore * this.config.availabilityWeight;

    // Apply strategy-specific adjustments
    score = this.applyStrategyAdjustments(score, model, requirements);

    return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
  }

  /**
   * Calculate cost score (0-1, higher is better/cheaper)
   */
  private calculateCostScore(model: ModelMetadata): number {
    // Normalize cost (assuming max cost of $100 per 1M tokens)
    const avgCost = (model.pricing.inputTokenPrice + model.pricing.outputTokenPrice) / 2;
    const normalizedCost = Math.min(avgCost / 100, 1);
    return 1 - normalizedCost; // Invert so lower cost = higher score
  }

  /**
   * Calculate latency score (0-1, higher is better/faster)
   */
  private calculateLatencyScore(model: ModelMetadata): number {
    // Normalize latency (assuming max latency of 5000ms)
    const normalizedLatency = Math.min(model.performance.averageLatency / 5000, 1);
    return 1 - normalizedLatency; // Invert so lower latency = higher score
  }

  /**
   * Calculate quality score (0-1, higher is better)
   */
  private calculateQualityScore(model: ModelMetadata): number {
    // Quality based on tier and success rate
    const tierScores: Record<string, number> = {
      free: 0.5,
      standard: 0.7,
      premium: 0.9,
      enterprise: 1.0,
    };

    const tierScore = tierScores[model.tier] || 0.5;
    const successScore = model.performance.successRate;

    return (tierScore + successScore) / 2;
  }

  /**
   * Calculate availability score (0-1, higher is better)
   */
  private calculateAvailabilityScore(model: ModelMetadata): number {
    if (!this.config.enableHealthChecks) {
      return 1.0;
    }

    const health = this.healthMonitor.getProviderHealth(model.provider);
    if (!health) {
      return 0.5; // Unknown health
    }

    return health.availability;
  }

  /**
   * Apply strategy-specific score adjustments
   */
  private applyStrategyAdjustments(
    score: number,
    model: ModelMetadata,
    requirements: RoutingRequirements
  ): number {
    switch (this.config.strategy) {
      case 'cost-optimized':
        // Heavily favor cost
        return score * 0.3 + this.calculateCostScore(model) * 0.7;

      case 'latency-optimized':
        // Heavily favor latency
        return score * 0.3 + this.calculateLatencyScore(model) * 0.7;

      case 'quality-optimized':
        // Heavily favor quality
        return score * 0.3 + this.calculateQualityScore(model) * 0.7;

      case 'availability-first':
        // Heavily favor availability
        return score * 0.3 + this.calculateAvailabilityScore(model) * 0.7;

      case 'balanced':
      default:
        return score;
    }
  }

  /**
   * Estimate cost for a request
   */
  private estimateCost(model: ModelMetadata, tokens: number): number {
    const inputCost = (tokens * model.pricing.inputTokenPrice) / model.pricing.billingUnit;
    const outputCost = (tokens * model.pricing.outputTokenPrice) / model.pricing.billingUnit;
    return inputCost + outputCost;
  }

  /**
   * Get human-readable routing reason
   */
  private getRoutingReason(model: ModelMetadata, requirements: RoutingRequirements): string {
    const reasons: string[] = [];

    switch (this.config.strategy) {
      case 'cost-optimized':
        reasons.push('Cost-optimized routing');
        break;
      case 'latency-optimized':
        reasons.push('Latency-optimized routing');
        break;
      case 'quality-optimized':
        reasons.push('Quality-optimized routing');
        break;
      case 'availability-first':
        reasons.push('Availability-first routing');
        break;
      case 'balanced':
        reasons.push('Balanced routing');
        break;
    }

    if (requirements.capabilities.length > 0) {
      reasons.push(`Supports: ${requirements.capabilities.join(', ')}`);
    }

    const health = this.healthMonitor.getProviderHealth(model.provider);
    if (health) {
      reasons.push(`Provider ${health.status} (${(health.availability * 100).toFixed(1)}% uptime)`);
    }

    reasons.push(`Tier: ${model.tier}`);
    reasons.push(`Latency: ~${model.performance.averageLatency}ms`);

    return reasons.join(' | ');
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    strategy: RoutingStrategy;
    totalDecisions: number;
    modelUsage: Record<string, number>;
    providerUsage: Record<string, number>;
  } {
    // In a real implementation, this would track actual routing decisions
    return {
      strategy: this.config.strategy,
      totalDecisions: 0,
      modelUsage: {},
      providerUsage: {},
    };
  }
}

