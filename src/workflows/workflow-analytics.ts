/**
 * Workflow Analytics
 * 
 * Track and analyze workflow execution metrics and performance.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import {
  WorkflowExecutionResult,
  WorkflowStatus,
  StepExecutionResult,
  StepStatus,
} from './workflow-types.js';

export interface WorkflowMetrics {
  workflowId: string;
  workflowName?: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  totalSteps: number;
  averageStepsPerExecution: number;
  stepSuccessRate: number;
  lastExecutionTime: number;
  firstExecutionTime: number;
}

export interface StepMetrics {
  stepId: string;
  stepName?: string;
  stepType: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  skippedExecutions: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  averageRetries: number;
  errorRate: number;
}

export interface WorkflowAnalytics {
  totalWorkflows: number;
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
  mostUsedWorkflows: Array<{ workflowId: string; count: number }>;
  slowestWorkflows: Array<{ workflowId: string; avgDuration: number }>;
  mostFailedWorkflows: Array<{ workflowId: string; failureRate: number }>;
  stepAnalytics: {
    totalSteps: number;
    averageStepsPerWorkflow: number;
    mostFailedSteps: Array<{ stepType: string; failureRate: number }>;
    slowestSteps: Array<{ stepType: string; avgDuration: number }>;
  };
}

export class WorkflowAnalyticsEngine {
  private logger: Logger;
  private metrics: MetricsCollector;
  private executions: Map<string, WorkflowExecutionResult[]>;
  private workflowMetrics: Map<string, WorkflowMetrics>;
  private stepMetrics: Map<string, StepMetrics>;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.executions = new Map();
    this.workflowMetrics = new Map();
    this.stepMetrics = new Map();
  }

  /**
   * Record workflow execution
   */
  recordExecution(result: WorkflowExecutionResult): void {
    // Store execution
    if (!this.executions.has(result.workflowId)) {
      this.executions.set(result.workflowId, []);
    }
    this.executions.get(result.workflowId)!.push(result);

    // Update workflow metrics
    this.updateWorkflowMetrics(result);

    // Update step metrics
    for (const step of result.steps) {
      this.updateStepMetrics(step, result.workflowId);
    }

    // Emit metrics
    this.metrics.increment('workflow.execution.recorded', 1, {
      workflowId: result.workflowId,
      status: result.status,
    });

    this.logger.info('Recorded workflow execution', {
      workflowId: result.workflowId,
      executionId: result.executionId,
      status: result.status,
      duration: result.duration,
    });
  }

  /**
   * Update workflow metrics
   */
  private updateWorkflowMetrics(result: WorkflowExecutionResult): void {
    let metrics = this.workflowMetrics.get(result.workflowId);

    if (!metrics) {
      metrics = {
        workflowId: result.workflowId,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        cancelledExecutions: 0,
        averageDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        totalSteps: 0,
        averageStepsPerExecution: 0,
        stepSuccessRate: 0,
        lastExecutionTime: result.endTime,
        firstExecutionTime: result.startTime,
      };
    }

    // Update counts
    metrics.totalExecutions++;
    if (result.status === 'completed') {
      metrics.successfulExecutions++;
    } else if (result.status === 'failed') {
      metrics.failedExecutions++;
    } else if (result.status === 'cancelled') {
      metrics.cancelledExecutions++;
    }

    // Update durations
    const executions = this.executions.get(result.workflowId)!;
    const durations = executions.map(e => e.duration).sort((a, b) => a - b);
    metrics.averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    metrics.p50Duration = this.percentile(durations, 50);
    metrics.p95Duration = this.percentile(durations, 95);
    metrics.p99Duration = this.percentile(durations, 99);

    // Update step metrics
    metrics.totalSteps += result.steps.length;
    metrics.averageStepsPerExecution = metrics.totalSteps / metrics.totalExecutions;

    const successfulSteps = result.steps.filter(s => s.status === 'completed').length;
    const totalSteps = result.steps.length;
    metrics.stepSuccessRate = totalSteps > 0 ? successfulSteps / totalSteps : 0;

    // Update timestamps
    metrics.lastExecutionTime = result.endTime;
    if (result.startTime < metrics.firstExecutionTime) {
      metrics.firstExecutionTime = result.startTime;
    }

    this.workflowMetrics.set(result.workflowId, metrics);
  }

  /**
   * Update step metrics
   */
  private updateStepMetrics(step: StepExecutionResult, workflowId: string): void {
    const key = `${workflowId}:${step.stepId}`;
    let metrics = this.stepMetrics.get(key);

    if (!metrics) {
      metrics = {
        stepId: step.stepId,
        stepType: 'unknown',
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        skippedExecutions: 0,
        averageDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        averageRetries: 0,
        errorRate: 0,
      };
    }

    // Update counts
    metrics.totalExecutions++;
    if (step.status === 'completed') {
      metrics.successfulExecutions++;
    } else if (step.status === 'failed') {
      metrics.failedExecutions++;
    } else if (step.status === 'skipped') {
      metrics.skippedExecutions++;
    }

    // Update durations (only for completed/failed steps)
    if (step.status !== 'skipped') {
      const allSteps = Array.from(this.stepMetrics.values())
        .filter(m => m.stepId === step.stepId)
        .map(m => m.averageDuration);
      allSteps.push(step.duration);
      const durations = allSteps.sort((a, b) => a - b);
      metrics.averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      metrics.p50Duration = this.percentile(durations, 50);
      metrics.p95Duration = this.percentile(durations, 95);
      metrics.p99Duration = this.percentile(durations, 99);
    }

    // Update retries
    const totalRetries = metrics.averageRetries * (metrics.totalExecutions - 1) + step.retries;
    metrics.averageRetries = totalRetries / metrics.totalExecutions;

    // Update error rate
    metrics.errorRate = metrics.failedExecutions / metrics.totalExecutions;

    this.stepMetrics.set(key, metrics);
  }

  /**
   * Get workflow metrics
   */
  getWorkflowMetrics(workflowId: string): WorkflowMetrics | undefined {
    return this.workflowMetrics.get(workflowId);
  }

  /**
   * Get step metrics
   */
  getStepMetrics(workflowId: string, stepId: string): StepMetrics | undefined {
    return this.stepMetrics.get(`${workflowId}:${stepId}`);
  }

  /**
   * Get overall analytics
   */
  getAnalytics(): WorkflowAnalytics {
    const allExecutions = Array.from(this.executions.values()).flat();
    const totalExecutions = allExecutions.length;
    const successfulExecutions = allExecutions.filter(e => e.status === 'completed').length;

    // Most used workflows
    const workflowCounts = new Map<string, number>();
    for (const [workflowId, executions] of this.executions.entries()) {
      workflowCounts.set(workflowId, executions.length);
    }
    const mostUsed = Array.from(workflowCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([workflowId, count]) => ({ workflowId, count }));

    // Slowest workflows
    const slowest = Array.from(this.workflowMetrics.values())
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 10)
      .map(m => ({ workflowId: m.workflowId, avgDuration: m.averageDuration }));

    // Most failed workflows
    const mostFailed = Array.from(this.workflowMetrics.values())
      .filter(m => m.totalExecutions > 0)
      .map(m => ({
        workflowId: m.workflowId,
        failureRate: m.failedExecutions / m.totalExecutions,
      }))
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);

    // Step analytics
    const allSteps = Array.from(this.stepMetrics.values());
    const stepsByType = new Map<string, StepMetrics[]>();
    for (const step of allSteps) {
      if (!stepsByType.has(step.stepType)) {
        stepsByType.set(step.stepType, []);
      }
      stepsByType.get(step.stepType)!.push(step);
    }

    const mostFailedSteps = Array.from(stepsByType.entries())
      .map(([stepType, steps]) => {
        const totalExecs = steps.reduce((sum, s) => sum + s.totalExecutions, 0);
        const totalFails = steps.reduce((sum, s) => sum + s.failedExecutions, 0);
        return {
          stepType,
          failureRate: totalExecs > 0 ? totalFails / totalExecs : 0,
        };
      })
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);

    const slowestSteps = Array.from(stepsByType.entries())
      .map(([stepType, steps]) => {
        const avgDuration = steps.reduce((sum, s) => sum + s.averageDuration, 0) / steps.length;
        return { stepType, avgDuration };
      })
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    return {
      totalWorkflows: this.workflowMetrics.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
      averageDuration: allExecutions.reduce((sum, e) => sum + e.duration, 0) / totalExecutions || 0,
      mostUsedWorkflows: mostUsed,
      slowestWorkflows: slowest,
      mostFailedWorkflows: mostFailed,
      stepAnalytics: {
        totalSteps: allSteps.length,
        averageStepsPerWorkflow: allSteps.length / this.workflowMetrics.size || 0,
        mostFailedSteps,
        slowestSteps,
      },
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Clear analytics data
   */
  clear(): void {
    this.executions.clear();
    this.workflowMetrics.clear();
    this.stepMetrics.clear();
    this.logger.info('Cleared workflow analytics data');
  }
}

