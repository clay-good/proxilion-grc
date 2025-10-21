/**
 * Cost-aware Router
 * 
 * Routes requests to the most cost-effective provider based on:
 * - Real-time pricing
 * - Token usage estimates
 * - Budget constraints
 * - Cost optimization strategies
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type Provider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'azure-openai';
export type ModelTier = 'flagship' | 'advanced' | 'standard' | 'efficient';

export interface ModelPricing {
  provider: Provider;
  model: string;
  tier: ModelTier;
  inputPricePerToken: number;   // Price per 1M tokens
  outputPricePerToken: number;  // Price per 1M tokens
  available: boolean;
  capabilities: string[];        // e.g., ['chat', 'vision', 'function-calling']
}

export interface CostRoutingConfig {
  maxCostPerRequest?: number;    // Maximum cost per request in USD
  preferredTier?: ModelTier;     // Preferred model tier
  budgetRemaining?: number;      // Remaining budget in USD
  optimizeFor: 'cost' | 'quality' | 'balanced';
  requiredCapabilities?: string[]; // Required model capabilities
}

export interface CostEstimate {
  provider: Provider;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;         // In USD
  pricePerInputToken: number;
  pricePerOutputToken: number;
}

export interface CostRoutingResult {
  provider: Provider;
  model: string;
  tier: ModelTier;
  estimatedCost: number;
  reason: string;
  alternatives?: CostEstimate[];
}

export class CostRouter {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Model pricing database
  private modelPricing: Map<string, ModelPricing> = new Map();

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    // Initialize pricing
    this.initializePricing();
  }

  /**
   * Initialize model pricing
   */
  private initializePricing(): void {
    // OpenAI pricing (per 1M tokens)
    this.addModelPricing({
      provider: 'openai',
      model: 'gpt-4-turbo',
      tier: 'flagship',
      inputPricePerToken: 10.00,
      outputPricePerToken: 30.00,
      available: true,
      capabilities: ['chat', 'vision', 'function-calling', 'json-mode'],
    });

    this.addModelPricing({
      provider: 'openai',
      model: 'gpt-4',
      tier: 'advanced',
      inputPricePerToken: 30.00,
      outputPricePerToken: 60.00,
      available: true,
      capabilities: ['chat', 'function-calling'],
    });

    this.addModelPricing({
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      tier: 'efficient',
      inputPricePerToken: 0.50,
      outputPricePerToken: 1.50,
      available: true,
      capabilities: ['chat', 'function-calling', 'json-mode'],
    });

    // Anthropic pricing
    this.addModelPricing({
      provider: 'anthropic',
      model: 'claude-3-opus',
      tier: 'flagship',
      inputPricePerToken: 15.00,
      outputPricePerToken: 75.00,
      available: true,
      capabilities: ['chat', 'vision', 'long-context'],
    });

    this.addModelPricing({
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      tier: 'advanced',
      inputPricePerToken: 3.00,
      outputPricePerToken: 15.00,
      available: true,
      capabilities: ['chat', 'vision', 'long-context'],
    });

    this.addModelPricing({
      provider: 'anthropic',
      model: 'claude-3-haiku',
      tier: 'efficient',
      inputPricePerToken: 0.25,
      outputPricePerToken: 1.25,
      available: true,
      capabilities: ['chat', 'vision'],
    });

    // Google AI pricing
    this.addModelPricing({
      provider: 'google',
      model: 'gemini-pro',
      tier: 'advanced',
      inputPricePerToken: 0.50,
      outputPricePerToken: 1.50,
      available: true,
      capabilities: ['chat', 'vision', 'long-context'],
    });

    this.addModelPricing({
      provider: 'google',
      model: 'gemini-pro-vision',
      tier: 'advanced',
      inputPricePerToken: 0.50,
      outputPricePerToken: 1.50,
      available: true,
      capabilities: ['chat', 'vision'],
    });

    // Cohere pricing
    this.addModelPricing({
      provider: 'cohere',
      model: 'command',
      tier: 'standard',
      inputPricePerToken: 1.00,
      outputPricePerToken: 2.00,
      available: true,
      capabilities: ['chat', 'function-calling'],
    });

    this.addModelPricing({
      provider: 'cohere',
      model: 'command-light',
      tier: 'efficient',
      inputPricePerToken: 0.30,
      outputPricePerToken: 0.60,
      available: true,
      capabilities: ['chat'],
    });
  }

  /**
   * Add model pricing
   */
  addModelPricing(pricing: ModelPricing): void {
    const key = `${pricing.provider}:${pricing.model}`;
    this.modelPricing.set(key, pricing);
  }

  /**
   * Route request to most cost-effective provider
   */
  route(
    providers: Provider[],
    config: CostRoutingConfig,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): CostRoutingResult | null {
    this.logger.debug('Routing request by cost', {
      providers,
      optimizeFor: config.optimizeFor,
      estimatedInputTokens,
      estimatedOutputTokens,
    });

    // Get available models
    const availableModels = this.getAvailableModels(providers);

    if (availableModels.length === 0) {
      this.logger.warn('No available models');
      return null;
    }

    // Filter by required capabilities
    let candidateModels = availableModels;
    if (config.requiredCapabilities && config.requiredCapabilities.length > 0) {
      candidateModels = availableModels.filter(m =>
        config.requiredCapabilities!.every(cap => m.capabilities.includes(cap))
      );

      if (candidateModels.length === 0) {
        this.logger.error('No models match required capabilities', undefined, {
          required: config.requiredCapabilities,
        });
        return null;
      }
    }

    // Filter by preferred tier
    if (config.preferredTier) {
      const tierMatches = candidateModels.filter(m => m.tier === config.preferredTier);
      if (tierMatches.length > 0) {
        candidateModels = tierMatches;
      }
    }

    // Calculate costs for all candidates
    const estimates = candidateModels.map(model =>
      this.estimateCost(model, estimatedInputTokens, estimatedOutputTokens)
    );

    // Filter by max cost
    let validEstimates = estimates;
    if (config.maxCostPerRequest) {
      validEstimates = estimates.filter(e => e.estimatedCost <= config.maxCostPerRequest!);
      
      if (validEstimates.length === 0) {
        this.logger.warn('No models within cost budget', {
          maxCost: config.maxCostPerRequest,
          cheapest: Math.min(...estimates.map(e => e.estimatedCost)),
        });
        return null;
      }
    }

    // Filter by remaining budget
    if (config.budgetRemaining !== undefined) {
      validEstimates = validEstimates.filter(e => e.estimatedCost <= config.budgetRemaining!);
      
      if (validEstimates.length === 0) {
        this.logger.warn('No models within remaining budget', {
          budgetRemaining: config.budgetRemaining,
        });
        return null;
      }
    }

    // Select based on optimization strategy
    let selected: CostEstimate;
    let reason: string;

    switch (config.optimizeFor) {
      case 'cost':
        // Select cheapest
        selected = validEstimates.reduce((min, e) =>
          e.estimatedCost < min.estimatedCost ? e : min
        );
        reason = 'Lowest cost option';
        break;

      case 'quality':
        // Select highest tier (flagship > advanced > standard > efficient)
        const tierOrder: ModelTier[] = ['flagship', 'advanced', 'standard', 'efficient'];
        selected = validEstimates.reduce((best, e) => {
          const modelKey = `${e.provider}:${e.model}`;
          const pricing = this.modelPricing.get(modelKey)!;
          const bestKey = `${best.provider}:${best.model}`;
          const bestPricing = this.modelPricing.get(bestKey)!;
          
          return tierOrder.indexOf(pricing.tier) < tierOrder.indexOf(bestPricing.tier) ? e : best;
        });
        reason = 'Highest quality tier';
        break;

      case 'balanced':
        // Balance cost and quality (use cost per tier)
        const tierCostMultipliers: Record<ModelTier, number> = {
          flagship: 1.0,
          advanced: 1.2,
          standard: 1.5,
          efficient: 2.0,
        };
        
        selected = validEstimates.reduce((best, e) => {
          const modelKey = `${e.provider}:${e.model}`;
          const pricing = this.modelPricing.get(modelKey)!;
          const score = e.estimatedCost * tierCostMultipliers[pricing.tier];
          
          const bestKey = `${best.provider}:${best.model}`;
          const bestPricing = this.modelPricing.get(bestKey)!;
          const bestScore = best.estimatedCost * tierCostMultipliers[bestPricing.tier];
          
          return score < bestScore ? e : best;
        });
        reason = 'Best cost-quality balance';
        break;

      default:
        selected = validEstimates[0];
        reason = 'Default selection';
    }

    const modelKey = `${selected.provider}:${selected.model}`;
    const pricing = this.modelPricing.get(modelKey)!;

    this.metrics.increment('cost_router_route_total', 1, {
      provider: selected.provider,
      model: selected.model,
      tier: pricing.tier,
      optimizeFor: config.optimizeFor,
    });

    this.metrics.histogram('cost_router_estimated_cost_usd', selected.estimatedCost, {
      provider: selected.provider,
      model: selected.model,
    });

    return {
      provider: selected.provider,
      model: selected.model,
      tier: pricing.tier,
      estimatedCost: selected.estimatedCost,
      reason,
      alternatives: validEstimates.filter(e => e !== selected).slice(0, 3),
    };
  }

  /**
   * Estimate cost for a model
   */
  private estimateCost(
    pricing: ModelPricing,
    inputTokens: number,
    outputTokens: number
  ): CostEstimate {
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerToken;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerToken;
    const totalCost = inputCost + outputCost;

    return {
      provider: pricing.provider,
      model: pricing.model,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedCost: totalCost,
      pricePerInputToken: pricing.inputPricePerToken,
      pricePerOutputToken: pricing.outputPricePerToken,
    };
  }

  /**
   * Get available models for providers
   */
  private getAvailableModels(providers: Provider[]): ModelPricing[] {
    const models: ModelPricing[] = [];

    for (const [key, pricing] of this.modelPricing.entries()) {
      if (providers.includes(pricing.provider) && pricing.available) {
        models.push(pricing);
      }
    }

    return models;
  }

  /**
   * Update model pricing
   */
  updatePricing(
    provider: Provider,
    model: string,
    inputPrice: number,
    outputPrice: number
  ): void {
    const key = `${provider}:${model}`;
    const pricing = this.modelPricing.get(key);

    if (pricing) {
      pricing.inputPricePerToken = inputPrice;
      pricing.outputPricePerToken = outputPrice;
      
      this.logger.info('Model pricing updated', {
        provider,
        model,
        inputPrice,
        outputPrice,
      });
    }
  }

  /**
   * Update model availability
   */
  updateAvailability(provider: Provider, model: string, available: boolean): void {
    const key = `${provider}:${model}`;
    const pricing = this.modelPricing.get(key);

    if (pricing) {
      pricing.available = available;
      
      this.logger.info('Model availability updated', {
        provider,
        model,
        available,
      });

      this.metrics.gauge('cost_router_model_available', available ? 1 : 0, {
        provider,
        model,
      });
    }
  }

  /**
   * Get all model pricing
   */
  getAllPricing(): ModelPricing[] {
    return Array.from(this.modelPricing.values());
  }

  /**
   * Get pricing for specific model
   */
  getModelPricing(provider: Provider, model: string): ModelPricing | undefined {
    const key = `${provider}:${model}`;
    return this.modelPricing.get(key);
  }
}

