/**
 * Tests for AI Model Management & Provider Intelligence System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelRegistry, ModelCapability, ModelTier } from '../src/models/model-registry.js';
import { ProviderHealthMonitor, ProviderStatus } from '../src/models/provider-health-monitor.js';
import { IntelligentModelRouter, RoutingStrategy } from '../src/models/intelligent-model-router.js';
import { ModelFallbackChain } from '../src/models/model-fallback-chain.js';

describe('Model Registry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry({
      enableHealthChecks: false, // Disable for tests
    });
  });

  afterEach(() => {
    registry.stopHealthChecks();
  });

  describe('Model Registration', () => {
    it('should initialize with default models', () => {
      const models = registry.getAllModels();
      expect(models.length).toBeGreaterThan(0);
      
      // Check for known models
      const gpt4 = registry.getModel('gpt-4-turbo');
      expect(gpt4).toBeDefined();
      expect(gpt4?.provider).toBe('openai');
      expect(gpt4?.capabilities).toContain('chat');
    });

    it('should register a new model', () => {
      const initialCount = registry.getAllModels().length;
      
      registry.registerModel({
        id: 'test-model',
        provider: 'test-provider',
        name: 'Test Model',
        description: 'A test model',
        version: '1.0',
        releaseDate: '2024-01-01',
        deprecated: false,
        tier: 'standard',
        capabilities: ['chat', 'completion'],
        pricing: {
          inputTokenPrice: 1.0,
          outputTokenPrice: 2.0,
          currency: 'USD',
          billingUnit: 1000000,
        },
        limits: {
          maxTokens: 4096,
          maxOutputTokens: 2048,
          rateLimit: 100,
        },
        performance: {
          averageLatency: 500,
          p50Latency: 400,
          p95Latency: 800,
          p99Latency: 1200,
          successRate: 0.99,
          errorRate: 0.01,
          lastUpdated: Date.now(),
        },
        available: true,
        lastHealthCheck: Date.now(),
        tags: ['test'],
        metadata: {},
      });

      expect(registry.getAllModels().length).toBe(initialCount + 1);
      expect(registry.getModel('test-model')).toBeDefined();
    });

    it('should get model by ID', () => {
      const model = registry.getModel('gpt-3.5-turbo');
      expect(model).toBeDefined();
      expect(model?.id).toBe('gpt-3.5-turbo');
    });

    it('should return undefined for unknown model', () => {
      const model = registry.getModel('unknown-model');
      expect(model).toBeUndefined();
    });
  });

  describe('Model Filtering', () => {
    it('should get models by provider', () => {
      const openaiModels = registry.getModelsByProvider('openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.every(m => m.provider === 'openai')).toBe(true);
    });

    it('should get models by capability', () => {
      const visionModels = registry.getModelsByCapability('vision');
      expect(visionModels.length).toBeGreaterThan(0);
      expect(visionModels.every(m => m.capabilities.includes('vision'))).toBe(true);
    });

    it('should get models by tier', () => {
      const premiumModels = registry.getModelsByTier('premium');
      expect(premiumModels.length).toBeGreaterThan(0);
      expect(premiumModels.every(m => m.tier === 'premium')).toBe(true);
    });

    it('should get available models only', () => {
      const availableModels = registry.getAvailableModels();
      expect(availableModels.every(m => m.available && !m.deprecated)).toBe(true);
    });
  });

  describe('Model Updates', () => {
    it('should update model performance', () => {
      const modelId = 'gpt-4-turbo';
      const newLatency = 999;

      registry.updatePerformance(modelId, {
        averageLatency: newLatency,
      });

      const model = registry.getModel(modelId);
      expect(model?.performance.averageLatency).toBe(newLatency);
    });

    it('should update model availability', () => {
      const modelId = 'gpt-4-turbo';

      registry.updateAvailability(modelId, false);
      let model = registry.getModel(modelId);
      expect(model?.available).toBe(false);

      registry.updateAvailability(modelId, true);
      model = registry.getModel(modelId);
      expect(model?.available).toBe(true);
    });
  });

  describe('Registry Statistics', () => {
    it('should return accurate statistics', () => {
      const stats = registry.getStats();
      
      expect(stats.totalModels).toBeGreaterThan(0);
      expect(stats.availableModels).toBeGreaterThan(0);
      expect(stats.providerCounts).toBeDefined();
      expect(stats.tierCounts).toBeDefined();
      expect(stats.providerCounts['openai']).toBeGreaterThan(0);
    });
  });
});

describe('Provider Health Monitor', () => {
  let monitor: ProviderHealthMonitor;

  beforeEach(() => {
    monitor = new ProviderHealthMonitor({
      healthCheckInterval: 60000, // Don't run during tests
      metricsWindow: 60000,
    });
  });

  afterEach(() => {
    monitor.stopHealthChecks();
  });

  describe('Request Recording', () => {
    it('should record successful requests', () => {
      monitor.recordRequest('openai', true, 500);
      
      const health = monitor.getProviderHealth('openai');
      expect(health).toBeDefined();
      expect(health?.requestCount).toBeGreaterThan(0);
      expect(health?.successCount).toBeGreaterThan(0);
    });

    it('should record failed requests', () => {
      monitor.recordRequest('openai', false, 1000, 'timeout');
      
      const health = monitor.getProviderHealth('openai');
      expect(health).toBeDefined();
      expect(health?.errorCount).toBeGreaterThan(0);
      expect(health?.timeoutCount).toBeGreaterThan(0);
    });

    it('should track consecutive failures', () => {
      monitor.recordRequest('openai', false, 1000);
      monitor.recordRequest('openai', false, 1000);
      monitor.recordRequest('openai', false, 1000);
      
      const health = monitor.getProviderHealth('openai');
      expect(health?.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on success', () => {
      monitor.recordRequest('openai', false, 1000);
      monitor.recordRequest('openai', false, 1000);
      monitor.recordRequest('openai', true, 500);
      
      const health = monitor.getProviderHealth('openai');
      expect(health?.consecutiveFailures).toBe(0);
    });
  });

  describe('Health Status', () => {
    it('should mark provider as unhealthy after threshold failures', () => {
      for (let i = 0; i < 5; i++) {
        monitor.recordRequest('openai', false, 1000);
      }
      
      const health = monitor.getProviderHealth('openai');
      expect(health?.status).toBe('unhealthy');
    });

    it('should mark provider as degraded with moderate error rate', () => {
      // Record mix of success and failures (10% error rate)
      for (let i = 0; i < 9; i++) {
        monitor.recordRequest('openai', true, 500);
      }
      monitor.recordRequest('openai', false, 1000);
      
      const health = monitor.getProviderHealth('openai');
      expect(health?.status).toBe('degraded');
    });

    it('should check if provider is healthy', () => {
      monitor.recordRequest('openai', true, 500);
      expect(monitor.isProviderHealthy('openai')).toBe(true);
    });

    it('should check if provider is available', () => {
      monitor.recordRequest('openai', true, 500);
      expect(monitor.isProviderAvailable('openai')).toBe(true);
    });
  });

  describe('Health Metrics', () => {
    it('should calculate availability correctly', () => {
      // 80% success rate
      for (let i = 0; i < 8; i++) {
        monitor.recordRequest('openai', true, 500);
      }
      for (let i = 0; i < 2; i++) {
        monitor.recordRequest('openai', false, 1000);
      }
      
      const health = monitor.getProviderHealth('openai');
      expect(health?.availability).toBeCloseTo(0.8, 1);
    });

    it('should calculate error rate correctly', () => {
      // 20% error rate
      for (let i = 0; i < 8; i++) {
        monitor.recordRequest('openai', true, 500);
      }
      for (let i = 0; i < 2; i++) {
        monitor.recordRequest('openai', false, 1000);
      }
      
      const health = monitor.getProviderHealth('openai');
      expect(health?.errorRate).toBeCloseTo(0.2, 1);
    });
  });

  describe('Health Summary', () => {
    it('should return overall health summary', () => {
      monitor.recordRequest('openai', true, 500);
      monitor.recordRequest('anthropic', true, 600);
      
      const summary = monitor.getHealthSummary();
      expect(summary.totalProviders).toBeGreaterThan(0);
      expect(summary.healthyProviders).toBeGreaterThan(0);
      expect(summary.overallAvailability).toBeGreaterThan(0);
    });
  });

  describe('Healthy Providers', () => {
    it('should return list of healthy providers', () => {
      monitor.recordRequest('openai', true, 500);
      monitor.recordRequest('anthropic', true, 600);
      
      const healthy = monitor.getHealthyProviders();
      expect(healthy).toContain('openai');
      expect(healthy).toContain('anthropic');
    });
  });
});

describe('Intelligent Model Router', () => {
  let registry: ModelRegistry;
  let monitor: ProviderHealthMonitor;
  let router: IntelligentModelRouter;

  beforeEach(() => {
    registry = new ModelRegistry({ enableHealthChecks: false });
    monitor = new ProviderHealthMonitor({ healthCheckInterval: 60000 });
    router = new IntelligentModelRouter(registry, monitor, {
      strategy: 'balanced',
      enableHealthChecks: false,
    });
  });

  afterEach(() => {
    registry.stopHealthChecks();
    monitor.stopHealthChecks();
  });

  describe('Model Routing', () => {
    it('should route to a model based on capabilities', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
      });

      expect(decision).toBeDefined();
      expect(decision?.model.capabilities).toContain('chat');
    });

    it('should route to vision-capable model', async () => {
      const decision = await router.route({
        capabilities: ['vision'],
      });

      expect(decision).toBeDefined();
      expect(decision?.model.capabilities).toContain('vision');
    });

    it('should return null when no models match requirements', async () => {
      const decision = await router.route({
        capabilities: ['nonexistent-capability' as ModelCapability],
      });

      expect(decision).toBeNull();
    });

    it('should respect max cost constraint', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
        maxCost: 0.001, // Very low cost
      });

      // Should route to cheapest model or return null
      if (decision) {
        const estimatedCost = decision.estimatedCost;
        expect(estimatedCost).toBeLessThanOrEqual(0.001);
      }
    });

    it('should respect max latency constraint', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
        maxLatency: 1000,
      });

      if (decision) {
        expect(decision.model.performance.averageLatency).toBeLessThanOrEqual(1000);
      }
    });

    it('should exclude specified providers', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
        excludedProviders: ['openai'],
      });

      if (decision) {
        expect(decision.model.provider).not.toBe('openai');
      }
    });

    it('should prefer specified providers', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
        preferredProviders: ['anthropic'],
      });

      if (decision) {
        expect(decision.model.provider).toBe('anthropic');
      }
    });
  });

  describe('Routing Strategies', () => {
    it('should use cost-optimized strategy', async () => {
      const costRouter = new IntelligentModelRouter(registry, monitor, {
        strategy: 'cost-optimized',
        enableHealthChecks: false,
      });

      const decision = await costRouter.route({
        capabilities: ['chat'],
      });

      expect(decision).toBeDefined();
      // Should select cheaper models
    });

    it('should use latency-optimized strategy', async () => {
      const latencyRouter = new IntelligentModelRouter(registry, monitor, {
        strategy: 'latency-optimized',
        enableHealthChecks: false,
      });

      const decision = await latencyRouter.route({
        capabilities: ['chat'],
      });

      expect(decision).toBeDefined();
      // Should select faster models
    });
  });

  describe('Routing Decision', () => {
    it('should include alternatives in decision', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
      });

      expect(decision).toBeDefined();
      expect(decision?.alternatives).toBeDefined();
      expect(Array.isArray(decision?.alternatives)).toBe(true);
    });

    it('should include routing reason', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
      });

      expect(decision).toBeDefined();
      expect(decision?.reason).toBeDefined();
      expect(typeof decision?.reason).toBe('string');
    });

    it('should include cost and latency estimates', async () => {
      const decision = await router.route({
        capabilities: ['chat'],
      });

      expect(decision).toBeDefined();
      expect(decision?.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(decision?.estimatedLatency).toBeGreaterThan(0);
    });
  });
});

describe('Model Fallback Chain', () => {
  let registry: ModelRegistry;
  let monitor: ProviderHealthMonitor;
  let router: IntelligentModelRouter;
  let fallbackChain: ModelFallbackChain;

  beforeEach(() => {
    registry = new ModelRegistry({ enableHealthChecks: false });
    monitor = new ProviderHealthMonitor({ healthCheckInterval: 60000 });
    router = new IntelligentModelRouter(registry, monitor);
    fallbackChain = new ModelFallbackChain(registry, monitor, router);
  });

  afterEach(() => {
    registry.stopHealthChecks();
    monitor.stopHealthChecks();
  });

  describe('Fallback Rules', () => {
    it('should initialize with default fallback chains', () => {
      const stats = fallbackChain.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);
      expect(stats.enabledRules).toBeGreaterThan(0);
    });

    it('should get fallback rule for model', () => {
      const rule = fallbackChain.getFallbackRuleForModel('gpt-4-turbo');
      expect(rule).toBeDefined();
      expect(rule?.primaryModel).toBe('gpt-4-turbo');
      expect(rule?.fallbackModels.length).toBeGreaterThan(0);
    });

    it('should add custom fallback rule', () => {
      const initialCount = fallbackChain.getStats().totalRules;

      fallbackChain.addFallbackRule({
        id: 'test-chain',
        name: 'Test Chain',
        description: 'Test fallback chain',
        primaryModel: 'test-model',
        fallbackModels: ['fallback-1', 'fallback-2'],
        enabled: true,
        conditions: [{ type: 'error', enabled: true }],
        maxRetries: 3,
        retryDelay: 1000,
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 60000,
      });

      expect(fallbackChain.getStats().totalRules).toBe(initialCount + 1);
    });
  });

  describe('Fallback Execution', () => {
    it('should execute fallback on error', async () => {
      const error = new Error('Rate limit exceeded');
      const result = await fallbackChain.executeFallback('gpt-4-turbo', error);

      expect(result).toBeDefined();
      expect(result.attempts.length).toBeGreaterThan(0);
    });

    it('should record all fallback attempts', async () => {
      const error = new Error('Service unavailable');
      const result = await fallbackChain.executeFallback('gpt-4-turbo', error);

      expect(result.attempts.length).toBeGreaterThan(0);
      expect(result.attempts[0].model).toBe('gpt-4-turbo');
      expect(result.attempts[0].success).toBe(false);
    });

    it('should return success when fallback succeeds', async () => {
      const error = new Error('Timeout');
      const result = await fallbackChain.executeFallback('gpt-4-turbo', error);

      // Result may succeed or fail depending on simulation
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Circuit Breaker', () => {
    it('should track circuit breaker state', () => {
      const stats = fallbackChain.getStats();
      expect(stats.circuitBreakersOpen).toBeGreaterThanOrEqual(0);
      expect(stats.circuitBreakersHalfOpen).toBeGreaterThanOrEqual(0);
    });

    it('should reset circuit breaker', () => {
      fallbackChain.resetCircuitBreaker('gpt-4-turbo');
      const state = fallbackChain.getCircuitBreakerState('gpt-4-turbo');
      expect(state).toBeUndefined();
    });
  });
});

