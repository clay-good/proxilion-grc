/**
 * Tests for Advanced Routing & Traffic Management System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeoRouter, Region, Provider as GeoProvider } from '../src/routing/geo-router.js';
import { CostRouter, Provider as CostProvider } from '../src/routing/cost-router.js';
import { LatencyRouter, Provider as LatencyProvider } from '../src/routing/latency-router.js';
import { ProviderQuotaManager, Provider as QuotaProvider } from '../src/routing/provider-quota-manager.js';
import { SmartRetry, Provider as RetryProvider } from '../src/routing/smart-retry.js';

describe('Geo Router', () => {
  let router: GeoRouter;

  beforeEach(() => {
    router = new GeoRouter();
  });

  describe('Routing', () => {
    it('should route to preferred region', () => {
      const result = router.route(
        ['openai', 'anthropic'],
        {
          preferredRegions: ['us-east-1'],
          dataResidencyRequired: false,
          fallbackToAnyRegion: true,
        }
      );

      expect(result).toBeDefined();
      expect(result?.region).toBe('us-east-1');
      expect(result?.reason).toContain('Preferred region');
    });

    it('should enforce data residency', () => {
      const result = router.route(
        ['google', 'azure-openai'],
        {
          preferredRegions: ['eu-west-1'],
          dataResidencyRequired: true,
          dataResidencyRegion: 'EU',
          fallbackToAnyRegion: false,
        }
      );

      expect(result).toBeDefined();
      expect(result?.region).toBe('eu-west-1');
    });

    it('should find nearest region', () => {
      const result = router.route(
        ['openai', 'anthropic', 'google'],
        {
          preferredRegions: [],
          dataResidencyRequired: false,
          fallbackToAnyRegion: true,
        },
        'us-west-2' // Client in Oregon
      );

      expect(result).toBeDefined();
      expect(result?.reason).toContain('Nearest region');
    });

    it('should fallback to any region', () => {
      const result = router.route(
        ['openai'],
        {
          preferredRegions: ['ap-southeast-1'], // Not available for OpenAI
          dataResidencyRequired: false,
          fallbackToAnyRegion: true,
        }
      );

      expect(result).toBeDefined();
      expect(result?.reason).toContain('Fallback');
    });

    it('should return null when no suitable region', () => {
      const result = router.route(
        ['openai'],
        {
          preferredRegions: ['ap-southeast-1'],
          dataResidencyRequired: false,
          fallbackToAnyRegion: false,
        }
      );

      expect(result).toBeNull();
    });
  });

  describe('Region Management', () => {
    it('should update region availability', () => {
      router.updateRegionAvailability('openai', 'us-east-1', false);
      
      const result = router.route(
        ['openai'],
        {
          preferredRegions: ['us-east-1'],
          dataResidencyRequired: false,
          fallbackToAnyRegion: false,
        }
      );

      expect(result).toBeNull();
    });

    it('should update region latency', () => {
      router.updateRegionLatency('openai', 'us-east-1', 50);
      
      const regions = router.getProviderRegions('openai');
      const usEast = regions.find(r => r.region === 'us-east-1');
      
      expect(usEast?.latency).toBe(50);
    });

    it('should get all regions', () => {
      const regions = router.getAllRegions();
      expect(regions.length).toBeGreaterThan(0);
    });

    it('should get provider regions', () => {
      const regions = router.getProviderRegions('google');
      expect(regions.length).toBeGreaterThan(0);
      expect(regions.every(r => r.provider === 'google')).toBe(true);
    });
  });
});

describe('Cost Router', () => {
  let router: CostRouter;

  beforeEach(() => {
    router = new CostRouter();
  });

  describe('Routing', () => {
    it('should route to cheapest model', () => {
      const result = router.route(
        ['openai', 'anthropic'],
        {
          optimizeFor: 'cost',
        },
        1000, // input tokens
        500   // output tokens
      );

      expect(result).toBeDefined();
      expect(result?.reason).toContain('Lowest cost');
    });

    it('should route to highest quality', () => {
      const result = router.route(
        ['openai', 'anthropic'],
        {
          optimizeFor: 'quality',
        },
        1000,
        500
      );

      expect(result).toBeDefined();
      expect(result?.tier).toBe('flagship');
      expect(result?.reason).toContain('Highest quality');
    });

    it('should route with balanced strategy', () => {
      const result = router.route(
        ['openai', 'anthropic', 'google'],
        {
          optimizeFor: 'balanced',
        },
        1000,
        500
      );

      expect(result).toBeDefined();
      expect(result?.reason).toContain('balance');
    });

    it('should enforce max cost per request', () => {
      const result = router.route(
        ['openai', 'anthropic'],
        {
          optimizeFor: 'cost',
          maxCostPerRequest: 0.001, // Very low limit
        },
        1000,
        500
      );

      if (result) {
        expect(result.estimatedCost).toBeLessThanOrEqual(0.001);
      }
    });

    it('should filter by required capabilities', () => {
      const result = router.route(
        ['openai', 'anthropic', 'google'],
        {
          optimizeFor: 'cost',
          requiredCapabilities: ['vision'],
        },
        1000,
        500
      );

      expect(result).toBeDefined();
      
      const pricing = router.getModelPricing(result!.provider, result!.model);
      expect(pricing?.capabilities).toContain('vision');
    });

    it('should respect budget remaining', () => {
      const result = router.route(
        ['openai'],
        {
          optimizeFor: 'cost',
          budgetRemaining: 0.01,
        },
        1000,
        500
      );

      if (result) {
        expect(result.estimatedCost).toBeLessThanOrEqual(0.01);
      }
    });
  });

  describe('Pricing Management', () => {
    it('should update model pricing', () => {
      router.updatePricing('openai', 'gpt-4-turbo', 15.0, 45.0);
      
      const pricing = router.getModelPricing('openai', 'gpt-4-turbo');
      expect(pricing?.inputPricePerToken).toBe(15.0);
      expect(pricing?.outputPricePerToken).toBe(45.0);
    });

    it('should update model availability', () => {
      router.updateAvailability('openai', 'gpt-4-turbo', false);
      
      const pricing = router.getModelPricing('openai', 'gpt-4-turbo');
      expect(pricing?.available).toBe(false);
    });

    it('should get all pricing', () => {
      const allPricing = router.getAllPricing();
      expect(allPricing.length).toBeGreaterThan(0);
    });
  });
});

describe('Latency Router', () => {
  let router: LatencyRouter;

  beforeEach(() => {
    router = new LatencyRouter();
  });

  describe('Routing', () => {
    it('should route to fastest provider', () => {
      // Record some latencies
      router.recordLatency('openai', 'gpt-4-turbo', 100, true);
      router.recordLatency('openai', 'gpt-4-turbo', 120, true);
      router.recordLatency('anthropic', 'claude-3-opus', 200, true);
      router.recordLatency('anthropic', 'claude-3-opus', 220, true);

      const models = new Map<LatencyProvider, string[]>([
        ['openai', ['gpt-4-turbo']],
        ['anthropic', ['claude-3-opus']],
      ]);

      const result = router.route(
        ['openai', 'anthropic'],
        models,
        {
          targetPercentile: 50,
          requireHealthy: false,
        }
      );

      expect(result).toBeDefined();
      expect(result?.provider).toBe('openai');
      expect(result?.estimatedLatency).toBeLessThan(200);
    });

    it('should optimize for P95 latency', () => {
      // Record latencies with outliers
      for (let i = 0; i < 100; i++) {
        router.recordLatency('openai', 'gpt-4-turbo', 100 + Math.random() * 50, true);
      }

      const models = new Map<LatencyProvider, string[]>([
        ['openai', ['gpt-4-turbo']],
      ]);

      const result = router.route(
        ['openai'],
        models,
        {
          targetPercentile: 95,
          requireHealthy: false,
        }
      );

      expect(result).toBeDefined();
      expect(result?.reason).toContain('P95');
    });

    it('should enforce max latency', () => {
      router.recordLatency('openai', 'gpt-4-turbo', 500, true);
      router.recordLatency('anthropic', 'claude-3-opus', 100, true);

      const models = new Map<LatencyProvider, string[]>([
        ['openai', ['gpt-4-turbo']],
        ['anthropic', ['claude-3-opus']],
      ]);

      const result = router.route(
        ['openai', 'anthropic'],
        models,
        {
          targetPercentile: 50,
          maxLatency: 200,
          requireHealthy: false,
        }
      );

      expect(result).toBeDefined();
      expect(result?.provider).toBe('anthropic');
    });

    it('should filter by success rate', () => {
      // Record failures for openai
      for (let i = 0; i < 10; i++) {
        router.recordLatency('openai', 'gpt-4-turbo', 100, false);
      }
      
      // Record successes for anthropic
      for (let i = 0; i < 10; i++) {
        router.recordLatency('anthropic', 'claude-3-opus', 150, true);
      }

      const models = new Map<LatencyProvider, string[]>([
        ['openai', ['gpt-4-turbo']],
        ['anthropic', ['claude-3-opus']],
      ]);

      const result = router.route(
        ['openai', 'anthropic'],
        models,
        {
          targetPercentile: 50,
          minSuccessRate: 0.8,
          requireHealthy: false,
        }
      );

      expect(result).toBeDefined();
      expect(result?.provider).toBe('anthropic');
    });
  });

  describe('Statistics Management', () => {
    it('should record latency samples', () => {
      router.recordLatency('openai', 'gpt-4-turbo', 100, true);
      
      const stats = router.getStats('openai', 'gpt-4-turbo');
      expect(stats).toBeDefined();
      expect(stats?.sampleSize).toBe(1);
    });

    it('should update availability', () => {
      router.recordLatency('openai', 'gpt-4-turbo', 100, true);
      router.updateAvailability('openai', 'gpt-4-turbo', false);
      
      const stats = router.getStats('openai', 'gpt-4-turbo');
      expect(stats?.available).toBe(false);
    });

    it('should get all stats', () => {
      router.recordLatency('openai', 'gpt-4-turbo', 100, true);
      router.recordLatency('anthropic', 'claude-3-opus', 150, true);
      
      const allStats = router.getAllStats();
      expect(allStats.length).toBeGreaterThanOrEqual(2);
    });

    it('should clear stats', () => {
      router.recordLatency('openai', 'gpt-4-turbo', 100, true);
      router.clearStats('openai', 'gpt-4-turbo');
      
      const stats = router.getStats('openai', 'gpt-4-turbo');
      expect(stats).toBeUndefined();
    });
  });
});

describe('Provider Quota Manager', () => {
  let manager: ProviderQuotaManager;

  beforeEach(() => {
    manager = new ProviderQuotaManager();
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('Quota Checking', () => {
    it('should allow request within quota', () => {
      const result = manager.checkQuota('openai');
      
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBeDefined();
    });

    it('should enforce requests per minute limit', () => {
      // Set very low quota
      manager.setQuota({
        provider: 'openai',
        requestsPerMinute: 2,
        currentRequests: { minute: 0, hour: 0, day: 0 },
        currentTokens: { minute: 0, hour: 0, day: 0 },
        resetAt: {
          minute: Date.now() + 60000,
          hour: Date.now() + 3600000,
          day: Date.now() + 86400000,
        },
        exhausted: false,
      });

      // Use up quota
      manager.recordUsage('openai');
      manager.recordUsage('openai');

      const result = manager.checkQuota('openai');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('minute');
    });

    it('should enforce token limits', () => {
      manager.setQuota({
        provider: 'openai',
        tokensPerMinute: 1000,
        currentRequests: { minute: 0, hour: 0, day: 0 },
        currentTokens: { minute: 0, hour: 0, day: 0 },
        resetAt: {
          minute: Date.now() + 60000,
          hour: Date.now() + 3600000,
          day: Date.now() + 86400000,
        },
        exhausted: false,
      });

      const result = manager.checkQuota('openai', undefined, 2000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Tokens');
    });

    it('should handle exhausted quota', () => {
      manager.markExhausted('openai', undefined, Date.now() + 10000);
      
      const result = manager.checkQuota('openai');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exhausted');
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Usage Recording', () => {
    it('should record request usage', () => {
      const before = manager.getQuotaStatus('openai');
      const requestsBefore = before?.currentRequests.minute || 0;

      manager.recordUsage('openai');

      const after = manager.getQuotaStatus('openai');
      const requestsAfter = after?.currentRequests.minute || 0;

      expect(requestsAfter).toBe(requestsBefore + 1);
    });

    it('should record token usage', () => {
      const before = manager.getQuotaStatus('openai');
      const tokensBefore = before?.currentTokens.minute || 0;

      manager.recordUsage('openai', undefined, 1000);

      const after = manager.getQuotaStatus('openai');
      const tokensAfter = after?.currentTokens.minute || 0;

      expect(tokensAfter).toBe(tokensBefore + 1000);
    });
  });

  describe('Quota Management', () => {
    it('should get quota status', () => {
      const status = manager.getQuotaStatus('openai');
      
      expect(status).toBeDefined();
      expect(status?.provider).toBe('openai');
    });

    it('should get all quotas', () => {
      const quotas = manager.getAllQuotas();
      expect(quotas.length).toBeGreaterThan(0);
    });
  });
});

describe('Smart Retry', () => {
  let retry: SmartRetry;

  beforeEach(() => {
    retry = new SmartRetry({
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
  });

  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const operation = async () => 'success';
      
      const result = await retry.execute(
        operation,
        [{ provider: 'openai', model: 'gpt-4-turbo' }]
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts.length).toBe(0);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retry.execute(
        operation,
        [{ provider: 'openai', model: 'gpt-4-turbo' }]
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts.length).toBe(2);
    });

    it('should failover to different provider', async () => {
      let attempts = 0;
      const operation = async (provider: RetryProvider) => {
        attempts++;
        if (provider === 'openai' && attempts < 2) {
          const error: any = new Error('Rate limit');
          error.status = 429;
          throw error;
        }
        return `success-${provider}`;
      };

      const result = await retry.execute(
        operation,
        [
          { provider: 'openai', model: 'gpt-4-turbo' },
          { provider: 'anthropic', model: 'claude-3-opus' },
        ]
      );

      expect(result.success).toBe(true);
      expect(result.finalProvider).toBe('anthropic');
    });

    it('should respect max retries', async () => {
      const operation = async () => {
        throw new Error('Always fails');
      };

      const result = await retry.execute(
        operation,
        [{ provider: 'openai', model: 'gpt-4-turbo' }]
      );

      expect(result.success).toBe(false);
      expect(result.attempts.length).toBe(4); // Initial + 3 retries
    });

    it('should apply exponential backoff', async () => {
      const operation = async () => {
        throw new Error('Temporary failure');
      };

      const result = await retry.execute(
        operation,
        [{ provider: 'openai', model: 'gpt-4-turbo' }]
      );

      expect(result.attempts.length).toBeGreaterThan(0);

      // Check that delays are recorded (all attempts except the last should have delays)
      const attemptsWithDelays = result.attempts.filter(a => a.delayMs > 0);
      expect(attemptsWithDelays.length).toBeGreaterThan(0);

      // Check that delays increase exponentially
      if (attemptsWithDelays.length > 1) {
        for (let i = 1; i < attemptsWithDelays.length; i++) {
          expect(attemptsWithDelays[i].delayMs).toBeGreaterThanOrEqual(attemptsWithDelays[i - 1].delayMs * 0.8);
        }
      }
    });
  });

  describe('Configuration', () => {
    it('should get stats', () => {
      const stats = retry.getStats();
      
      expect(stats.maxRetries).toBe(3);
      expect(stats.initialDelayMs).toBe(100);
    });

    it('should update config', () => {
      retry.updateConfig({ maxRetries: 5 });
      
      const stats = retry.getStats();
      expect(stats.maxRetries).toBe(5);
    });
  });
});

