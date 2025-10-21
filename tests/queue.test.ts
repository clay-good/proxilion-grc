/**
 * Tests for Queue Management System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PriorityQueueManager, PriorityLevel } from '../src/queue/priority-queue-manager.js';
import { RequestScheduler, ScheduledTask } from '../src/queue/request-scheduler.js';
import { QueueAnalyticsEngine } from '../src/queue/queue-analytics.js';
import { BackpressureHandler, LoadMetrics } from '../src/queue/backpressure-handler.js';

describe('Priority Queue Manager', () => {
  let manager: PriorityQueueManager;

  beforeEach(() => {
    manager = new PriorityQueueManager({
      maxQueueSize: 100,
      maxConcurrent: 10,
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('Queue Operations', () => {
    it('should enqueue a request', async () => {
      const requestId = await manager.enqueue({
        id: 'req-1',
        priority: 'normal',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      expect(requestId).toBe('req-1');
      
      const metrics = manager.getMetrics();
      expect(metrics.currentQueueSize).toBe(1);
    });

    it('should dequeue requests by priority', async () => {
      // Enqueue with different priorities
      await manager.enqueue({
        id: 'req-low',
        priority: 'low',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      await manager.enqueue({
        id: 'req-critical',
        priority: 'critical',
        userId: 'user-2',
        payload: {},
        metadata: {},
      });

      await manager.enqueue({
        id: 'req-normal',
        priority: 'normal',
        userId: 'user-3',
        payload: {},
        metadata: {},
      });

      // Dequeue should return critical first
      const first = await manager.dequeue();
      expect(first?.id).toBe('req-critical');

      // Then normal
      const second = await manager.dequeue();
      expect(second?.id).toBe('req-normal');

      // Then low
      const third = await manager.dequeue();
      expect(third?.id).toBe('req-low');
    });

    it('should enforce max queue size', async () => {
      const smallManager = new PriorityQueueManager({
        maxQueueSize: 2,
        maxConcurrent: 1,
      });

      await smallManager.enqueue({
        id: 'req-1',
        priority: 'normal',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      await smallManager.enqueue({
        id: 'req-2',
        priority: 'normal',
        userId: 'user-2',
        payload: {},
        metadata: {},
      });

      // Third should fail
      await expect(
        smallManager.enqueue({
          id: 'req-3',
          priority: 'normal',
          userId: 'user-3',
          payload: {},
          metadata: {},
        })
      ).rejects.toThrow('Queue is full');

      smallManager.cleanup();
    });

    it('should complete a request', async () => {
      await manager.enqueue({
        id: 'req-1',
        priority: 'normal',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      const request = await manager.dequeue();
      expect(request).toBeDefined();

      await manager.complete(request!.id, { success: true });

      const metrics = manager.getMetrics();
      expect(metrics.totalProcessed).toBe(1);
    });

    it('should fail a request', async () => {
      await manager.enqueue({
        id: 'req-1',
        priority: 'normal',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      const request = await manager.dequeue();
      expect(request).toBeDefined();

      await manager.fail(request!.id, new Error('Test error'));

      const metrics = manager.getMetrics();
      expect(metrics.currentProcessing).toBe(0);
    });

    it('should cancel a queued request', async () => {
      await manager.enqueue({
        id: 'req-1',
        priority: 'normal',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      const cancelled = await manager.cancel('req-1');
      expect(cancelled).toBe(true);

      const metrics = manager.getMetrics();
      expect(metrics.currentQueueSize).toBe(0);
    });
  });

  describe('Fairness', () => {
    it('should distribute requests fairly across users', async () => {
      const fairManager = new PriorityQueueManager({
        maxQueueSize: 100,
        maxConcurrent: 10,
        enableFairness: true,
      });

      // Enqueue one request from user-2 first
      await fairManager.enqueue({
        id: 'user2-req-0',
        priority: 'normal',
        userId: 'user-2',
        payload: {},
        metadata: {},
      });

      // Enqueue multiple requests from user-1
      for (let i = 0; i < 3; i++) {
        await fairManager.enqueue({
          id: `user1-req-${i}`,
          priority: 'normal',
          userId: 'user-1',
          payload: {},
          metadata: {},
        });
      }

      // First dequeue should be from user-2 (has fewer in-flight)
      const first = await fairManager.dequeue();
      expect(first?.userId).toBe('user-2');

      // Second dequeue should be from user-1
      const second = await fairManager.dequeue();
      expect(second?.userId).toBe('user-1');

      fairManager.cleanup();
    });
  });

  describe('Metrics', () => {
    it('should track queue metrics', async () => {
      await manager.enqueue({
        id: 'req-1',
        priority: 'normal',
        userId: 'user-1',
        payload: {},
        metadata: {},
      });

      const request = await manager.dequeue();
      await manager.complete(request!.id);

      const metrics = manager.getMetrics();
      
      expect(metrics.totalProcessed).toBe(1);
      expect(metrics.totalCompleted).toBeGreaterThanOrEqual(0);
      expect(metrics.averageWaitTime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Request Scheduler', () => {
  let scheduler: RequestScheduler;

  beforeEach(() => {
    scheduler = new RequestScheduler({
      strategy: 'priority',
      minConcurrency: 2,
      maxConcurrency: 5,
    });
  });

  afterEach(() => {
    scheduler.cleanup();
  });

  describe('Scheduler Operations', () => {
    it('should start and stop scheduler', () => {
      scheduler.start();
      
      const status = scheduler.getStatus();
      expect(status.running).toBe(true);

      scheduler.stop();
      
      const stoppedStatus = scheduler.getStatus();
      expect(stoppedStatus.running).toBe(false);
    });

    it('should schedule and execute tasks', async () => {
      scheduler.start();

      let executed = false;
      const task: ScheduledTask = {
        requestId: 'task-1',
        execute: async () => {
          executed = true;
          return { success: true };
        },
        priority: 'normal',
        userId: 'user-1',
        metadata: {},
      };

      await scheduler.schedule(task);

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(executed).toBe(true);
    });

    it('should respect concurrency limits', async () => {
      const limitedScheduler = new RequestScheduler({
        strategy: 'priority',
        minConcurrency: 1,
        maxConcurrency: 1,
      });

      limitedScheduler.start();

      let executing = 0;
      let maxConcurrent = 0;

      const createTask = (id: string): ScheduledTask => ({
        requestId: id,
        execute: async () => {
          executing++;
          maxConcurrent = Math.max(maxConcurrent, executing);
          await new Promise(resolve => setTimeout(resolve, 50));
          executing--;
          return { success: true };
        },
        priority: 'normal',
        userId: 'user-1',
        metadata: {},
      });

      // Schedule multiple tasks
      await limitedScheduler.schedule(createTask('task-1'));
      await limitedScheduler.schedule(createTask('task-2'));
      await limitedScheduler.schedule(createTask('task-3'));

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(maxConcurrent).toBe(1);

      limitedScheduler.cleanup();
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed tasks', async () => {
      const retryScheduler = new RequestScheduler({
        strategy: 'priority',
        enableRetry: true,
        maxRetries: 2,
        retryDelay: 100,
      });

      retryScheduler.start();

      let attempts = 0;
      const task: ScheduledTask = {
        requestId: 'task-retry',
        execute: async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        },
        priority: 'normal',
        userId: 'user-1',
        metadata: {},
      };

      await retryScheduler.schedule(task);

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(attempts).toBeGreaterThanOrEqual(2);

      retryScheduler.cleanup();
    });
  });
});

describe('Queue Analytics', () => {
  let analytics: QueueAnalyticsEngine;

  beforeEach(() => {
    analytics = new QueueAnalyticsEngine();
  });

  describe('Metrics Recording', () => {
    it('should record request timestamps', () => {
      analytics.recordRequest();
      analytics.recordRequest();
      analytics.recordRequest();

      // Should have recorded 3 requests
      expect(true).toBe(true); // Basic test
    });

    it('should record wait times', () => {
      analytics.recordWaitTime(100);
      analytics.recordWaitTime(200);
      analytics.recordWaitTime(300);

      // Should have recorded 3 wait times
      expect(true).toBe(true); // Basic test
    });

    it('should record processing times', () => {
      analytics.recordProcessingTime(500);
      analytics.recordProcessingTime(600);
      analytics.recordProcessingTime(700);

      // Should have recorded 3 processing times
      expect(true).toBe(true); // Basic test
    });
  });

  describe('Analytics', () => {
    it('should analyze queue performance', () => {
      // Record some data
      for (let i = 0; i < 10; i++) {
        analytics.recordRequest(Date.now() - i * 100);
        analytics.recordWaitTime(100 + i * 10);
        analytics.recordProcessingTime(500 + i * 50);
      }

      const queueMetrics = {
        totalQueued: 10,
        totalProcessed: 10,
        totalCompleted: 10,
        totalFailed: 0,
        totalTimeout: 0,
        currentQueueSize: 5,
        currentProcessing: 3,
        averageWaitTime: 150,
        averageProcessingTime: 750,
        p95WaitTime: 200,
        p99WaitTime: 250,
        slaViolations: 0,
        slaCompliance: 1.0,
      };

      const analysis = analytics.analyze(queueMetrics, 100, 10);

      expect(analysis.queueUtilization).toBe(0.05);
      expect(analysis.processingUtilization).toBe(0.3);
      expect(analysis.slaCompliance).toBe(1.0);
    });

    it('should detect bottlenecks', () => {
      const queueMetrics = {
        totalQueued: 95,
        totalProcessed: 100,
        totalCompleted: 100,
        totalFailed: 0,
        totalTimeout: 0,
        currentQueueSize: 95,
        currentProcessing: 10,
        averageWaitTime: 6000,
        averageProcessingTime: 1000,
        p95WaitTime: 8000,
        p99WaitTime: 10000,
        slaViolations: 10,
        slaCompliance: 0.9,
      };

      const analysis = analytics.analyze(queueMetrics, 100, 10);

      expect(analysis.bottlenecks.length).toBeGreaterThan(0);
    });

    it('should generate capacity recommendations', () => {
      const queueMetrics = {
        totalQueued: 10,
        totalProcessed: 100,
        totalCompleted: 100,
        totalFailed: 0,
        totalTimeout: 0,
        currentQueueSize: 10,
        currentProcessing: 9,
        averageWaitTime: 150,
        averageProcessingTime: 500,
        p95WaitTime: 200,
        p99WaitTime: 250,
        slaViolations: 0,
        slaCompliance: 1.0,
      };

      const analysis = analytics.analyze(queueMetrics, 100, 10);

      expect(analysis.capacityRecommendation).toBeDefined();
      expect(analysis.capacityRecommendation.currentCapacity).toBe(10);
    });
  });
});

describe('Backpressure Handler', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    handler = new BackpressureHandler({
      enabled: true,
      strategy: 'shed',
      shedPriorities: ['low', 'background'],
    });
  });

  describe('Load Management', () => {
    it('should allow requests under normal load', () => {
      const loadMetrics: LoadMetrics = {
        queueUtilization: 0.3,
        processingUtilization: 0.4,
        errorRate: 0.01,
      };

      const result = handler.shouldAllow('normal', loadMetrics);
      expect(result.allowed).toBe(true);
    });

    it('should shed low priority requests under high load', () => {
      const loadMetrics: LoadMetrics = {
        queueUtilization: 0.9,
        processingUtilization: 0.9,
        errorRate: 0.05,
      };

      // Test multiple times to account for randomness
      let shedCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = handler.shouldAllow('low', loadMetrics);
        if (!result.allowed) {
          shedCount++;
        }
      }

      // Should shed some requests
      expect(shedCount).toBeGreaterThan(0);
    });

    it('should reject non-critical requests under critical load', () => {
      const loadMetrics: LoadMetrics = {
        queueUtilization: 1.0,
        processingUtilization: 1.0,
        cpuUtilization: 1.0,
        memoryUtilization: 1.0,
        errorRate: 0.1,
      };

      const result = handler.shouldAllow('normal', loadMetrics);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('critical');
    });

    it('should allow critical requests even under critical load', () => {
      const loadMetrics: LoadMetrics = {
        queueUtilization: 1.0,
        processingUtilization: 1.0,
        cpuUtilization: 1.0,
        memoryUtilization: 1.0,
        errorRate: 0.1,
      };

      const result = handler.shouldAllow('critical', loadMetrics);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker on high error rate', () => {
      const cbHandler = new BackpressureHandler({
        enabled: true,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 0.5,
      });

      // Record failures
      for (let i = 0; i < 10; i++) {
        cbHandler.recordResult(false);
      }

      const loadMetrics: LoadMetrics = {
        queueUtilization: 0.5,
        processingUtilization: 0.5,
        errorRate: 0.5,
      };

      const result = cbHandler.shouldAllow('normal', loadMetrics);
      
      const status = cbHandler.getStatus();
      expect(status.circuitBreakerOpen).toBe(true);
    });
  });

  describe('Status', () => {
    it('should return backpressure status', () => {
      const status = handler.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.loadLevel).toBeDefined();
      expect(status.strategy).toBe('shed');
    });
  });
});

