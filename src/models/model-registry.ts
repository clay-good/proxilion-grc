/**
 * AI Model Registry
 * 
 * Centralized registry for tracking all available AI models across providers
 * with capabilities, pricing, performance metrics, and availability status.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type ModelCapability = 
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'vision'
  | 'function-calling'
  | 'json-mode'
  | 'streaming'
  | 'code-generation'
  | 'reasoning';

export type ModelTier = 'free' | 'standard' | 'premium' | 'enterprise';

export interface ModelPricing {
  inputTokenPrice: number;   // Price per 1M input tokens
  outputTokenPrice: number;  // Price per 1M output tokens
  currency: string;          // USD, EUR, etc.
  billingUnit: number;       // Tokens per billing unit (usually 1M)
}

export interface ModelLimits {
  maxTokens: number;         // Maximum context window
  maxOutputTokens: number;   // Maximum output tokens
  rateLimit: number;         // Requests per minute
  dailyLimit?: number;       // Daily request limit
}

export interface ModelPerformance {
  averageLatency: number;    // Average response time (ms)
  p50Latency: number;        // 50th percentile latency
  p95Latency: number;        // 95th percentile latency
  p99Latency: number;        // 99th percentile latency
  successRate: number;       // Success rate (0-1)
  errorRate: number;         // Error rate (0-1)
  lastUpdated: number;       // Timestamp of last update
}

export interface ModelMetadata {
  id: string;                // Unique model identifier (e.g., "gpt-4-turbo")
  provider: string;          // Provider name (openai, anthropic, etc.)
  name: string;              // Display name
  description: string;       // Model description
  version: string;           // Model version
  releaseDate: string;       // Release date (ISO 8601)
  deprecated: boolean;       // Is model deprecated?
  deprecationDate?: string;  // When model will be deprecated
  replacementModel?: string; // Recommended replacement model
  tier: ModelTier;           // Model tier
  capabilities: ModelCapability[]; // Supported capabilities
  pricing: ModelPricing;     // Pricing information
  limits: ModelLimits;       // Rate limits and constraints
  performance: ModelPerformance; // Performance metrics
  available: boolean;        // Is model currently available?
  lastHealthCheck: number;   // Last health check timestamp
  tags: string[];            // Tags for categorization
  metadata: Record<string, any>; // Additional metadata
}

export interface ModelRegistryConfig {
  enableHealthChecks: boolean;
  healthCheckInterval: number; // ms
  performanceTrackingWindow: number; // ms
  autoUpdatePerformance: boolean;
}

export class ModelRegistry {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<ModelRegistryConfig>;
  private models: Map<string, ModelMetadata> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config?: Partial<ModelRegistryConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      enableHealthChecks: config?.enableHealthChecks ?? true,
      healthCheckInterval: config?.healthCheckInterval ?? 60000, // 1 minute
      performanceTrackingWindow: config?.performanceTrackingWindow ?? 3600000, // 1 hour
      autoUpdatePerformance: config?.autoUpdatePerformance ?? true,
    };

    this.initializeDefaultModels();
    
    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  /**
   * Initialize registry with default models from major providers
   */
  private initializeDefaultModels(): void {
    // OpenAI Models
    this.registerModel({
      id: 'gpt-4-turbo',
      provider: 'openai',
      name: 'GPT-4 Turbo',
      description: 'Most capable GPT-4 model with 128K context',
      version: '1.0',
      releaseDate: '2024-01-01',
      deprecated: false,
      tier: 'premium',
      capabilities: ['chat', 'completion', 'vision', 'function-calling', 'json-mode', 'streaming'],
      pricing: {
        inputTokenPrice: 10.0,
        outputTokenPrice: 30.0,
        currency: 'USD',
        billingUnit: 1000000,
      },
      limits: {
        maxTokens: 128000,
        maxOutputTokens: 4096,
        rateLimit: 10000,
      },
      performance: {
        averageLatency: 1200,
        p50Latency: 1000,
        p95Latency: 2000,
        p99Latency: 3000,
        successRate: 0.995,
        errorRate: 0.005,
        lastUpdated: Date.now(),
      },
      available: true,
      lastHealthCheck: Date.now(),
      tags: ['gpt-4', 'turbo', 'vision', 'latest'],
      metadata: {},
    });

    this.registerModel({
      id: 'gpt-3.5-turbo',
      provider: 'openai',
      name: 'GPT-3.5 Turbo',
      description: 'Fast and cost-effective model',
      version: '1.0',
      releaseDate: '2023-03-01',
      deprecated: false,
      tier: 'standard',
      capabilities: ['chat', 'completion', 'function-calling', 'json-mode', 'streaming'],
      pricing: {
        inputTokenPrice: 0.5,
        outputTokenPrice: 1.5,
        currency: 'USD',
        billingUnit: 1000000,
      },
      limits: {
        maxTokens: 16385,
        maxOutputTokens: 4096,
        rateLimit: 10000,
      },
      performance: {
        averageLatency: 800,
        p50Latency: 600,
        p95Latency: 1200,
        p99Latency: 1800,
        successRate: 0.998,
        errorRate: 0.002,
        lastUpdated: Date.now(),
      },
      available: true,
      lastHealthCheck: Date.now(),
      tags: ['gpt-3.5', 'turbo', 'fast', 'cost-effective'],
      metadata: {},
    });

    // Anthropic Models
    this.registerModel({
      id: 'claude-3-opus',
      provider: 'anthropic',
      name: 'Claude 3 Opus',
      description: 'Most capable Claude model',
      version: '3.0',
      releaseDate: '2024-03-01',
      deprecated: false,
      tier: 'premium',
      capabilities: ['chat', 'completion', 'vision', 'streaming', 'reasoning'],
      pricing: {
        inputTokenPrice: 15.0,
        outputTokenPrice: 75.0,
        currency: 'USD',
        billingUnit: 1000000,
      },
      limits: {
        maxTokens: 200000,
        maxOutputTokens: 4096,
        rateLimit: 4000,
      },
      performance: {
        averageLatency: 1500,
        p50Latency: 1200,
        p95Latency: 2500,
        p99Latency: 3500,
        successRate: 0.997,
        errorRate: 0.003,
        lastUpdated: Date.now(),
      },
      available: true,
      lastHealthCheck: Date.now(),
      tags: ['claude-3', 'opus', 'premium', 'reasoning'],
      metadata: {},
    });

    this.registerModel({
      id: 'claude-3-sonnet',
      provider: 'anthropic',
      name: 'Claude 3 Sonnet',
      description: 'Balanced performance and cost',
      version: '3.0',
      releaseDate: '2024-03-01',
      deprecated: false,
      tier: 'standard',
      capabilities: ['chat', 'completion', 'vision', 'streaming'],
      pricing: {
        inputTokenPrice: 3.0,
        outputTokenPrice: 15.0,
        currency: 'USD',
        billingUnit: 1000000,
      },
      limits: {
        maxTokens: 200000,
        maxOutputTokens: 4096,
        rateLimit: 4000,
      },
      performance: {
        averageLatency: 1000,
        p50Latency: 800,
        p95Latency: 1600,
        p99Latency: 2400,
        successRate: 0.998,
        errorRate: 0.002,
        lastUpdated: Date.now(),
      },
      available: true,
      lastHealthCheck: Date.now(),
      tags: ['claude-3', 'sonnet', 'balanced'],
      metadata: {},
    });

    // Google Models
    this.registerModel({
      id: 'gemini-pro',
      provider: 'google',
      name: 'Gemini Pro',
      description: 'Google\'s most capable model',
      version: '1.0',
      releaseDate: '2023-12-01',
      deprecated: false,
      tier: 'premium',
      capabilities: ['chat', 'completion', 'vision', 'streaming', 'code-generation'],
      pricing: {
        inputTokenPrice: 0.5,
        outputTokenPrice: 1.5,
        currency: 'USD',
        billingUnit: 1000000,
      },
      limits: {
        maxTokens: 32768,
        maxOutputTokens: 8192,
        rateLimit: 60,
      },
      performance: {
        averageLatency: 900,
        p50Latency: 700,
        p95Latency: 1400,
        p99Latency: 2100,
        successRate: 0.996,
        errorRate: 0.004,
        lastUpdated: Date.now(),
      },
      available: true,
      lastHealthCheck: Date.now(),
      tags: ['gemini', 'pro', 'vision', 'code'],
      metadata: {},
    });

    this.logger.info('Initialized model registry', { modelCount: this.models.size });
  }

  /**
   * Register a new model
   */
  registerModel(model: ModelMetadata): void {
    this.models.set(model.id, model);
    this.metrics.increment('model_registry_models_total');
    this.logger.info('Registered model', { modelId: model.id, provider: model.provider });
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): ModelMetadata | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get all models
   */
  getAllModels(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider: string): ModelMetadata[] {
    return this.getAllModels().filter(m => m.provider === provider);
  }

  /**
   * Get models by capability
   */
  getModelsByCapability(capability: ModelCapability): ModelMetadata[] {
    return this.getAllModels().filter(m => m.capabilities.includes(capability));
  }

  /**
   * Get models by tier
   */
  getModelsByTier(tier: ModelTier): ModelMetadata[] {
    return this.getAllModels().filter(m => m.tier === tier);
  }

  /**
   * Get available models only
   */
  getAvailableModels(): ModelMetadata[] {
    return this.getAllModels().filter(m => m.available && !m.deprecated);
  }

  /**
   * Update model performance metrics
   */
  updatePerformance(modelId: string, performance: Partial<ModelPerformance>): void {
    const model = this.models.get(modelId);
    if (!model) {
      this.logger.warn('Model not found for performance update', { modelId });
      return;
    }

    model.performance = {
      ...model.performance,
      ...performance,
      lastUpdated: Date.now(),
    };

    this.models.set(modelId, model);
    this.logger.debug('Updated model performance', { modelId, performance });
  }

  /**
   * Update model availability
   */
  updateAvailability(modelId: string, available: boolean): void {
    const model = this.models.get(modelId);
    if (!model) {
      this.logger.warn('Model not found for availability update', { modelId });
      return;
    }

    model.available = available;
    model.lastHealthCheck = Date.now();
    this.models.set(modelId, model);

    this.metrics.gauge('model_registry_available_models', this.getAvailableModels().length);
    this.logger.info('Updated model availability', { modelId, available });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    this.logger.info('Started model health checks', { 
      interval: this.config.healthCheckInterval 
    });
  }

  /**
   * Perform health checks on all models
   */
  private async performHealthChecks(): Promise<void> {
    const models = this.getAllModels();
    
    for (const model of models) {
      // In a real implementation, this would make actual health check requests
      // For now, we'll simulate it
      const isHealthy = Math.random() > 0.01; // 99% uptime simulation
      this.updateAvailability(model.id, isHealthy);
    }

    this.logger.debug('Completed health checks', { modelCount: models.length });
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      this.logger.info('Stopped model health checks');
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalModels: number;
    availableModels: number;
    deprecatedModels: number;
    providerCounts: Record<string, number>;
    tierCounts: Record<string, number>;
  } {
    const models = this.getAllModels();
    const available = this.getAvailableModels();
    const deprecated = models.filter(m => m.deprecated);

    const providerCounts: Record<string, number> = {};
    const tierCounts: Record<string, number> = {};

    for (const model of models) {
      providerCounts[model.provider] = (providerCounts[model.provider] || 0) + 1;
      tierCounts[model.tier] = (tierCounts[model.tier] || 0) + 1;
    }

    return {
      totalModels: models.length,
      availableModels: available.length,
      deprecatedModels: deprecated.length,
      providerCounts,
      tierCounts,
    };
  }
}

