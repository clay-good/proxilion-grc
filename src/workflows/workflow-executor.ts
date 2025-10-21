/**
 * Workflow Executor
 * 
 * Core engine for executing AI workflows with step sequencing,
 * conditional logic, parallel execution, and error handling.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowExecutionResult,
  WorkflowExecutionOptions,
  WorkflowStatus,
  StepExecutionResult,
  StepStatus,
  AnyWorkflowStep,
  AIRequestStep,
  TransformStep,
  ConditionStep,
  ParallelStep,
  LoopStep,
  WaitStep,
  WebhookStep,
  CustomStep,
  StepCondition,
} from './workflow-types.js';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowStepExecutor } from './workflow-step-executor.js';

export class WorkflowExecutor {
  private logger: Logger;
  private metrics: MetricsCollector;
  private customFunctions: Map<string, Function>;
  private activeExecutions: Map<string, WorkflowContext>;
  private stepExecutor: WorkflowStepExecutor;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.customFunctions = new Map();
    this.activeExecutions = new Map();
    this.stepExecutor = new WorkflowStepExecutor();
  }

  /**
   * Register a custom function
   */
  registerFunction(name: string, fn: Function): void {
    this.customFunctions.set(name, fn);
    this.logger.info('Registered custom function', { name });
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflow: WorkflowDefinition,
    options: WorkflowExecutionOptions = {}
  ): Promise<WorkflowExecutionResult> {
    const executionId = uuidv4();
    const startTime = Date.now();

    // Initialize context
    const context: WorkflowContext = {
      workflowId: workflow.id,
      executionId,
      variables: {
        ...workflow.variables,
        ...options.variables,
      },
      stepOutputs: {},
      metadata: {
        ...workflow.metadata,
        ...options.metadata,
      },
      startTime,
    };

    this.activeExecutions.set(executionId, context);

    this.logger.info('Starting workflow execution', {
      workflowId: workflow.id,
      executionId,
      stepCount: workflow.steps.length,
    });

    this.metrics.increment('workflow.execution.started', 1, {
      workflowId: workflow.id,
    });

    try {
      // Dry run mode - validate without executing
      if (options.dryRun) {
        return this.dryRun(workflow, context);
      }

      // Execute workflow with timeout
      const timeout = options.timeout || workflow.timeout || 300000; // 5 min default
      const result = await this.executeWithTimeout(workflow, context, timeout);

      this.metrics.increment('workflow.execution.completed', 1, {
        workflowId: workflow.id,
        status: result.status,
      });

      this.metrics.histogram('workflow.execution.duration', result.duration, {
        workflowId: workflow.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Workflow execution failed', error instanceof Error ? error : undefined, {
        workflowId: workflow.id,
        executionId,
      });

      this.metrics.increment('workflow.execution.failed', 1, {
        workflowId: workflow.id,
      });

      const endTime = Date.now();
      return {
        workflowId: workflow.id,
        executionId,
        status: 'failed',
        steps: [],
        error: error instanceof Error ? error.message : String(error),
        startTime,
        endTime,
        duration: endTime - startTime,
        context,
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute workflow with timeout
   */
  private async executeWithTimeout(
    workflow: WorkflowDefinition,
    context: WorkflowContext,
    timeout: number
  ): Promise<WorkflowExecutionResult> {
    return Promise.race([
      this.executeWorkflow(workflow, context),
      new Promise<WorkflowExecutionResult>((_, reject) =>
        setTimeout(() => reject(new Error('Workflow execution timeout')), timeout)
      ),
    ]);
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(
    workflow: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<WorkflowExecutionResult> {
    const stepResults: StepExecutionResult[] = [];
    const executedSteps = new Set<string>();
    const stepsToExecute: string[] = [workflow.entryPoint];
    const pendingSteps = new Set<string>();

    // Add all steps that have dependencies to pending
    for (const step of workflow.steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        pendingSteps.add(step.id);
      }
    }

    while (stepsToExecute.length > 0 || pendingSteps.size > 0) {
      const stepId = stepsToExecute.shift();

      // If no steps in queue, check pending steps
      if (!stepId) {
        // Find a pending step whose dependencies are met
        let foundStep = false;
        for (const pendingStepId of pendingSteps) {
          const step = workflow.steps.find(s => s.id === pendingStepId);
          if (step && step.dependsOn) {
            const allDependenciesMet = step.dependsOn.every(depId => executedSteps.has(depId));
            if (allDependenciesMet) {
              stepsToExecute.push(pendingStepId);
              pendingSteps.delete(pendingStepId);
              foundStep = true;
              break;
            }
          }
        }

        // If no pending steps can be executed, we're done or deadlocked
        if (!foundStep) {
          break;
        }
        continue;
      }

      // Skip if already executed
      if (executedSteps.has(stepId)) {
        continue;
      }

      const step = workflow.steps.find(s => s.id === stepId);
      if (!step) {
        this.logger.warn('Step not found', { stepId });
        continue;
      }

      // Check dependencies
      if (step.dependsOn && step.dependsOn.length > 0) {
        const allDependenciesMet = step.dependsOn.every(depId => executedSteps.has(depId));
        if (!allDependenciesMet) {
          // Re-queue step for later
          stepsToExecute.push(stepId);
          continue;
        }
      }

      // Check step condition
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        this.logger.debug('Step condition not met, skipping', { stepId });
        stepResults.push({
          stepId,
          status: 'skipped',
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          retries: 0,
        });
        executedSteps.add(stepId);
        continue;
      }

      // Execute step
      context.currentStep = stepId;
      const result = await this.executeStep(step, context);
      stepResults.push(result);
      executedSteps.add(stepId);

      // Handle step failure
      if (result.status === 'failed' && !step.continueOnError) {
        this.logger.error('Step failed, stopping workflow', undefined, { stepId });
        break;
      }

      // Store step output
      if (result.output !== undefined) {
        context.stepOutputs[stepId] = result.output;
      }

      // Add next steps based on step type
      const nextSteps = this.getNextSteps(step, result, context);
      stepsToExecute.push(...nextSteps);
    }

    const endTime = Date.now();
    const status: WorkflowStatus = stepResults.some(r => r.status === 'failed') ? 'failed' : 'completed';

    return {
      workflowId: workflow.id,
      executionId: context.executionId,
      status,
      steps: stepResults,
      output: context.stepOutputs,
      startTime: context.startTime,
      endTime,
      duration: endTime - context.startTime,
      context,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: AnyWorkflowStep,
    context: WorkflowContext
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();
    let retries = 0;
    const maxRetries = step.retryPolicy?.maxRetries || 0;

    this.logger.info('Executing step', {
      stepId: step.id,
      type: step.type,
      executionId: context.executionId,
    });

    while (retries <= maxRetries) {
      try {
        const output = await this.executeStepByType(step, context);
        const endTime = Date.now();

        this.logger.info('Step completed', {
          stepId: step.id,
          duration: endTime - startTime,
          retries,
        });

        return {
          stepId: step.id,
          status: 'completed',
          output,
          startTime,
          endTime,
          duration: endTime - startTime,
          retries,
        };
      } catch (error) {
        retries++;
        this.logger.warn('Step execution failed', {
          stepId: step.id,
          retries,
          maxRetries,
          error,
        });

        if (retries <= maxRetries) {
          const delay = this.calculateRetryDelay(step, retries);
          await this.sleep(delay);
        } else {
          const endTime = Date.now();
          return {
            stepId: step.id,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            startTime,
            endTime,
            duration: endTime - startTime,
            retries: retries - 1,
          };
        }
      }
    }

    // Should never reach here
    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Execute step based on type
   */
  private async executeStepByType(
    step: AnyWorkflowStep,
    context: WorkflowContext
  ): Promise<any> {
    switch (step.type) {
      case 'ai_request':
        return this.executeAIRequest(step as AIRequestStep, context);
      case 'transform':
        return this.executeTransform(step as TransformStep, context);
      case 'condition':
        return this.executeCondition(step as ConditionStep, context);
      case 'parallel':
        return this.executeParallel(step as ParallelStep, context);
      case 'loop':
        return this.executeLoop(step as LoopStep, context);
      case 'wait':
        return this.executeWait(step as WaitStep, context);
      case 'webhook':
        return this.executeWebhook(step as WebhookStep, context);
      case 'custom':
        return this.executeCustom(step as CustomStep, context);
      default:
        throw new Error(`Unknown step type: ${(step as any).type}`);
    }
  }

  // Step execution methods
  private async executeAIRequest(step: AIRequestStep, context: WorkflowContext): Promise<any> {
    return this.stepExecutor.executeAIRequest(step, context);
  }

  private async executeTransform(step: TransformStep, context: WorkflowContext): Promise<any> {
    return this.stepExecutor.executeTransform(step, context);
  }

  private async executeCondition(step: ConditionStep, context: WorkflowContext): Promise<any> {
    return this.stepExecutor.executeCondition(step, context);
  }

  private async executeParallel(step: ParallelStep, context: WorkflowContext): Promise<any> {
    return this.stepExecutor.executeParallel(step, context);
  }

  private async executeLoop(step: LoopStep, context: WorkflowContext): Promise<any> {
    return this.stepExecutor.executeLoop(step, context);
  }

  private async executeWait(step: WaitStep, context: WorkflowContext): Promise<any> {
    await this.sleep(step.config.duration);
    return { waited: step.config.duration };
  }

  private async executeWebhook(step: WebhookStep, context: WorkflowContext): Promise<any> {
    return this.stepExecutor.executeWebhook(step, context);
  }

  private async executeCustom(step: CustomStep, context: WorkflowContext): Promise<any> {
    const fn = this.customFunctions.get(step.config.function);
    if (!fn) {
      throw new Error(`Custom function not found: ${step.config.function}`);
    }
    return fn(step.config.args, context);
  }

  private evaluateCondition(condition: StepCondition, context: WorkflowContext): boolean {
    return this.stepExecutor.evaluateCondition(condition, context);
  }

  private getNextSteps(step: AnyWorkflowStep, result: StepExecutionResult, context: WorkflowContext): string[] {
    // Handle different step types
    if (step.type === 'condition' && result.output) {
      const output = result.output as any;
      if (output.conditionMet) {
        return output.thenSteps || [];
      } else {
        return output.elseSteps || [];
      }
    }

    if (step.type === 'parallel' && result.output) {
      return result.output.parallelSteps || [];
    }

    if (step.type === 'loop' && result.output) {
      // Loop steps will be handled separately
      return [];
    }

    return [];
  }

  private calculateRetryDelay(step: AnyWorkflowStep, retries: number): number {
    const baseDelay = step.retryPolicy?.retryDelay || 1000;
    const multiplier = step.retryPolicy?.backoffMultiplier || 1;
    return baseDelay * Math.pow(multiplier, retries - 1);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async dryRun(workflow: WorkflowDefinition, context: WorkflowContext): Promise<WorkflowExecutionResult> {
    // Validate workflow structure
    const endTime = Date.now();
    return {
      workflowId: workflow.id,
      executionId: context.executionId,
      status: 'completed',
      steps: [],
      startTime: context.startTime,
      endTime,
      duration: endTime - context.startTime,
      context,
      metadata: { dryRun: true },
    };
  }
}

