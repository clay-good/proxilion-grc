/**
 * Tests for Experimentation Framework
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExperimentManager, ExperimentConfig, ExperimentVariant } from '../src/experimentation/experiment-manager.js';
import { FeatureFlagManager, FeatureFlag } from '../src/experimentation/feature-flag-manager.js';
import { ExperimentAnalytics } from '../src/experimentation/experiment-analytics.js';
import { TrafficSplitter, TrafficSplit, TrafficBucket } from '../src/experimentation/traffic-splitter.js';

describe('Experiment Manager', () => {
  let manager: ExperimentManager;

  beforeEach(() => {
    manager = new ExperimentManager();
  });

  describe('Experiment Creation', () => {
    it('should create an experiment', () => {
      const experiment = manager.createExperiment({
        id: 'exp-1',
        name: 'Test Experiment',
        description: 'Testing A/B test',
        type: 'ab-test',
        status: 'draft',
        variants: [
          { id: 'control', name: 'Control', description: 'Control group', weight: 0.5, config: {}, enabled: true },
          { id: 'treatment', name: 'Treatment', description: 'Treatment group', weight: 0.5, config: {}, enabled: true },
        ],
        startDate: Date.now(),
        createdBy: 'test-user',
        metadata: {},
      });

      expect(experiment.id).toBe('exp-1');
      expect(experiment.variants).toHaveLength(2);
      expect(experiment.status).toBe('draft');
    });

    it('should reject invalid weights', () => {
      expect(() => {
        manager.createExperiment({
          id: 'exp-2',
          name: 'Invalid Experiment',
          description: 'Invalid weights',
          type: 'ab-test',
          status: 'draft',
          variants: [
            { id: 'control', name: 'Control', description: '', weight: 0.6, config: {}, enabled: true },
            { id: 'treatment', name: 'Treatment', description: '', weight: 0.6, config: {}, enabled: true },
          ],
          startDate: Date.now(),
          createdBy: 'test-user',
          metadata: {},
        });
      }).toThrow('Variant weights must sum to 1.0');
    });

    it('should get experiment by ID', () => {
      manager.createExperiment({
        id: 'exp-3',
        name: 'Test',
        description: '',
        type: 'ab-test',
        status: 'draft',
        variants: [
          { id: 'v1', name: 'V1', description: '', weight: 1.0, config: {}, enabled: true },
        ],
        startDate: Date.now(),
        createdBy: 'test-user',
        metadata: {},
      });

      const experiment = manager.getExperiment('exp-3');
      expect(experiment).toBeDefined();
      expect(experiment?.id).toBe('exp-3');
    });
  });

  describe('Experiment Lifecycle', () => {
    beforeEach(() => {
      manager.createExperiment({
        id: 'exp-lifecycle',
        name: 'Lifecycle Test',
        description: '',
        type: 'ab-test',
        status: 'draft',
        variants: [
          { id: 'control', name: 'Control', description: '', weight: 0.5, config: {}, enabled: true },
          { id: 'treatment', name: 'Treatment', description: '', weight: 0.5, config: {}, enabled: true },
        ],
        startDate: Date.now(),
        createdBy: 'test-user',
        metadata: {},
      });
    });

    it('should start an experiment', () => {
      const experiment = manager.startExperiment('exp-lifecycle');
      expect(experiment.status).toBe('running');
    });

    it('should pause a running experiment', () => {
      manager.startExperiment('exp-lifecycle');
      const experiment = manager.pauseExperiment('exp-lifecycle');
      expect(experiment.status).toBe('paused');
    });

    it('should complete an experiment', () => {
      manager.startExperiment('exp-lifecycle');
      const experiment = manager.completeExperiment('exp-lifecycle');
      expect(experiment.status).toBe('completed');
      expect(experiment.endDate).toBeDefined();
    });

    it('should cancel an experiment', () => {
      const experiment = manager.cancelExperiment('exp-lifecycle');
      expect(experiment.status).toBe('cancelled');
    });
  });

  describe('Variant Assignment', () => {
    beforeEach(() => {
      manager.createExperiment({
        id: 'exp-assignment',
        name: 'Assignment Test',
        description: '',
        type: 'ab-test',
        status: 'running',
        variants: [
          { id: 'control', name: 'Control', description: '', weight: 0.5, config: {}, enabled: true },
          { id: 'treatment', name: 'Treatment', description: '', weight: 0.5, config: {}, enabled: true },
        ],
        startDate: Date.now(),
        createdBy: 'test-user',
        metadata: {},
      });
    });

    it('should assign user to variant', () => {
      const assignment = manager.assignVariant('exp-assignment', 'user-1');
      expect(assignment).toBeDefined();
      expect(assignment?.experimentId).toBe('exp-assignment');
      expect(['control', 'treatment']).toContain(assignment?.variantId);
    });

    it('should maintain sticky assignment', () => {
      const assignment1 = manager.assignVariant('exp-assignment', 'user-2');
      const assignment2 = manager.assignVariant('exp-assignment', 'user-2');
      
      expect(assignment1?.variantId).toBe(assignment2?.variantId);
    });

    it('should distribute users across variants', () => {
      const assignments: Record<string, number> = { control: 0, treatment: 0 };

      for (let i = 0; i < 1000; i++) {
        const assignment = manager.assignVariant('exp-assignment', `user-${i}`);
        if (assignment) {
          assignments[assignment.variantId]++;
        }
      }

      // Check distribution is roughly 50/50 (within 30% tolerance for hash-based distribution)
      expect(assignments.control).toBeGreaterThan(300);
      expect(assignments.control).toBeLessThan(700);
      expect(assignments.treatment).toBeGreaterThan(300);
      expect(assignments.treatment).toBeLessThan(700);

      // Verify total is 1000
      expect(assignments.control + assignments.treatment).toBe(1000);
    });
  });

  describe('Metrics Recording', () => {
    beforeEach(() => {
      manager.createExperiment({
        id: 'exp-metrics',
        name: 'Metrics Test',
        description: '',
        type: 'ab-test',
        status: 'running',
        variants: [
          { id: 'control', name: 'Control', description: '', weight: 1.0, config: {}, enabled: true },
        ],
        startDate: Date.now(),
        createdBy: 'test-user',
        metadata: {},
      });
    });

    it('should record experiment metrics', () => {
      manager.recordMetrics('exp-metrics', 'control', {
        success: true,
        latency: 100,
        cost: 0.01,
        converted: true,
      });

      const metrics = manager.getMetrics('exp-metrics');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].variantId).toBe('control');
      expect(metrics[0].totalRequests).toBe(1);
      expect(metrics[0].successfulRequests).toBe(1);
    });

    it('should calculate running averages', () => {
      manager.recordMetrics('exp-metrics', 'control', { success: true, latency: 100, cost: 0.01 });
      manager.recordMetrics('exp-metrics', 'control', { success: true, latency: 200, cost: 0.02 });
      manager.recordMetrics('exp-metrics', 'control', { success: true, latency: 300, cost: 0.03 });

      const metrics = manager.getMetrics('exp-metrics');
      expect(metrics[0].averageLatency).toBe(200);
      expect(metrics[0].averageCost).toBeCloseTo(0.02, 2);
    });
  });
});

describe('Feature Flag Manager', () => {
  let manager: FeatureFlagManager;

  beforeEach(() => {
    manager = new FeatureFlagManager();
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('Flag Creation', () => {
    it('should create a feature flag', () => {
      const flag = manager.createFlag({
        id: 'flag-1',
        name: 'Test Flag',
        description: 'Testing feature flag',
        status: 'active',
        enabled: true,
        rolloutPercentage: 50,
        rolloutStrategy: 'percentage',
        createdBy: 'test-user',
        metadata: {},
      });

      expect(flag.id).toBe('flag-1');
      expect(flag.enabled).toBe(true);
      expect(flag.rolloutPercentage).toBe(50);
    });

    it('should get flag by ID', () => {
      manager.createFlag({
        id: 'flag-2',
        name: 'Test',
        description: '',
        status: 'active',
        enabled: true,
        rolloutPercentage: 100,
        rolloutStrategy: 'percentage',
        createdBy: 'test-user',
        metadata: {},
      });

      const flag = manager.getFlag('flag-2');
      expect(flag).toBeDefined();
      expect(flag?.id).toBe('flag-2');
    });
  });

  describe('Flag Evaluation', () => {
    beforeEach(() => {
      manager.createFlag({
        id: 'flag-eval',
        name: 'Evaluation Test',
        description: '',
        status: 'active',
        enabled: true,
        rolloutPercentage: 50,
        rolloutStrategy: 'percentage',
        createdBy: 'test-user',
        metadata: {},
      });
    });

    it('should evaluate flag for user', () => {
      const evaluation = manager.evaluateFlag('flag-eval', 'user-1');
      expect(evaluation).toBeDefined();
      expect(evaluation.flagId).toBe('flag-eval');
      expect(typeof evaluation.enabled).toBe('boolean');
    });

    it('should respect whitelist', () => {
      manager.updateFlag('flag-eval', {
        whitelistedUsers: ['user-whitelist'],
      });

      const evaluation = manager.evaluateFlag('flag-eval', 'user-whitelist');
      expect(evaluation.enabled).toBe(true);
      expect(evaluation.reason).toContain('whitelisted');
    });

    it('should respect blacklist', () => {
      manager.updateFlag('flag-eval', {
        blacklistedUsers: ['user-blacklist'],
      });

      const evaluation = manager.evaluateFlag('flag-eval', 'user-blacklist');
      expect(evaluation.enabled).toBe(false);
      expect(evaluation.reason).toContain('blacklisted');
    });

    it('should respect rollout percentage', () => {
      manager.updateFlag('flag-eval', {
        rolloutPercentage: 0,
      });

      const evaluation = manager.evaluateFlag('flag-eval', 'user-test');
      expect(evaluation.enabled).toBe(false);
    });
  });

  describe('Gradual Rollout', () => {
    beforeEach(() => {
      manager.createFlag({
        id: 'flag-gradual',
        name: 'Gradual Rollout Test',
        description: '',
        status: 'active',
        enabled: true,
        rolloutPercentage: 0,
        rolloutStrategy: 'gradual',
        createdBy: 'test-user',
        metadata: {},
      });
    });

    it('should start gradual rollout', () => {
      manager.startGradualRollout({
        flagId: 'flag-gradual',
        startPercentage: 10,
        targetPercentage: 100,
        incrementPercentage: 10,
        incrementInterval: 100, // 100ms for testing
      });

      const flag = manager.getFlag('flag-gradual');
      expect(flag?.rolloutPercentage).toBe(10);
    });

    it('should pause and resume gradual rollout', () => {
      manager.startGradualRollout({
        flagId: 'flag-gradual',
        startPercentage: 10,
        targetPercentage: 100,
        incrementPercentage: 10,
        incrementInterval: 1000,
      });

      manager.pauseGradualRollout('flag-gradual');
      manager.resumeGradualRollout('flag-gradual');

      // Should not throw
      expect(true).toBe(true);
    });
  });
});

describe('Experiment Analytics', () => {
  let analytics: ExperimentAnalytics;

  beforeEach(() => {
    analytics = new ExperimentAnalytics();
  });

  describe('Statistical Tests', () => {
    it('should perform t-test', () => {
      const metricsA = {
        experimentId: 'exp-1',
        variantId: 'control',
        totalRequests: 1000,
        successfulRequests: 950,
        failedRequests: 50,
        averageLatency: 100,
        averageCost: 0.01,
        conversionRate: 0.10,
        lastUpdated: Date.now(),
      };

      const metricsB = {
        experimentId: 'exp-1',
        variantId: 'treatment',
        totalRequests: 1000,
        successfulRequests: 960,
        failedRequests: 40,
        averageLatency: 90,
        averageCost: 0.009,
        conversionRate: 0.12,
        lastUpdated: Date.now(),
      };

      const test = analytics.performTTest(metricsA, metricsB, 'conversionRate', 0.95);
      
      expect(test.variantA).toBe('control');
      expect(test.variantB).toBe('treatment');
      expect(test.pValue).toBeGreaterThanOrEqual(0);
      expect(test.pValue).toBeLessThanOrEqual(1);
      expect(typeof test.significant).toBe('boolean');
    });

    it('should calculate confidence interval', () => {
      const metrics = {
        experimentId: 'exp-1',
        variantId: 'control',
        totalRequests: 1000,
        successfulRequests: 950,
        failedRequests: 50,
        averageLatency: 100,
        averageCost: 0.01,
        conversionRate: 0.10,
        lastUpdated: Date.now(),
      };

      const ci = analytics.calculateConfidenceInterval(metrics, 'conversionRate', 0.95);
      
      expect(ci.variantId).toBe('control');
      expect(ci.mean).toBe(0.10);
      expect(ci.lower).toBeLessThan(ci.mean);
      expect(ci.upper).toBeGreaterThan(ci.mean);
    });
  });

  describe('Winner Determination', () => {
    it('should determine winner with sufficient data', () => {
      const allMetrics = [
        {
          experimentId: 'exp-1',
          variantId: 'control',
          totalRequests: 1000,
          successfulRequests: 950,
          failedRequests: 50,
          averageLatency: 100,
          averageCost: 0.01,
          conversionRate: 0.10,
          lastUpdated: Date.now(),
        },
        {
          experimentId: 'exp-1',
          variantId: 'treatment',
          totalRequests: 1000,
          successfulRequests: 960,
          failedRequests: 40,
          averageLatency: 90,
          averageCost: 0.009,
          conversionRate: 0.15,
          lastUpdated: Date.now(),
        },
      ];

      const winner = analytics.determineWinner(allMetrics, 'conversionRate', 0.95, 100);
      
      expect(winner.experimentId).toBe('exp-1');
      expect(['control', 'treatment', null]).toContain(winner.winner);
      expect(winner.confidence).toBeGreaterThanOrEqual(0);
      expect(winner.confidence).toBeLessThanOrEqual(1);
    });

    it('should require minimum sample size', () => {
      const allMetrics = [
        {
          experimentId: 'exp-1',
          variantId: 'control',
          totalRequests: 50,
          successfulRequests: 45,
          failedRequests: 5,
          averageLatency: 100,
          averageCost: 0.01,
          conversionRate: 0.10,
          lastUpdated: Date.now(),
        },
        {
          experimentId: 'exp-1',
          variantId: 'treatment',
          totalRequests: 50,
          successfulRequests: 48,
          failedRequests: 2,
          averageLatency: 90,
          averageCost: 0.009,
          conversionRate: 0.12,
          lastUpdated: Date.now(),
        },
      ];

      const winner = analytics.determineWinner(allMetrics, 'conversionRate', 0.95, 100);

      expect(winner.winner).toBeNull();
      expect(winner.reason).toContain('Insufficient samples');
    });
  });

  describe('Sample Size Calculation', () => {
    it('should calculate required sample size', () => {
      const sampleSize = analytics.calculateRequiredSampleSize(0.10, 0.20, 0.95, 0.80);
      
      expect(sampleSize).toBeGreaterThan(0);
      expect(Number.isInteger(sampleSize)).toBe(true);
    });
  });
});

describe('Traffic Splitter', () => {
  let splitter: TrafficSplitter;

  beforeEach(() => {
    splitter = new TrafficSplitter();
  });

  describe('Split Creation', () => {
    it('should create a traffic split', () => {
      const split = splitter.createSplit({
        id: 'split-1',
        name: 'Test Split',
        algorithm: 'consistent-hash',
        buckets: [
          { id: 'bucket-a', name: 'Bucket A', weight: 0.5, config: {}, enabled: true },
          { id: 'bucket-b', name: 'Bucket B', weight: 0.5, config: {}, enabled: true },
        ],
        enabled: true,
        stickySession: true,
      });

      expect(split.id).toBe('split-1');
      expect(split.buckets).toHaveLength(2);
    });

    it('should reject invalid weights', () => {
      expect(() => {
        splitter.createSplit({
          id: 'split-2',
          name: 'Invalid Split',
          algorithm: 'consistent-hash',
          buckets: [
            { id: 'bucket-a', name: 'Bucket A', weight: 0.6, config: {}, enabled: true },
            { id: 'bucket-b', name: 'Bucket B', weight: 0.6, config: {}, enabled: true },
          ],
          enabled: true,
          stickySession: false,
        });
      }).toThrow('Bucket weights must sum to 1.0');
    });
  });

  describe('Traffic Splitting', () => {
    beforeEach(() => {
      splitter.createSplit({
        id: 'split-test',
        name: 'Test Split',
        algorithm: 'consistent-hash',
        buckets: [
          { id: 'bucket-a', name: 'Bucket A', weight: 0.5, config: {}, enabled: true },
          { id: 'bucket-b', name: 'Bucket B', weight: 0.5, config: {}, enabled: true },
        ],
        enabled: true,
        stickySession: true,
      });
    });

    it('should split traffic', () => {
      const result = splitter.split('split-test', 'user-1');
      
      expect(result).toBeDefined();
      expect(result?.splitId).toBe('split-test');
      expect(['bucket-a', 'bucket-b']).toContain(result?.bucketId);
    });

    it('should maintain sticky sessions', () => {
      const result1 = splitter.split('split-test', 'user-2');
      const result2 = splitter.split('split-test', 'user-2');
      
      expect(result1?.bucketId).toBe(result2?.bucketId);
    });

    it('should distribute traffic evenly', () => {
      const distribution: Record<string, number> = { 'bucket-a': 0, 'bucket-b': 0 };

      for (let i = 0; i < 1000; i++) {
        const result = splitter.split('split-test', `user-${i}`);
        if (result) {
          distribution[result.bucketId]++;
        }
      }

      // Check distribution is roughly 50/50 (within 10% tolerance)
      expect(distribution['bucket-a']).toBeGreaterThan(400);
      expect(distribution['bucket-a']).toBeLessThan(600);
      expect(distribution['bucket-b']).toBeGreaterThan(400);
      expect(distribution['bucket-b']).toBeLessThan(600);
    });
  });
});

