/**
 * Cost Tracker Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../src/cost/cost-tracker.js';

describe('CostTracker', () => {
  let costTracker: CostTracker;

  beforeEach(() => {
    costTracker = new CostTracker();
  });

  describe('Cost Tracking', () => {
    it('should track cost for OpenAI GPT-4', () => {
      const entry = costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'test-1',
      });

      expect(entry.provider).toBe('openai');
      expect(entry.model).toBe('gpt-4');
      expect(entry.inputTokens).toBe(1000);
      expect(entry.outputTokens).toBe(500);
      expect(entry.inputCost).toBeCloseTo(0.03, 4); // 1000 / 1M * 30
      expect(entry.outputCost).toBeCloseTo(0.03, 4); // 500 / 1M * 60
      expect(entry.totalCost).toBeCloseTo(0.06, 4);
    });

    it('should track cost for Anthropic Claude', () => {
      const entry = costTracker.trackCost({
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 2000,
        outputTokens: 1000,
        requestId: 'test-2',
      });

      expect(entry.provider).toBe('anthropic');
      expect(entry.model).toBe('claude-3-sonnet');
      expect(entry.inputCost).toBeCloseTo(0.006, 4); // 2000 / 1M * 3
      expect(entry.outputCost).toBeCloseTo(0.015, 4); // 1000 / 1M * 15
      expect(entry.totalCost).toBeCloseTo(0.021, 4);
    });

    it('should handle unknown models gracefully', () => {
      const entry = costTracker.trackCost({
        provider: 'openai',
        model: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'test-3',
      });

      expect(entry.totalCost).toBe(0);
    });

    it('should track user and tenant information', () => {
      const entry = costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        userId: 'user-123',
        tenantId: 'tenant-456',
        requestId: 'test-4',
      });

      expect(entry.userId).toBe('user-123');
      expect(entry.tenantId).toBe('tenant-456');
    });

    it('should track cached requests', () => {
      const entry = costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'test-5',
        cached: true,
      });

      expect(entry.cached).toBe(true);
    });
  });

  describe('Cost Summary', () => {
    beforeEach(() => {
      // Add some test data
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        userId: 'user-1',
        requestId: 'req-1',
      });

      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokens: 2000,
        outputTokens: 1000,
        userId: 'user-1',
        requestId: 'req-2',
      });

      costTracker.trackCost({
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        inputTokens: 1500,
        outputTokens: 750,
        userId: 'user-2',
        requestId: 'req-3',
      });
    });

    it('should calculate total cost summary', () => {
      const summary = costTracker.getCostSummary();

      expect(summary.totalRequests).toBe(3);
      expect(summary.totalInputTokens).toBe(4500);
      expect(summary.totalOutputTokens).toBe(2250);
      expect(summary.totalCost).toBeGreaterThan(0);
    });

    it('should filter by user', () => {
      const summary = costTracker.getCostSummary({ userId: 'user-1' });

      expect(summary.totalRequests).toBe(2);
      expect(summary.totalInputTokens).toBe(3000);
    });

    it('should filter by provider', () => {
      const summary = costTracker.getCostSummary({ provider: 'openai' });

      expect(summary.totalRequests).toBe(2);
      expect(summary.byProvider['openai']).toBeGreaterThan(0);
    });

    it('should calculate cost by model', () => {
      const summary = costTracker.getCostSummary();

      expect(summary.byModel['gpt-4']).toBeGreaterThan(0);
      expect(summary.byModel['gpt-3.5-turbo']).toBeGreaterThan(0);
      expect(summary.byModel['claude-3-sonnet']).toBeGreaterThan(0);
    });
  });

  describe('Budget Limits', () => {
    it('should add budget limit', () => {
      costTracker.addBudgetLimit({
        id: 'budget-1',
        name: 'Daily Limit',
        scope: 'global',
        limit: 100,
        period: 'daily',
        alertThreshold: 80,
        enabled: true,
      });

      const budgets = costTracker.getBudgetLimits();
      expect(budgets).toHaveLength(1);
      expect(budgets[0].id).toBe('budget-1');
    });

    it('should remove budget limit', () => {
      costTracker.addBudgetLimit({
        id: 'budget-1',
        name: 'Daily Limit',
        scope: 'global',
        limit: 100,
        period: 'daily',
        alertThreshold: 80,
        enabled: true,
      });

      costTracker.removeBudgetLimit('budget-1');

      const budgets = costTracker.getBudgetLimits();
      expect(budgets).toHaveLength(0);
    });

    it('should check budget limits', () => {
      // Add budget limit
      costTracker.addBudgetLimit({
        id: 'budget-1',
        name: 'Daily Limit',
        scope: 'global',
        limit: 0.1, // Very low limit for testing
        period: 'daily',
        alertThreshold: 50,
        enabled: true,
      });

      // Add some costs
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      const statuses = costTracker.checkBudgetLimits();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].exceeded).toBe(false);
    });

    it('should detect exceeded budget', () => {
      // Add budget limit
      costTracker.addBudgetLimit({
        id: 'budget-1',
        name: 'Daily Limit',
        scope: 'global',
        limit: 0.01, // Very low limit
        period: 'daily',
        alertThreshold: 50,
        enabled: true,
      });

      // Add costs that exceed limit
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 10000,
        outputTokens: 5000,
        requestId: 'req-1',
      });

      const statuses = costTracker.checkBudgetLimits();
      expect(statuses[0].exceeded).toBe(true);
    });

    it('should check user-specific budget', () => {
      costTracker.addBudgetLimit({
        id: 'budget-1',
        name: 'User Budget',
        scope: 'user',
        scopeId: 'user-1',
        limit: 100,
        period: 'daily',
        alertThreshold: 80,
        enabled: true,
      });

      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        userId: 'user-1',
        requestId: 'req-1',
      });

      const statuses = costTracker.checkBudgetLimits('user-1');
      expect(statuses).toHaveLength(1);
    });
  });

  describe('Custom Pricing', () => {
    it('should add custom pricing', () => {
      costTracker.addPricing({
        provider: 'openai',
        model: 'custom-model',
        inputTokenPrice: 10.0,
        outputTokenPrice: 20.0,
      });

      const entry = costTracker.trackCost({
        provider: 'openai',
        model: 'custom-model',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'test-1',
      });

      expect(entry.inputCost).toBeCloseTo(0.01, 4);
      expect(entry.outputCost).toBeCloseTo(0.01, 4);
      expect(entry.totalCost).toBeCloseTo(0.02, 4);
    });
  });

  describe('Data Management', () => {
    it('should get cost entries', () => {
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      const entries = costTracker.getCostEntries();
      expect(entries).toHaveLength(1);
    });

    it('should limit cost entries', () => {
      for (let i = 0; i < 10; i++) {
        costTracker.trackCost({
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: 1000,
          outputTokens: 500,
          requestId: `req-${i}`,
        });
      }

      const entries = costTracker.getCostEntries(5);
      expect(entries).toHaveLength(5);
    });

    it('should clear old entries', () => {
      costTracker.trackCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        requestId: 'req-1',
      });

      const futureTime = Date.now() + 1000000;
      const removed = costTracker.clearOldEntries(futureTime);

      expect(removed).toBe(1);
      expect(costTracker.getCostEntries()).toHaveLength(0);
    });
  });
});

