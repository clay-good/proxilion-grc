/**
 * Experiment Manager
 * 
 * Manages A/B tests and experiments for AI models, allowing gradual rollouts,
 * traffic splitting, and experiment tracking.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
export type ExperimentType = 'ab-test' | 'multivariate' | 'canary' | 'blue-green';

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  weight: number;              // Traffic allocation (0-1)
  config: Record<string, any>; // Variant configuration (model, params, etc.)
  enabled: boolean;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  type: ExperimentType;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  targetingRules?: TargetingRule[];
  startDate: number;           // Timestamp
  endDate?: number;            // Timestamp
  minSampleSize?: number;      // Minimum samples before analysis
  confidenceLevel?: number;    // Statistical confidence (0-1)
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, any>;
}

export interface TargetingRule {
  type: 'user' | 'organization' | 'region' | 'custom';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'matches' | 'contains';
  field: string;
  value: any;
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  userId: string;
  assignedAt: number;
  sticky: boolean;             // Keep same assignment for user
}

export interface ExperimentMetrics {
  experimentId: string;
  variantId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  averageCost: number;
  conversionRate: number;      // Custom conversion metric
  lastUpdated: number;
}

export class ExperimentManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  private experiments: Map<string, ExperimentConfig> = new Map();
  private assignments: Map<string, ExperimentAssignment> = new Map(); // userId -> assignment
  private experimentMetrics: Map<string, ExperimentMetrics[]> = new Map(); // experimentId -> metrics[]

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Create a new experiment
   */
  createExperiment(config: Omit<ExperimentConfig, 'createdAt' | 'updatedAt'>): ExperimentConfig {
    // Validate weights sum to 1.0
    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Variant weights must sum to 1.0, got ${totalWeight}`);
    }

    const experiment: ExperimentConfig = {
      ...config,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.experiments.set(experiment.id, experiment);
    this.experimentMetrics.set(experiment.id, []);

    this.logger.info('Created experiment', {
      experimentId: experiment.id,
      type: experiment.type,
      variants: experiment.variants.length,
    });

    this.metrics.increment('experiments_created_total', 1, {
      type: experiment.type,
    });

    return experiment;
  }

  /**
   * Get experiment by ID
   */
  getExperiment(experimentId: string): ExperimentConfig | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * Get all experiments
   */
  getAllExperiments(): ExperimentConfig[] {
    return Array.from(this.experiments.values());
  }

  /**
   * Get running experiments
   */
  getRunningExperiments(): ExperimentConfig[] {
    return this.getAllExperiments().filter(e => e.status === 'running');
  }

  /**
   * Update experiment
   */
  updateExperiment(experimentId: string, updates: Partial<ExperimentConfig>): ExperimentConfig {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    // Validate weight changes
    if (updates.variants) {
      const totalWeight = updates.variants.reduce((sum, v) => sum + v.weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        throw new Error(`Variant weights must sum to 1.0, got ${totalWeight}`);
      }
    }

    const updated: ExperimentConfig = {
      ...experiment,
      ...updates,
      updatedAt: Date.now(),
    };

    this.experiments.set(experimentId, updated);

    this.logger.info('Updated experiment', { experimentId });

    return updated;
  }

  /**
   * Start an experiment
   */
  startExperiment(experimentId: string): ExperimentConfig {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot start experiment in status: ${experiment.status}`);
    }

    experiment.status = 'running';
    experiment.startDate = Date.now();
    experiment.updatedAt = Date.now();

    this.experiments.set(experimentId, experiment);

    this.logger.info('Started experiment', { experimentId });
    this.metrics.increment('experiments_started_total');

    return experiment;
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(experimentId: string): ExperimentConfig {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    if (experiment.status !== 'running') {
      throw new Error(`Cannot pause experiment in status: ${experiment.status}`);
    }

    experiment.status = 'paused';
    experiment.updatedAt = Date.now();

    this.experiments.set(experimentId, experiment);

    this.logger.info('Paused experiment', { experimentId });

    return experiment;
  }

  /**
   * Complete an experiment
   */
  completeExperiment(experimentId: string): ExperimentConfig {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'completed';
    experiment.endDate = Date.now();
    experiment.updatedAt = Date.now();

    this.experiments.set(experimentId, experiment);

    this.logger.info('Completed experiment', { experimentId });
    this.metrics.increment('experiments_completed_total');

    return experiment;
  }

  /**
   * Cancel an experiment
   */
  cancelExperiment(experimentId: string): ExperimentConfig {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'cancelled';
    experiment.endDate = Date.now();
    experiment.updatedAt = Date.now();

    this.experiments.set(experimentId, experiment);

    this.logger.info('Cancelled experiment', { experimentId });

    return experiment;
  }

  /**
   * Assign user to experiment variant
   */
  assignVariant(experimentId: string, userId: string, context?: Record<string, any>): ExperimentAssignment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      this.logger.warn('Experiment not found for assignment', { experimentId });
      return null;
    }

    if (experiment.status !== 'running') {
      this.logger.debug('Experiment not running', { experimentId, status: experiment.status });
      return null;
    }

    // Check if user already has assignment (sticky)
    const assignmentKey = `${experimentId}:${userId}`;
    const existingAssignment = this.assignments.get(assignmentKey);
    if (existingAssignment && existingAssignment.sticky) {
      return existingAssignment;
    }

    // Check targeting rules
    if (experiment.targetingRules && !this.matchesTargetingRules(experiment.targetingRules, userId, context)) {
      this.logger.debug('User does not match targeting rules', { experimentId, userId });
      return null;
    }

    // Select variant based on weights
    const variant = this.selectVariant(experiment.variants, userId);
    if (!variant) {
      this.logger.warn('No variant selected', { experimentId, userId });
      return null;
    }

    const assignment: ExperimentAssignment = {
      experimentId,
      variantId: variant.id,
      userId,
      assignedAt: Date.now(),
      sticky: true, // Keep same assignment for consistency
    };

    this.assignments.set(assignmentKey, assignment);

    this.logger.debug('Assigned user to variant', {
      experimentId,
      userId,
      variantId: variant.id,
    });

    this.metrics.increment('experiment_assignments_total', 1, {
      experimentId,
      variantId: variant.id,
    });

    return assignment;
  }

  /**
   * Get user's assignment for an experiment
   */
  getAssignment(experimentId: string, userId: string): ExperimentAssignment | undefined {
    const assignmentKey = `${experimentId}:${userId}`;
    return this.assignments.get(assignmentKey);
  }

  /**
   * Record experiment metrics
   */
  recordMetrics(
    experimentId: string,
    variantId: string,
    metrics: {
      success: boolean;
      latency: number;
      cost: number;
      converted?: boolean;
    }
  ): void {
    let variantMetrics = this.experimentMetrics.get(experimentId)?.find(m => m.variantId === variantId);

    if (!variantMetrics) {
      variantMetrics = {
        experimentId,
        variantId,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        averageCost: 0,
        conversionRate: 0,
        lastUpdated: Date.now(),
      };

      const allMetrics = this.experimentMetrics.get(experimentId) || [];
      allMetrics.push(variantMetrics);
      this.experimentMetrics.set(experimentId, allMetrics);
    }

    // Update metrics
    variantMetrics.totalRequests++;
    if (metrics.success) {
      variantMetrics.successfulRequests++;
    } else {
      variantMetrics.failedRequests++;
    }

    // Update running averages
    const n = variantMetrics.totalRequests;
    variantMetrics.averageLatency = ((variantMetrics.averageLatency * (n - 1)) + metrics.latency) / n;
    variantMetrics.averageCost = ((variantMetrics.averageCost * (n - 1)) + metrics.cost) / n;

    if (metrics.converted !== undefined) {
      const conversions = variantMetrics.conversionRate * (n - 1) + (metrics.converted ? 1 : 0);
      variantMetrics.conversionRate = conversions / n;
    }

    variantMetrics.lastUpdated = Date.now();

    this.metrics.histogram('experiment_latency_ms', metrics.latency, {
      experimentId,
      variantId,
    });

    this.metrics.histogram('experiment_cost_usd', metrics.cost, {
      experimentId,
      variantId,
    });
  }

  /**
   * Get experiment metrics
   */
  getMetrics(experimentId: string): ExperimentMetrics[] {
    return this.experimentMetrics.get(experimentId) || [];
  }

  /**
   * Select variant based on weights using consistent hashing
   */
  private selectVariant(variants: ExperimentVariant[], userId: string): ExperimentVariant | null {
    const enabledVariants = variants.filter(v => v.enabled);
    if (enabledVariants.length === 0) {
      return null;
    }

    // Use simple hash for consistent assignment
    const hash = this.hashString(userId);
    const random = (hash % 10000) / 10000; // 0-1

    let cumulative = 0;
    for (const variant of enabledVariants) {
      cumulative += variant.weight;
      if (random < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant
    return enabledVariants[enabledVariants.length - 1];
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Check if user matches targeting rules
   */
  private matchesTargetingRules(rules: TargetingRule[], userId: string, context?: Record<string, any>): boolean {
    for (const rule of rules) {
      const value = context?.[rule.field];
      
      switch (rule.operator) {
        case 'equals':
          if (value !== rule.value) return false;
          break;
        case 'not_equals':
          if (value === rule.value) return false;
          break;
        case 'in':
          if (!Array.isArray(rule.value) || !rule.value.includes(value)) return false;
          break;
        case 'not_in':
          if (Array.isArray(rule.value) && rule.value.includes(value)) return false;
          break;
        case 'matches':
          if (typeof value !== 'string' || !new RegExp(rule.value).test(value)) return false;
          break;
        case 'contains':
          if (typeof value !== 'string' || !value.includes(rule.value)) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Get experiment statistics
   */
  getStats(): {
    totalExperiments: number;
    runningExperiments: number;
    completedExperiments: number;
    totalAssignments: number;
  } {
    const experiments = this.getAllExperiments();
    
    return {
      totalExperiments: experiments.length,
      runningExperiments: experiments.filter(e => e.status === 'running').length,
      completedExperiments: experiments.filter(e => e.status === 'completed').length,
      totalAssignments: this.assignments.size,
    };
  }
}

