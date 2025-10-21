/**
 * GraphQL API Gateway Tests
 * 
 * Tests the GraphQL API Gateway functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GraphQLServer } from '../src/graphql/server.js';
import { PolicyEngine } from '../src/policy/policy-engine.js';
import { ScannerOrchestrator } from '../src/scanners/scanner-orchestrator.js';
import { CostTracker } from '../src/cost/cost-tracker.js';
import { AnalyticsEngine } from '../src/analytics/analytics-engine.js';
import { UserAnalytics } from '../src/analytics/user-analytics.js';
import { WorkflowExecutor } from '../src/workflows/workflow-executor.js';
import { WorkflowTemplateManager } from '../src/workflows/workflow-template-manager.js';
import { PromptVersionManager } from '../src/prompts/prompt-version-manager.js';
import { PromptLibrary } from '../src/prompts/prompt-library.js';
import { ModelRegistry } from '../src/models/model-registry.js';
import { RealtimeMonitor } from '../src/monitoring/realtime-monitor.js';
import { MetricsCollector } from '../src/utils/metrics.js';

describe('GraphQL API Gateway', () => {
  let server: GraphQLServer;
  let policyEngine: PolicyEngine;
  let scannerOrchestrator: ScannerOrchestrator;
  let costTracker: CostTracker;
  let analyticsEngine: AnalyticsEngine;
  let userAnalytics: UserAnalytics;
  let workflowExecutor: WorkflowExecutor;
  let workflowTemplates: WorkflowTemplateManager;
  let promptVersionManager: PromptVersionManager;
  let promptLibrary: PromptLibrary;
  let modelRegistry: ModelRegistry;
  let realtimeMonitor: RealtimeMonitor;

  beforeEach(() => {
    const metrics = new MetricsCollector();
    policyEngine = new PolicyEngine();
    scannerOrchestrator = new ScannerOrchestrator({ enableParallelScanning: true, scanTimeout: 10000 });
    costTracker = new CostTracker(metrics);
    analyticsEngine = new AnalyticsEngine(metrics);
    userAnalytics = new UserAnalytics(metrics);
    workflowExecutor = new WorkflowExecutor();
    workflowTemplates = new WorkflowTemplateManager();
    promptVersionManager = new PromptVersionManager();
    promptLibrary = new PromptLibrary();
    modelRegistry = new ModelRegistry();
    realtimeMonitor = new RealtimeMonitor(metrics);

    server = new GraphQLServer(
      policyEngine,
      scannerOrchestrator,
      costTracker,
      analyticsEngine,
      userAnalytics,
      workflowExecutor,
      workflowTemplates,
      promptVersionManager,
      promptLibrary,
      modelRegistry,
      realtimeMonitor,
      {
        apiKey: 'test-api-key',
        enableIntrospection: true,
        enablePlayground: true,
      }
    );
  });

  describe('Health & Status Queries', () => {
    it('should query health status', async () => {
      const query = `
        query {
          health {
            status
            uptime
            version
            components {
              name
              status
            }
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.health.status).toBe('healthy');
      expect(data.data.health.version).toBe('1.0.0');
      expect(data.data.health.components).toHaveLength(3);
    });

    it('should query version', async () => {
      const query = `
        query {
          version
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.version).toBe('1.0.0');
    });
  });

  describe('Policy Management', () => {
    it('should query all policies', async () => {
      // Add a test policy
      policyEngine.addPolicy({
        id: 'test-policy',
        name: 'Test Policy',
        description: 'A test policy',
        enabled: true,
        priority: 50,
        conditions: [],
        actions: [],
      });

      const query = `
        query {
          policies {
            id
            name
            description
            enabled
            priority
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      if (data.errors) {
        console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      }

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.policies.length).toBeGreaterThan(0);
      const testPolicy = data.data.policies.find((p: any) => p.name === 'Test Policy');
      expect(testPolicy).toBeDefined();
      expect(testPolicy.name).toBe('Test Policy');
    });

    it('should create a new policy', async () => {
      const mutation = `
        mutation {
          createPolicy(input: {
            name: "New Policy"
            description: "A new policy"
            priority: 75
            conditions: []
            actions: []
          }) {
            id
            name
            description
            priority
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query: mutation }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.createPolicy.name).toBe('New Policy');
      expect(data.data.createPolicy.priority).toBe(75);
    });

    it('should enable a policy', async () => {
      policyEngine.addPolicy({
        id: 'test-policy',
        name: 'Test Policy',
        description: 'A test policy',
        enabled: false,
        priority: 50,
        conditions: [],
        actions: [],
      });

      const mutation = `
        mutation {
          enablePolicy(id: "test-policy") {
            id
            enabled
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query: mutation }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      if (data.errors) {
        console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      }

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.enablePolicy.enabled).toBe(true);
    });

    it('should delete a policy', async () => {
      policyEngine.addPolicy({
        id: 'test-policy',
        name: 'Test Policy',
        description: 'A test policy',
        enabled: true,
        priority: 50,
        conditions: [],
        actions: [],
      });

      const mutation = `
        mutation {
          deletePolicy(id: "test-policy")
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query: mutation }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.deletePolicy).toBe(true);
    });
  });

  describe('Scanner Management', () => {
    it('should query all scanners', async () => {
      const query = `
        query {
          scanners {
            id
            type
            name
            enabled
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      if (data.errors) {
        console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      }

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.scanners.length).toBeGreaterThan(0);
    });
  });

  describe('Model Management', () => {
    it('should query all models', async () => {
      const query = `
        query {
          models {
            id
            name
            provider
            enabled
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({ query }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      if (data.errors) {
        console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      }

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data.models)).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const query = `
        query {
          policies {
            id
            name
          }
        }
      `;

      const request = new Request('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const response = await server.handleRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.errors).toBeDefined();
      expect(data.errors[0].extensions.code).toBe('UNAUTHORIZED');
    });
  });
});

