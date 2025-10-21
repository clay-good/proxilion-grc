/**
 * Workflow Orchestration Types
 * 
 * Type definitions for AI workflow orchestration system.
 */

import { UnifiedAIRequest, UnifiedAIResponse } from '../types/index.js';

/**
 * Workflow step types
 */
export type WorkflowStepType = 
  | 'ai_request'      // Make an AI request
  | 'transform'       // Transform data
  | 'condition'       // Conditional branching
  | 'parallel'        // Execute steps in parallel
  | 'loop'            // Loop over items
  | 'wait'            // Wait for duration
  | 'webhook'         // Call external webhook
  | 'custom';         // Custom function

/**
 * Workflow execution status
 */
export type WorkflowStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * Step execution status
 */
export type StepStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'retrying';

/**
 * Condition operators
 */
export type ConditionOperator = 
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'endsWith'
  | 'matches' | 'in' | 'notIn';

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  variables: Record<string, any>;
  stepOutputs: Record<string, any>;
  metadata: Record<string, any>;
  startTime: number;
  currentStep?: string;
}

/**
 * Base workflow step
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  description?: string;
  dependsOn?: string[];  // Step IDs this step depends on
  condition?: StepCondition;
  retryPolicy?: RetryPolicy;
  timeout?: number;
  continueOnError?: boolean;
}

/**
 * AI Request step
 */
export interface AIRequestStep extends WorkflowStep {
  type: 'ai_request';
  config: {
    provider?: string;
    model?: string;
    prompt: string | PromptTemplate;
    parameters?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      [key: string]: any;
    };
    useCache?: boolean;
    extractFields?: string[];  // Extract specific fields from response
  };
}

/**
 * Transform step
 */
export interface TransformStep extends WorkflowStep {
  type: 'transform';
  config: {
    input: string;  // Variable or step output to transform
    transformations: Transformation[];
    output: string;  // Variable name to store result
  };
}

/**
 * Condition step (branching)
 */
export interface ConditionStep extends WorkflowStep {
  type: 'condition';
  config: {
    condition: StepCondition;
    thenSteps: string[];  // Step IDs to execute if true
    elseSteps?: string[];  // Step IDs to execute if false
  };
}

/**
 * Parallel execution step
 */
export interface ParallelStep extends WorkflowStep {
  type: 'parallel';
  config: {
    steps: string[];  // Step IDs to execute in parallel
    waitForAll?: boolean;  // Wait for all or just first completion
    maxConcurrency?: number;
  };
}

/**
 * Loop step
 */
export interface LoopStep extends WorkflowStep {
  type: 'loop';
  config: {
    items: string;  // Variable containing array to loop over
    itemVariable: string;  // Variable name for current item
    steps: string[];  // Step IDs to execute for each item
    maxIterations?: number;
    parallel?: boolean;
  };
}

/**
 * Wait step
 */
export interface WaitStep extends WorkflowStep {
  type: 'wait';
  config: {
    duration: number;  // Milliseconds to wait
    condition?: StepCondition;  // Optional condition to wait for
  };
}

/**
 * Webhook step
 */
export interface WebhookStep extends WorkflowStep {
  type: 'webhook';
  config: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: any;
    extractFields?: string[];
  };
}

/**
 * Custom function step
 */
export interface CustomStep extends WorkflowStep {
  type: 'custom';
  config: {
    function: string;  // Function name to execute
    args?: Record<string, any>;
  };
}

/**
 * Union type for all step types
 */
export type AnyWorkflowStep = 
  | AIRequestStep
  | TransformStep
  | ConditionStep
  | ParallelStep
  | LoopStep
  | WaitStep
  | WebhookStep
  | CustomStep;

/**
 * Step condition
 */
export interface StepCondition {
  variable: string;
  operator: ConditionOperator;
  value: any;
  and?: StepCondition[];
  or?: StepCondition[];
}

/**
 * Retry policy
 */
export interface RetryPolicy {
  maxRetries: number;
  retryDelay: number;  // Milliseconds
  backoffMultiplier?: number;
  retryOn?: string[];  // Error types to retry on
}

/**
 * Prompt template
 */
export interface PromptTemplate {
  template: string;
  variables: Record<string, string>;  // Variable mappings
}

/**
 * Data transformation
 */
export interface Transformation {
  type: 'extract' | 'map' | 'filter' | 'reduce' | 'format';
  config: any;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  steps: AnyWorkflowStep[];
  entryPoint: string;  // ID of first step to execute
  variables?: Record<string, any>;  // Initial variables
  metadata?: Record<string, any>;
  timeout?: number;  // Overall workflow timeout
  retryPolicy?: RetryPolicy;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
  stepId: string;
  status: StepStatus;
  output?: any;
  error?: string;
  startTime: number;
  endTime: number;
  duration: number;
  retries: number;
  metadata?: Record<string, any>;
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  workflowId: string;
  executionId: string;
  status: WorkflowStatus;
  steps: StepExecutionResult[];
  output?: any;
  error?: string;
  startTime: number;
  endTime: number;
  duration: number;
  context: WorkflowContext;
  metadata?: Record<string, any>;
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  variables?: Record<string, any>;
  timeout?: number;
  dryRun?: boolean;
  debug?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Workflow template
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  workflow: WorkflowDefinition;
  parameters: TemplateParameter[];
  examples?: TemplateExample[];
  tags?: string[];
  popularity?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Template parameter
 */
export interface TemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required: boolean;
  default?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

/**
 * Template example
 */
export interface TemplateExample {
  name: string;
  description?: string;
  parameters: Record<string, any>;
  expectedOutput?: any;
}

