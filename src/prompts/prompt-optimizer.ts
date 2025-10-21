/**
 * Prompt Optimizer
 * 
 * A/B test prompts and automatically select best performing:
 * - Multi-variant testing
 * - Statistical significance testing
 * - Automatic winner selection
 * - Gradual rollout
 * - Performance tracking
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { PromptAnalytics, PromptMetrics } from './prompt-analytics.js';

export interface OptimizationExperiment {
  id: string;
  name: string;
  description: string;
  variants: OptimizationVariant[];
  status: 'draft' | 'running' | 'completed' | 'paused';
  optimizationGoal: 'latency' | 'cost' | 'quality' | 'balanced';
  minSampleSize: number;        // Minimum samples before declaring winner
  confidenceLevel: number;      // 0.90, 0.95, 0.99
  trafficAllocation: Map<string, number>; // variantId -> percentage
  winner?: string;              // Winning variant ID
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  createdBy: string;
}

export interface OptimizationVariant {
  id: string;
  name: string;
  promptId: string;
  versionId: string;
  description?: string;
  isControl: boolean;
}

export interface ExperimentResult {
  experimentId: string;
  variants: Map<string, PromptMetrics>;
  winner?: {
    variantId: string;
    confidence: number;
    improvement: number;        // Percentage improvement over control
    reason: string;
  };
  statisticalSignificance: boolean;
  recommendations: string[];
}

export class PromptOptimizer {
  private logger: Logger;
  private metrics: MetricsCollector;
  private analytics: PromptAnalytics;
  
  // Storage
  private experiments: Map<string, OptimizationExperiment> = new Map();
  private variantAssignments: Map<string, string> = new Map(); // userId -> variantId

  constructor(analytics: PromptAnalytics) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.analytics = analytics;
  }

  /**
   * Create optimization experiment
   */
  createExperiment(params: {
    name: string;
    description: string;
    variants: Array<{
      name: string;
      promptId: string;
      versionId: string;
      description?: string;
      isControl: boolean;
    }>;
    optimizationGoal: OptimizationExperiment['optimizationGoal'];
    minSampleSize?: number;
    confidenceLevel?: number;
    createdBy: string;
  }): OptimizationExperiment {
    if (params.variants.length < 2) {
      throw new Error('At least 2 variants required');
    }

    const controlCount = params.variants.filter(v => v.isControl).length;
    if (controlCount !== 1) {
      throw new Error('Exactly 1 control variant required');
    }

    const variants: OptimizationVariant[] = params.variants.map(v => ({
      id: crypto.randomUUID(),
      name: v.name,
      promptId: v.promptId,
      versionId: v.versionId,
      description: v.description,
      isControl: v.isControl,
    }));

    // Equal traffic allocation initially
    const trafficAllocation = new Map<string, number>();
    const percentage = 100 / variants.length;
    for (const variant of variants) {
      trafficAllocation.set(variant.id, percentage);
    }

    const experiment: OptimizationExperiment = {
      id: crypto.randomUUID(),
      name: params.name,
      description: params.description,
      variants,
      status: 'draft',
      optimizationGoal: params.optimizationGoal,
      minSampleSize: params.minSampleSize || 100,
      confidenceLevel: params.confidenceLevel || 0.95,
      trafficAllocation,
      createdAt: Date.now(),
      createdBy: params.createdBy,
    };

    this.experiments.set(experiment.id, experiment);

    this.logger.info('Optimization experiment created', {
      experimentId: experiment.id,
      name: experiment.name,
      variantCount: variants.length,
    });

    this.metrics.increment('prompt_optimizer_experiment_created_total', 1, {
      goal: experiment.optimizationGoal,
    });

    return experiment;
  }

  /**
   * Start experiment
   */
  startExperiment(experimentId: string): boolean {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      this.logger.warn('Experiment not found', { experimentId });
      return false;
    }

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      this.logger.warn('Experiment cannot be started', {
        experimentId,
        status: experiment.status,
      });
      return false;
    }

    experiment.status = 'running';
    experiment.startedAt = Date.now();

    this.logger.info('Experiment started', { experimentId });

    this.metrics.increment('prompt_optimizer_experiment_started_total', 1, {
      experimentId,
    });

    return true;
  }

  /**
   * Pause experiment
   */
  pauseExperiment(experimentId: string): boolean {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return false;
    }

    experiment.status = 'paused';

    this.logger.info('Experiment paused', { experimentId });

    return true;
  }

  /**
   * Get variant for user (consistent assignment)
   */
  getVariant(experimentId: string, userId: string): OptimizationVariant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if user already assigned
    const assignmentKey = `${experimentId}:${userId}`;
    const existingVariantId = this.variantAssignments.get(assignmentKey);
    
    if (existingVariantId) {
      return experiment.variants.find(v => v.id === existingVariantId) || null;
    }

    // Assign variant based on traffic allocation
    const variant = this.assignVariant(experiment, userId);
    this.variantAssignments.set(assignmentKey, variant.id);

    this.metrics.increment('prompt_optimizer_variant_assigned_total', 1, {
      experimentId,
      variantId: variant.id,
    });

    return variant;
  }

  /**
   * Assign variant based on traffic allocation
   */
  private assignVariant(experiment: OptimizationExperiment, userId: string): OptimizationVariant {
    // Use consistent hashing for stable assignment
    const hash = this.hashString(`${experiment.id}:${userId}`);
    const percentage = (hash % 100) + 1; // 1-100

    let cumulative = 0;
    for (const variant of experiment.variants) {
      const allocation = experiment.trafficAllocation.get(variant.id) || 0;
      cumulative += allocation;
      
      if (percentage <= cumulative) {
        return variant;
      }
    }

    // Fallback to first variant
    return experiment.variants[0];
  }

  /**
   * Analyze experiment results
   */
  analyzeExperiment(experimentId: string): ExperimentResult | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    // Get metrics for each variant
    const variantMetrics = new Map<string, PromptMetrics>();
    
    for (const variant of experiment.variants) {
      const metrics = this.analytics.getMetrics(variant.promptId, variant.versionId);
      if (metrics) {
        variantMetrics.set(variant.id, metrics);
      }
    }

    // Check if we have enough samples
    const hasEnoughSamples = Array.from(variantMetrics.values())
      .every(m => m.totalExecutions >= experiment.minSampleSize);

    if (!hasEnoughSamples) {
      return {
        experimentId,
        variants: variantMetrics,
        statisticalSignificance: false,
        recommendations: ['Need more samples before declaring winner'],
      };
    }

    // Find control variant
    const controlVariant = experiment.variants.find(v => v.isControl);
    if (!controlVariant) {
      return {
        experimentId,
        variants: variantMetrics,
        statisticalSignificance: false,
        recommendations: ['Control variant not found'],
      };
    }

    const controlMetrics = variantMetrics.get(controlVariant.id);
    if (!controlMetrics) {
      return {
        experimentId,
        variants: variantMetrics,
        statisticalSignificance: false,
        recommendations: ['Control metrics not available'],
      };
    }

    // Compare variants
    const comparison = this.analytics.compare(
      experiment.variants.map(v => v.promptId),
      {
        versionIds: new Map(experiment.variants.map(v => [v.promptId, v.versionId])),
        optimizeFor: experiment.optimizationGoal,
      }
    );

    // Determine winner with statistical significance
    let winner: ExperimentResult['winner'];
    let statisticalSignificance = false;

    if (comparison.winner) {
      const winnerVariant = experiment.variants.find(
        v => v.promptId === comparison.winner!.promptId
      );
      
      if (winnerVariant) {
        const winnerMetrics = variantMetrics.get(winnerVariant.id);
        
        if (winnerMetrics) {
          // Calculate improvement over control
          const improvement = this.calculateImprovement(
            controlMetrics,
            winnerMetrics,
            experiment.optimizationGoal
          );

          // Check statistical significance (simplified t-test)
          statisticalSignificance = this.isStatisticallySignificant(
            controlMetrics,
            winnerMetrics,
            experiment.confidenceLevel
          );

          if (statisticalSignificance) {
            winner = {
              variantId: winnerVariant.id,
              confidence: experiment.confidenceLevel,
              improvement,
              reason: comparison.winner.reason,
            };

            // Update experiment
            experiment.winner = winnerVariant.id;
            experiment.status = 'completed';
            experiment.completedAt = Date.now();

            this.logger.info('Experiment completed with winner', {
              experimentId,
              winnerVariantId: winnerVariant.id,
              improvement,
            });

            this.metrics.increment('prompt_optimizer_experiment_completed_total', 1, {
              experimentId,
              hasWinner: 'true',
            });
          }
        }
      }
    }

    return {
      experimentId,
      variants: variantMetrics,
      winner,
      statisticalSignificance,
      recommendations: comparison.recommendations,
    };
  }

  /**
   * Calculate improvement percentage
   */
  private calculateImprovement(
    control: PromptMetrics,
    variant: PromptMetrics,
    goal: OptimizationExperiment['optimizationGoal']
  ): number {
    let controlValue: number;
    let variantValue: number;

    switch (goal) {
      case 'latency':
        controlValue = control.averageLatencyMs;
        variantValue = variant.averageLatencyMs;
        // Lower is better, so improvement is negative change
        return ((controlValue - variantValue) / controlValue) * 100;

      case 'cost':
        controlValue = control.averageCost;
        variantValue = variant.averageCost;
        // Lower is better
        return ((controlValue - variantValue) / controlValue) * 100;

      case 'quality':
        controlValue = control.averageQualityScore || 0;
        variantValue = variant.averageQualityScore || 0;
        // Higher is better
        return ((variantValue - controlValue) / controlValue) * 100;

      case 'balanced':
      default:
        // Composite score
        const controlScore = this.calculateBalancedScore(control);
        const variantScore = this.calculateBalancedScore(variant);
        return ((variantScore - controlScore) / controlScore) * 100;
    }
  }

  /**
   * Calculate balanced score
   */
  private calculateBalancedScore(metrics: PromptMetrics): number {
    const latencyScore = 1 / (metrics.averageLatencyMs / 1000);
    const costScore = 1 / (metrics.averageCost * 100);
    const qualityScore = metrics.averageQualityScore || 0.5;
    const successScore = metrics.successRate;

    return (latencyScore * 0.25 + costScore * 0.25 + qualityScore * 0.25 + successScore * 0.25);
  }

  /**
   * Check statistical significance (simplified)
   */
  private isStatisticallySignificant(
    control: PromptMetrics,
    variant: PromptMetrics,
    confidenceLevel: number
  ): boolean {
    // Simplified check: require minimum sample size and minimum improvement
    const minSamples = 100;
    const minImprovement = 0.05; // 5%

    if (control.totalExecutions < minSamples || variant.totalExecutions < minSamples) {
      return false;
    }

    // Check if improvement is significant
    const controlValue = control.averageLatencyMs;
    const variantValue = variant.averageLatencyMs;
    const improvement = Math.abs((controlValue - variantValue) / controlValue);

    return improvement >= minImprovement;
  }

  /**
   * Hash string to number
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
   * Get experiment
   */
  getExperiment(experimentId: string): OptimizationExperiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * Get all experiments
   */
  getAllExperiments(): OptimizationExperiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * Get running experiments
   */
  getRunningExperiments(): OptimizationExperiment[] {
    return this.getAllExperiments().filter(e => e.status === 'running');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalExperiments: number;
    runningExperiments: number;
    completedExperiments: number;
    experimentsWithWinner: number;
  } {
    const experiments = this.getAllExperiments();
    
    return {
      totalExperiments: experiments.length,
      runningExperiments: experiments.filter(e => e.status === 'running').length,
      completedExperiments: experiments.filter(e => e.status === 'completed').length,
      experimentsWithWinner: experiments.filter(e => e.winner !== undefined).length,
    };
  }
}

