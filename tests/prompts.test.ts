/**
 * Tests for Prompt Management & Version Control System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptVersionManager } from '../src/prompts/prompt-version-manager.js';
import { PromptTemplateEngine } from '../src/prompts/prompt-template-engine.js';
import { PromptLibrary } from '../src/prompts/prompt-library.js';
import { PromptAnalytics } from '../src/prompts/prompt-analytics.js';
import { PromptOptimizer } from '../src/prompts/prompt-optimizer.js';

describe('Prompt Version Manager', () => {
  let manager: PromptVersionManager;

  beforeEach(() => {
    manager = new PromptVersionManager();
  });

  describe('Version Creation', () => {
    it('should create a new version', () => {
      const version = manager.createVersion({
        promptId: 'prompt-1',
        content: 'You are a helpful assistant. Answer: {{question}}',
        author: 'user-1',
        message: 'Initial version',
        tags: ['assistant', 'qa'],
        status: 'draft',
      });

      expect(version).toBeDefined();
      expect(version.version).toBe(1);
      expect(version.variables).toEqual(['question']);
      expect(version.status).toBe('draft');
    });

    it('should increment version numbers', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
      });

      const version2 = manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 2',
        author: 'user-1',
        message: 'Second',
      });

      expect(version2.version).toBe(2);
    });

    it('should extract variables from content', () => {
      const version = manager.createVersion({
        promptId: 'prompt-1',
        content: 'Hello {{name}}, your age is {{age}}',
        author: 'user-1',
        message: 'Test',
      });

      expect(version.variables).toEqual(['name', 'age']);
    });
  });

  describe('Version Retrieval', () => {
    it('should get version by number', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
      });

      const version = manager.getVersion('prompt-1', 1);
      expect(version).toBeDefined();
      expect(version?.version).toBe(1);
    });

    it('should get all versions', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
      });

      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 2',
        author: 'user-1',
        message: 'Second',
      });

      const versions = manager.getVersions('prompt-1');
      expect(versions.length).toBe(2);
    });

    it('should get active version', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
        status: 'active',
      });

      const active = manager.getActiveVersion('prompt-1');
      expect(active).toBeDefined();
      expect(active?.version).toBe(1);
    });
  });

  describe('Version Management', () => {
    it('should set active version', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
      });

      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 2',
        author: 'user-1',
        message: 'Second',
      });

      const success = manager.setActiveVersion('prompt-1', 2);
      expect(success).toBe(true);

      const active = manager.getActiveVersion('prompt-1');
      expect(active?.version).toBe(2);
    });

    it('should rollback to previous version', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
      });

      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 2',
        author: 'user-1',
        message: 'Second',
      });

      const rollback = manager.rollback('prompt-1', 1, 'user-1', 'Rollback to v1');
      expect(rollback).toBeDefined();
      expect(rollback?.version).toBe(3);
      expect(rollback?.content).toBe('Version 1');
      expect(rollback?.tags).toContain('rollback');
    });

    it('should calculate diff between versions', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Line 1\nLine 2\nLine 3',
        author: 'user-1',
        message: 'First',
      });

      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Line 1\nLine 2 modified\nLine 3\nLine 4',
        author: 'user-1',
        message: 'Second',
      });

      const diff = manager.diff('prompt-1', 1, 2);
      expect(diff).toBeDefined();
      expect(diff?.changes.length).toBeGreaterThan(0);
    });
  });

  describe('Branching', () => {
    it('should create a branch', () => {
      const version = manager.createVersion({
        promptId: 'prompt-1',
        content: 'Main version',
        author: 'user-1',
        message: 'Main',
      });

      const branch = manager.createBranch({
        promptId: 'prompt-1',
        name: 'feature-branch',
        baseVersionId: version.id,
        createdBy: 'user-1',
      });

      expect(branch).toBeDefined();
      expect(branch.name).toBe('feature-branch');
      expect(branch.status).toBe('active');
    });

    it('should get branches', () => {
      const version = manager.createVersion({
        promptId: 'prompt-1',
        content: 'Main version',
        author: 'user-1',
        message: 'Main',
      });

      manager.createBranch({
        promptId: 'prompt-1',
        name: 'branch-1',
        baseVersionId: version.id,
        createdBy: 'user-1',
      });

      const branches = manager.getBranches('prompt-1');
      expect(branches.length).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should get version statistics', () => {
      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 1',
        author: 'user-1',
        message: 'First',
      });

      manager.createVersion({
        promptId: 'prompt-1',
        content: 'Version 2',
        author: 'user-2',
        message: 'Second',
      });

      const stats = manager.getStats('prompt-1');
      expect(stats.totalVersions).toBe(2);
      expect(stats.authors).toEqual(['user-1', 'user-2']);
    });
  });
});

describe('Prompt Template Engine', () => {
  let engine: PromptTemplateEngine;

  beforeEach(() => {
    engine = new PromptTemplateEngine();
  });

  describe('Template Registration', () => {
    it('should register a template', () => {
      const template = engine.registerTemplate({
        name: 'Test Template',
        description: 'A test template',
        content: 'Hello {{name}}',
        variables: [
          { name: 'name', type: 'string', required: true },
        ],
        category: 'test',
        tags: ['test'],
        author: 'user-1',
      });

      expect(template).toBeDefined();
      expect(template.name).toBe('Test Template');
    });
  });

  describe('Template Rendering', () => {
    it('should render template with variables', () => {
      const template = engine.registerTemplate({
        name: 'Greeting',
        description: 'Greeting template',
        content: 'Hello {{name}}, you are {{age}} years old',
        variables: [
          { name: 'name', type: 'string', required: true },
          { name: 'age', type: 'number', required: true },
        ],
        category: 'test',
        tags: [],
        author: 'user-1',
      });

      const result = engine.render(template.id, {
        name: 'Alice',
        age: 30,
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello Alice, you are 30 years old');
    });

    it('should use default values', () => {
      const template = engine.registerTemplate({
        name: 'Greeting',
        description: 'Greeting template',
        content: 'Hello {{name}}',
        variables: [
          { name: 'name', type: 'string', required: false, defaultValue: 'World' },
        ],
        category: 'test',
        tags: [],
        author: 'user-1',
      });

      const result = engine.render(template.id, {});

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello World');
    });

    it('should validate required variables', () => {
      const template = engine.registerTemplate({
        name: 'Test',
        description: 'Test',
        content: 'Hello {{name}}',
        variables: [
          { name: 'name', type: 'string', required: true },
        ],
        category: 'test',
        tags: [],
        author: 'user-1',
      });

      const result = engine.render(template.id, {});

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Required variable missing');
    });

    it('should process conditionals', () => {
      const template = engine.registerTemplate({
        name: 'Conditional',
        description: 'Conditional template',
        content: 'Hello{{#if premium}} Premium User{{/if}}',
        variables: [
          { name: 'premium', type: 'boolean', required: false, defaultValue: false },
        ],
        category: 'test',
        tags: [],
        author: 'user-1',
      });

      const result1 = engine.render(template.id, { premium: true });
      expect(result1.content).toContain('Premium User');

      const result2 = engine.render(template.id, { premium: false });
      expect(result2.content).not.toContain('Premium User');
    });

    it('should process loops', () => {
      const template = engine.registerTemplate({
        name: 'Loop',
        description: 'Loop template',
        content: 'Items:{{#each items}}\n- {{this}}{{/each}}',
        variables: [
          { name: 'items', type: 'array', required: true },
        ],
        category: 'test',
        tags: [],
        author: 'user-1',
      });

      const result = engine.render(template.id, {
        items: ['Apple', 'Banana', 'Cherry'],
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('Apple');
      expect(result.content).toContain('Banana');
      expect(result.content).toContain('Cherry');
    });
  });

  describe('Template Search', () => {
    it('should search templates by category', () => {
      engine.registerTemplate({
        name: 'Template 1',
        description: 'Test',
        content: 'Content',
        variables: [],
        category: 'code',
        tags: [],
        author: 'user-1',
      });

      const results = engine.searchTemplates({ category: 'code' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search templates by tags', () => {
      engine.registerTemplate({
        name: 'Template 1',
        description: 'Test',
        content: 'Content',
        variables: [],
        category: 'test',
        tags: ['important'],
        author: 'user-1',
      });

      const results = engine.searchTemplates({ tags: ['important'] });
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

describe('Prompt Library', () => {
  let library: PromptLibrary;

  beforeEach(() => {
    library = new PromptLibrary();
  });

  describe('Prompt Management', () => {
    it('should create a prompt', () => {
      const prompt = library.createPrompt({
        name: 'Test Prompt',
        description: 'A test prompt',
        category: 'test',
        tags: ['test'],
        author: 'user-1',
        visibility: 'private',
        currentVersionId: 'version-1',
      });

      expect(prompt).toBeDefined();
      expect(prompt.name).toBe('Test Prompt');
    });

    it('should update a prompt', () => {
      const prompt = library.createPrompt({
        name: 'Test Prompt',
        description: 'Original',
        category: 'test',
        tags: [],
        author: 'user-1',
        visibility: 'private',
        currentVersionId: 'version-1',
      });

      const updated = library.updatePrompt(prompt.id, {
        description: 'Updated',
      });

      expect(updated?.description).toBe('Updated');
    });

    it('should delete a prompt', () => {
      const prompt = library.createPrompt({
        name: 'Test Prompt',
        description: 'Test',
        category: 'test',
        tags: [],
        author: 'user-1',
        visibility: 'private',
        currentVersionId: 'version-1',
      });

      const deleted = library.deletePrompt(prompt.id);
      expect(deleted).toBe(true);

      const retrieved = library.getPrompt(prompt.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Search', () => {
    it('should search by category', () => {
      library.createPrompt({
        name: 'Prompt 1',
        description: 'Test',
        category: 'code',
        tags: [],
        author: 'user-1',
        visibility: 'public',
        currentVersionId: 'v1',
      });

      const results = library.search({ category: 'code' });
      expect(results.prompts.length).toBeGreaterThan(0);
    });

    it('should search by tags', () => {
      library.createPrompt({
        name: 'Prompt 1',
        description: 'Test',
        category: 'test',
        tags: ['important', 'featured'],
        author: 'user-1',
        visibility: 'public',
        currentVersionId: 'v1',
      });

      const results = library.search({ tags: ['important'] });
      expect(results.prompts.length).toBeGreaterThan(0);
    });

    it('should search by text query', () => {
      library.createPrompt({
        name: 'Code Generator',
        description: 'Generates code',
        category: 'code',
        tags: [],
        author: 'user-1',
        visibility: 'public',
        currentVersionId: 'v1',
      });

      const results = library.search({ query: 'generator' });
      expect(results.prompts.length).toBeGreaterThan(0);
    });
  });

  describe('Ratings', () => {
    it('should rate a prompt', () => {
      const prompt = library.createPrompt({
        name: 'Test Prompt',
        description: 'Test',
        category: 'test',
        tags: [],
        author: 'user-1',
        visibility: 'public',
        currentVersionId: 'v1',
      });

      const rating = library.ratePrompt({
        promptId: prompt.id,
        userId: 'user-2',
        rating: 5,
        review: 'Excellent!',
      });

      expect(rating).toBeDefined();
      expect(rating?.rating).toBe(5);

      const updated = library.getPrompt(prompt.id);
      expect(updated?.rating).toBe(5);
      expect(updated?.ratingCount).toBe(1);
    });
  });

  describe('Favorites', () => {
    it('should add to favorites', () => {
      const prompt = library.createPrompt({
        name: 'Test Prompt',
        description: 'Test',
        category: 'test',
        tags: [],
        author: 'user-1',
        visibility: 'public',
        currentVersionId: 'v1',
      });

      const added = library.addFavorite('user-2', prompt.id);
      expect(added).toBe(true);

      const favorites = library.getFavorites('user-2');
      expect(favorites.length).toBe(1);
    });

    it('should remove from favorites', () => {
      const prompt = library.createPrompt({
        name: 'Test Prompt',
        description: 'Test',
        category: 'test',
        tags: [],
        author: 'user-1',
        visibility: 'public',
        currentVersionId: 'v1',
      });

      library.addFavorite('user-2', prompt.id);
      const removed = library.removeFavorite('user-2', prompt.id);
      expect(removed).toBe(true);

      const favorites = library.getFavorites('user-2');
      expect(favorites.length).toBe(0);
    });
  });
});

describe('Prompt Analytics', () => {
  let analytics: PromptAnalytics;

  beforeEach(() => {
    analytics = new PromptAnalytics();
  });

  describe('Execution Recording', () => {
    it('should record execution', () => {
      const execution = analytics.recordExecution({
        promptId: 'prompt-1',
        versionId: 'v1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        cost: 0.01,
        success: true,
        metadata: {},
      });

      expect(execution).toBeDefined();
      expect(execution.promptId).toBe('prompt-1');
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate metrics', () => {
      for (let i = 0; i < 10; i++) {
        analytics.recordExecution({
          promptId: 'prompt-1',
          versionId: 'v1',
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: 100 + i * 10,
          outputTokens: 50 + i * 5,
          latencyMs: 500 + i * 50,
          cost: 0.01 + i * 0.001,
          success: true,
          metadata: {},
        });
      }

      const metrics = analytics.getMetrics('prompt-1');
      expect(metrics).toBeDefined();
      expect(metrics?.totalExecutions).toBe(10);
      expect(metrics?.successRate).toBe(1);
      expect(metrics?.averageLatencyMs).toBeGreaterThan(0);
    });
  });

  describe('Comparison', () => {
    it('should compare prompts', () => {
      // Record executions for prompt 1
      for (let i = 0; i < 5; i++) {
        analytics.recordExecution({
          promptId: 'prompt-1',
          versionId: 'v1',
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          latencyMs: 500,
          cost: 0.01,
          success: true,
          metadata: {},
        });
      }

      // Record executions for prompt 2
      for (let i = 0; i < 5; i++) {
        analytics.recordExecution({
          promptId: 'prompt-2',
          versionId: 'v1',
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          latencyMs: 300,
          cost: 0.008,
          success: true,
          metadata: {},
        });
      }

      const comparison = analytics.compare(['prompt-1', 'prompt-2'], {
        optimizeFor: 'latency',
      });

      expect(comparison.metrics.size).toBe(2);
      expect(comparison.winner).toBeDefined();
    });
  });
});

describe('Prompt Optimizer', () => {
  let optimizer: PromptOptimizer;
  let analytics: PromptAnalytics;

  beforeEach(() => {
    analytics = new PromptAnalytics();
    optimizer = new PromptOptimizer(analytics);
  });

  describe('Experiment Creation', () => {
    it('should create experiment', () => {
      const experiment = optimizer.createExperiment({
        name: 'Test Experiment',
        description: 'Testing prompts',
        variants: [
          {
            name: 'Control',
            promptId: 'prompt-1',
            versionId: 'v1',
            isControl: true,
          },
          {
            name: 'Variant A',
            promptId: 'prompt-2',
            versionId: 'v1',
            isControl: false,
          },
        ],
        optimizationGoal: 'latency',
        createdBy: 'user-1',
      });

      expect(experiment).toBeDefined();
      expect(experiment.variants.length).toBe(2);
    });
  });

  describe('Experiment Management', () => {
    it('should start experiment', () => {
      const experiment = optimizer.createExperiment({
        name: 'Test',
        description: 'Test',
        variants: [
          { name: 'Control', promptId: 'p1', versionId: 'v1', isControl: true },
          { name: 'Variant', promptId: 'p2', versionId: 'v1', isControl: false },
        ],
        optimizationGoal: 'latency',
        createdBy: 'user-1',
      });

      const started = optimizer.startExperiment(experiment.id);
      expect(started).toBe(true);

      const retrieved = optimizer.getExperiment(experiment.id);
      expect(retrieved?.status).toBe('running');
    });

    it('should assign variants consistently', () => {
      const experiment = optimizer.createExperiment({
        name: 'Test',
        description: 'Test',
        variants: [
          { name: 'Control', promptId: 'p1', versionId: 'v1', isControl: true },
          { name: 'Variant', promptId: 'p2', versionId: 'v1', isControl: false },
        ],
        optimizationGoal: 'latency',
        createdBy: 'user-1',
      });

      optimizer.startExperiment(experiment.id);

      const variant1 = optimizer.getVariant(experiment.id, 'user-1');
      const variant2 = optimizer.getVariant(experiment.id, 'user-1');

      expect(variant1?.id).toBe(variant2?.id);
    });
  });
});

