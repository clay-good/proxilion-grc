/**
 * GraphQL Server
 * 
 * Creates and configures the GraphQL server with Yoga
 */

import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema.js';
import { resolvers, GraphQLContext } from './resolvers.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ScannerOrchestrator } from '../scanners/scanner-orchestrator.js';
import { CostTracker } from '../cost/cost-tracker.js';
import { AnalyticsEngine } from '../analytics/analytics-engine.js';
import { UserAnalytics } from '../analytics/user-analytics.js';
import { WorkflowExecutor } from '../workflows/workflow-executor.js';
import { WorkflowTemplateManager } from '../workflows/workflow-template-manager.js';
import { PromptVersionManager } from '../prompts/prompt-version-manager.js';
import { PromptLibrary } from '../prompts/prompt-library.js';
import { ModelRegistry } from '../models/model-registry.js';
import { RealtimeMonitor } from '../monitoring/realtime-monitor.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface GraphQLServerConfig {
  apiKey?: string;
  enableIntrospection?: boolean;
  enablePlayground?: boolean;
  corsOrigins?: string[];
}

export class GraphQLServer {
  private yoga: any;
  private logger: Logger;
  private config: Required<GraphQLServerConfig>;

  // Dependencies
  private policyEngine: PolicyEngine;
  private scannerOrchestrator: ScannerOrchestrator;
  private costTracker: CostTracker;
  private analyticsEngine: AnalyticsEngine;
  private userAnalytics: UserAnalytics;
  private workflowExecutor: WorkflowExecutor;
  private workflowTemplates: WorkflowTemplateManager;
  private promptVersionManager: PromptVersionManager;
  private promptLibrary: PromptLibrary;
  private modelRegistry: ModelRegistry;
  private realtimeMonitor: RealtimeMonitor;
  private metrics: MetricsCollector;

  constructor(
    policyEngine: PolicyEngine,
    scannerOrchestrator: ScannerOrchestrator,
    costTracker: CostTracker,
    analyticsEngine: AnalyticsEngine,
    userAnalytics: UserAnalytics,
    workflowExecutor: WorkflowExecutor,
    workflowTemplates: WorkflowTemplateManager,
    promptVersionManager: PromptVersionManager,
    promptLibrary: PromptLibrary,
    modelRegistry: ModelRegistry,
    realtimeMonitor: RealtimeMonitor,
    config: GraphQLServerConfig = {}
  ) {
    this.logger = new Logger();
    this.policyEngine = policyEngine;
    this.scannerOrchestrator = scannerOrchestrator;
    this.costTracker = costTracker;
    this.analyticsEngine = analyticsEngine;
    this.userAnalytics = userAnalytics;
    this.workflowExecutor = workflowExecutor;
    this.workflowTemplates = workflowTemplates;
    this.promptVersionManager = promptVersionManager;
    this.promptLibrary = promptLibrary;
    this.modelRegistry = modelRegistry;
    this.realtimeMonitor = realtimeMonitor;
    this.metrics = MetricsCollector.getInstance();

    this.config = {
      apiKey: config.apiKey || '',
      enableIntrospection: config.enableIntrospection ?? true,
      enablePlayground: config.enablePlayground ?? true,
      corsOrigins: config.corsOrigins ?? ['*'],
    };

    this.yoga = this.createYogaServer();
  }

  /**
   * Create Yoga GraphQL server
   */
  private createYogaServer() {
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    return createYoga({
      schema,
      context: async ({ request }: any): Promise<GraphQLContext> => {
        // Extract authentication from headers
        const authHeader = request.headers.get('authorization');
        const apiKey = request.headers.get('x-api-key');
        
        let isAuthenticated = false;
        let userId: string | undefined;

        // Check API key authentication
        if (this.config.apiKey) {
          if (apiKey === this.config.apiKey || authHeader === `Bearer ${this.config.apiKey}`) {
            isAuthenticated = true;
          }
        } else {
          // If no API key configured, allow all requests (development mode)
          isAuthenticated = true;
        }

        // Extract user ID from JWT or API key (simplified)
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          // In production, decode JWT and extract user ID
          userId = 'user-from-token';
        }

        return {
          policyEngine: this.policyEngine,
          scannerOrchestrator: this.scannerOrchestrator,
          costTracker: this.costTracker,
          analyticsEngine: this.analyticsEngine,
          userAnalytics: this.userAnalytics,
          workflowExecutor: this.workflowExecutor,
          workflowTemplates: this.workflowTemplates,
          promptVersionManager: this.promptVersionManager,
          promptLibrary: this.promptLibrary,
          modelRegistry: this.modelRegistry,
          realtimeMonitor: this.realtimeMonitor,
          logger: this.logger,
          metrics: this.metrics,
          userId,
          isAuthenticated,
        };
      },
      graphiql: this.config.enablePlayground,
      maskedErrors: false,
      cors: {
        origin: this.config.corsOrigins,
        credentials: true,
      },
      logging: {
        debug: (...args) => this.logger.debug('GraphQL Debug', { args }),
        info: (...args) => this.logger.info('GraphQL Info', { args }),
        warn: (...args) => this.logger.warn('GraphQL Warning', { args }),
        error: (...args) => this.logger.error('GraphQL Error', undefined, { args }),
      },
    });
  }

  /**
   * Get the Yoga server instance
   */
  getServer() {
    return this.yoga;
  }

  /**
   * Handle incoming request
   */
  async handleRequest(request: Request): Promise<Response> {
    const startTime = Date.now();

    try {
      this.metrics.increment('graphql_requests_total');
      
      const response = await this.yoga.fetch(request);
      
      const duration = Date.now() - startTime;
      this.metrics.histogram('graphql_request_duration_ms', duration);
      
      this.logger.info('GraphQL request processed', {
        method: request.method,
        url: request.url,
        status: response.status,
        duration,
      });

      return response;
    } catch (error) {
      this.metrics.increment('graphql_errors_total');

      this.logger.error('GraphQL request failed', error instanceof Error ? error : undefined, {});

      return new Response(
        JSON.stringify({
          errors: [
            {
              message: 'Internal server error',
              extensions: {
                code: 'INTERNAL_SERVER_ERROR',
              },
            },
          ],
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    const durationStats = this.metrics.getStats('graphql_request_duration_ms');
    return {
      totalRequests: this.metrics.counter('graphql_requests_total'),
      totalErrors: this.metrics.counter('graphql_errors_total'),
      averageDuration: durationStats?.mean || 0,
    };
  }
}

