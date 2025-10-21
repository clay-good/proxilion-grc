/**
 * Workflow Orchestration Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowExecutor } from '../src/workflows/workflow-executor.js';
import { WorkflowTemplateManager } from '../src/workflows/workflow-template-manager.js';
import { WorkflowAnalyticsEngine } from '../src/workflows/workflow-analytics.js';
import { WorkflowVersionManager } from '../src/workflows/workflow-version-manager.js';
import {
  WorkflowDefinition,
  AIRequestStep,
  TransformStep,
  ConditionStep,
  ParallelStep,
  LoopStep,
  WaitStep,
} from '../src/workflows/workflow-types.js';

describe('Workflow Orchestration', () => {
  describe('WorkflowExecutor', () => {
    let executor: WorkflowExecutor;

    beforeEach(() => {
      executor = new WorkflowExecutor();
    });

    it('should execute a simple workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow-1',
        name: 'Simple Test Workflow',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'Wait Step',
            type: 'wait',
            config: {
              duration: 10,
            },
          } as WaitStep,
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].status).toBe('completed');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should execute workflow with dependencies', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow-2',
        name: 'Dependency Test',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'First Step',
            type: 'wait',
            config: { duration: 5 },
          } as WaitStep,
          {
            id: 'step2',
            name: 'Second Step',
            type: 'wait',
            dependsOn: ['step1'],
            config: { duration: 5 },
          } as WaitStep,
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].stepId).toBe('step1');
      expect(result.steps[1].stepId).toBe('step2');
    });

    it('should handle step failures', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow-3',
        name: 'Failure Test',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'Failing Step',
            type: 'custom',
            config: {
              function: 'nonexistent',
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('failed');
      expect(result.steps[0].status).toBe('failed');
      expect(result.steps[0].error).toBeDefined();
    });

    it('should retry failed steps', async () => {
      let attempts = 0;
      executor.registerFunction('flaky', () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true };
      });

      const workflow: WorkflowDefinition = {
        id: 'test-workflow-4',
        name: 'Retry Test',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'Flaky Step',
            type: 'custom',
            config: {
              function: 'flaky',
            },
            retryPolicy: {
              maxRetries: 3,
              retryDelay: 10,
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[0].retries).toBe(2);
      expect(attempts).toBe(3);
    });

    it('should execute workflow in dry run mode', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow-5',
        name: 'Dry Run Test',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'Test Step',
            type: 'wait',
            config: { duration: 100 },
          } as WaitStep,
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow, { dryRun: true });

      expect(result.status).toBe('completed');
      expect(result.metadata?.dryRun).toBe(true);
      expect(result.duration).toBeLessThan(50);  // Should be fast
    });

    it('should timeout long-running workflows', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow-6',
        name: 'Timeout Test',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'Long Step',
            type: 'wait',
            config: { duration: 5000 },
          } as WaitStep,
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow, { timeout: 100 });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('timeout');
    });

    it('should register and execute custom functions', async () => {
      executor.registerFunction('multiply', (args: any) => {
        return { result: args.a * args.b };
      });

      const workflow: WorkflowDefinition = {
        id: 'test-workflow-7',
        name: 'Custom Function Test',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [
          {
            id: 'step1',
            name: 'Multiply',
            type: 'custom',
            config: {
              function: 'multiply',
              args: { a: 5, b: 3 },
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await executor.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.steps[0].output.result).toBe(15);
    });
  });

  describe('WorkflowTemplateManager', () => {
    let manager: WorkflowTemplateManager;

    beforeEach(() => {
      manager = new WorkflowTemplateManager();
    });

    it('should load default templates', () => {
      const templates = manager.listTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should get template by ID', () => {
      const template = manager.getTemplate('content-summarization');
      expect(template).toBeDefined();
      expect(template?.name).toBe('Content Summarization Pipeline');
    });

    it('should list templates by category', () => {
      const contentTemplates = manager.listTemplates('content');
      expect(contentTemplates.length).toBeGreaterThan(0);
      expect(contentTemplates.every(t => t.category === 'content')).toBe(true);
    });

    it('should search templates by tags', () => {
      const templates = manager.searchByTags(['translation']);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.tags?.includes('translation'))).toBe(true);
    });

    it('should instantiate template with parameters', () => {
      const workflow = manager.instantiate('content-summarization', {
        url: 'https://example.com',
        length: 200,
        num_points: 5,
      });

      expect(workflow).toBeDefined();
      expect(workflow.variables?.url).toBe('https://example.com');
      expect(workflow.variables?.length).toBe(200);
      expect(workflow.metadata?.templateId).toBe('content-summarization');
    });

    it('should validate required parameters', () => {
      expect(() => {
        manager.instantiate('content-summarization', {
          length: 200,  // Missing required 'url'
        });
      }).toThrow('Required parameter missing: url');
    });

    it('should use default parameter values', () => {
      const workflow = manager.instantiate('content-summarization', {
        url: 'https://example.com',
      });

      expect(workflow.variables?.length).toBe(100);  // Default value
      expect(workflow.variables?.num_points).toBe(5);  // Default value
    });

    it('should validate parameter types', () => {
      expect(() => {
        manager.instantiate('content-summarization', {
          url: 123,  // Wrong type, should be string
        });
      }).toThrow('wrong type');
    });

    it('should get template statistics', () => {
      const stats = manager.getStats();
      expect(stats.totalTemplates).toBeGreaterThan(0);
      expect(stats.byCategory).toBeDefined();
      expect(stats.byTags).toBeDefined();
    });
  });

  describe('WorkflowAnalyticsEngine', () => {
    let analytics: WorkflowAnalyticsEngine;

    beforeEach(() => {
      analytics = new WorkflowAnalyticsEngine();
    });

    it('should record workflow execution', () => {
      const result = {
        workflowId: 'test-workflow',
        executionId: 'exec-1',
        status: 'completed' as const,
        steps: [
          {
            stepId: 'step1',
            status: 'completed' as const,
            startTime: Date.now(),
            endTime: Date.now() + 100,
            duration: 100,
            retries: 0,
          },
        ],
        startTime: Date.now(),
        endTime: Date.now() + 100,
        duration: 100,
        context: {
          workflowId: 'test-workflow',
          executionId: 'exec-1',
          variables: {},
          stepOutputs: {},
          metadata: {},
          startTime: Date.now(),
        },
      };

      analytics.recordExecution(result);

      const metrics = analytics.getWorkflowMetrics('test-workflow');
      expect(metrics).toBeDefined();
      expect(metrics?.totalExecutions).toBe(1);
      expect(metrics?.successfulExecutions).toBe(1);
    });

    it('should calculate workflow metrics', () => {
      // Record multiple executions
      for (let i = 0; i < 5; i++) {
        analytics.recordExecution({
          workflowId: 'test-workflow',
          executionId: `exec-${i}`,
          status: i < 4 ? 'completed' : 'failed',
          steps: [],
          startTime: Date.now(),
          endTime: Date.now() + 100 * (i + 1),
          duration: 100 * (i + 1),
          context: {
            workflowId: 'test-workflow',
            executionId: `exec-${i}`,
            variables: {},
            stepOutputs: {},
            metadata: {},
            startTime: Date.now(),
          },
        });
      }

      const metrics = analytics.getWorkflowMetrics('test-workflow');
      expect(metrics?.totalExecutions).toBe(5);
      expect(metrics?.successfulExecutions).toBe(4);
      expect(metrics?.failedExecutions).toBe(1);
      expect(metrics?.averageDuration).toBeGreaterThan(0);
    });

    it('should get overall analytics', () => {
      // Record some executions
      analytics.recordExecution({
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        status: 'completed',
        steps: [],
        startTime: Date.now(),
        endTime: Date.now() + 100,
        duration: 100,
        context: {
          workflowId: 'workflow-1',
          executionId: 'exec-1',
          variables: {},
          stepOutputs: {},
          metadata: {},
          startTime: Date.now(),
        },
      });

      const overallAnalytics = analytics.getAnalytics();
      expect(overallAnalytics.totalWorkflows).toBe(1);
      expect(overallAnalytics.totalExecutions).toBe(1);
      expect(overallAnalytics.successRate).toBe(1);
    });
  });

  describe('WorkflowVersionManager', () => {
    let versionManager: WorkflowVersionManager;

    beforeEach(() => {
      versionManager = new WorkflowVersionManager();
    });

    it('should create a new version', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const version = versionManager.createVersion(workflow, 'Initial version');

      expect(version).toBeDefined();
      expect(version.workflowId).toBe('test-workflow');
      expect(version.version).toBe('1.0.0');
      expect(version.changelog).toBe('Initial version');
    });

    it('should get latest version', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      versionManager.createVersion(workflow, 'Version 1');
      versionManager.createVersion({ ...workflow, version: '1.0.1' }, 'Version 2');

      const latest = versionManager.getLatestVersion('test-workflow');
      expect(latest?.version).toBe('1.0.1');
    });

    it('should rollback to previous version', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const v1 = versionManager.createVersion(workflow, 'Version 1');
      versionManager.createVersion({ ...workflow, version: '1.0.1' }, 'Version 2');

      const rolledBack = versionManager.rollback('test-workflow', v1.versionId);
      expect(rolledBack.changelog).toContain('Rolled back');
    });

    it('should tag versions', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const version = versionManager.createVersion(workflow);
      versionManager.tagVersion(version.versionId, 'production');

      const tagged = versionManager.getVersionsByTag('test-workflow', 'production');
      expect(tagged).toHaveLength(1);
      expect(tagged[0].versionId).toBe(version.versionId);
    });

    it('should get version history', () => {
      const workflow: WorkflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        version: '1.0.0',
        entryPoint: 'step1',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      versionManager.createVersion(workflow, 'Version 1');
      versionManager.createVersion({ ...workflow, version: '1.0.1' }, 'Version 2');
      versionManager.createVersion({ ...workflow, version: '1.0.2' }, 'Version 3');

      const history = versionManager.getHistory('test-workflow');
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe('1.0.0');
      expect(history[2].version).toBe('1.0.2');
    });
  });
});

