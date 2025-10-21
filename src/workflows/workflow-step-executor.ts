/**
 * Workflow Step Executor
 * 
 * Implementations for different workflow step types.
 */

import { Logger } from '../utils/logger.js';
import {
  WorkflowContext,
  AIRequestStep,
  TransformStep,
  ConditionStep,
  ParallelStep,
  LoopStep,
  WebhookStep,
  StepCondition,
  ConditionOperator,
} from './workflow-types.js';

export class WorkflowStepExecutor {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Execute AI request step
   *
   * Note: This is a workflow orchestration layer. In production, this would integrate
   * with the main Proxilion proxy to route requests through the security layer.
   * For workflow testing and development, we provide a mock response.
   *
   * To integrate with production:
   * 1. Import the main proxy handler from src/index.ts
   * 2. Convert the workflow request to UnifiedAIRequest format
   * 3. Pass through the security scanning pipeline
   * 4. Return the sanitized response
   */
  async executeAIRequest(step: AIRequestStep, context: WorkflowContext): Promise<any> {
    this.logger.info('Executing AI request', { stepId: step.id });

    // Resolve prompt template
    const prompt = this.resolvePromptTemplate(step.config.prompt, context);

    // Build AI request
    const request = {
      provider: step.config.provider || 'openai',
      model: step.config.model || 'gpt-4',
      prompt,
      parameters: step.config.parameters || {},
    };

    // Mock response for workflow testing
    // In production, this would route through the main Proxilion security layer
    const response = {
      content: `AI response to: ${prompt}`,
      model: request.model,
      provider: request.provider,
      usage: {
        promptTokens: prompt.length / 4, // Approximate token count
        completionTokens: 50, // Estimated completion tokens
        totalTokens: (prompt.length / 4) + 50,
      },
    };

    // Extract specific fields if requested
    if (step.config.extractFields && step.config.extractFields.length > 0) {
      const extracted: Record<string, any> = {};
      for (const field of step.config.extractFields) {
        extracted[field] = this.extractField(response, field);
      }
      return extracted;
    }

    return response;
  }

  /**
   * Execute transform step
   */
  async executeTransform(step: TransformStep, context: WorkflowContext): Promise<any> {
    this.logger.info('Executing transform', { stepId: step.id });

    // Get input data
    const inputData = this.resolveVariable(step.config.input, context);

    // Apply transformations
    let result = inputData;
    for (const transformation of step.config.transformations) {
      result = this.applyTransformation(result, transformation);
    }

    // Store in output variable
    context.variables[step.config.output] = result;

    return result;
  }

  /**
   * Execute condition step
   */
  async executeCondition(step: ConditionStep, context: WorkflowContext): Promise<any> {
    this.logger.info('Executing condition', { stepId: step.id });

    const conditionMet = this.evaluateCondition(step.config.condition, context);

    return {
      conditionMet,
      thenSteps: conditionMet ? step.config.thenSteps : [],
      elseSteps: !conditionMet && step.config.elseSteps ? step.config.elseSteps : [],
    };
  }

  /**
   * Execute parallel step
   */
  async executeParallel(step: ParallelStep, context: WorkflowContext): Promise<any> {
    this.logger.info('Executing parallel', { stepId: step.id, stepCount: step.config.steps.length });

    // Return step IDs to execute in parallel
    return {
      parallelSteps: step.config.steps,
      waitForAll: step.config.waitForAll !== false,
      maxConcurrency: step.config.maxConcurrency,
    };
  }

  /**
   * Execute loop step
   */
  async executeLoop(step: LoopStep, context: WorkflowContext): Promise<any> {
    this.logger.info('Executing loop', { stepId: step.id });

    // Get items to loop over
    const items = this.resolveVariable(step.config.items, context);
    if (!Array.isArray(items)) {
      throw new Error(`Loop items must be an array, got ${typeof items}`);
    }

    const maxIterations = step.config.maxIterations || items.length;
    const iterationsToRun = Math.min(items.length, maxIterations);

    return {
      items: items.slice(0, iterationsToRun),
      itemVariable: step.config.itemVariable,
      steps: step.config.steps,
      parallel: step.config.parallel || false,
    };
  }

  /**
   * Execute webhook step
   */
  async executeWebhook(step: WebhookStep, context: WorkflowContext): Promise<any> {
    this.logger.info('Executing webhook', { stepId: step.id, url: step.config.url });

    // Resolve URL and body with variables
    const url = this.resolveTemplate(step.config.url, context);
    const body = step.config.body ? this.resolveObject(step.config.body, context) : undefined;

    // Make HTTP request
    const response = await fetch(url, {
      method: step.config.method,
      headers: step.config.headers || {},
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    // Extract specific fields if requested
    if (step.config.extractFields && step.config.extractFields.length > 0) {
      const extracted: Record<string, any> = {};
      for (const field of step.config.extractFields) {
        extracted[field] = this.extractField(responseData, field);
      }
      return extracted;
    }

    return responseData;
  }

  /**
   * Evaluate condition
   */
  evaluateCondition(condition: StepCondition, context: WorkflowContext): boolean {
    const value = this.resolveVariable(condition.variable, context);
    const result = this.evaluateOperator(value, condition.operator, condition.value);

    // Handle AND conditions
    if (condition.and && condition.and.length > 0) {
      return result && condition.and.every(c => this.evaluateCondition(c, context));
    }

    // Handle OR conditions
    if (condition.or && condition.or.length > 0) {
      return result || condition.or.some(c => this.evaluateCondition(c, context));
    }

    return result;
  }

  /**
   * Evaluate operator
   */
  private evaluateOperator(value: any, operator: ConditionOperator, expected: any): boolean {
    switch (operator) {
      case 'eq':
        return value === expected;
      case 'ne':
        return value !== expected;
      case 'gt':
        return value > expected;
      case 'gte':
        return value >= expected;
      case 'lt':
        return value < expected;
      case 'lte':
        return value <= expected;
      case 'contains':
        return String(value).includes(String(expected));
      case 'startsWith':
        return String(value).startsWith(String(expected));
      case 'endsWith':
        return String(value).endsWith(String(expected));
      case 'matches':
        return new RegExp(expected).test(String(value));
      case 'in':
        return Array.isArray(expected) && expected.includes(value);
      case 'notIn':
        return Array.isArray(expected) && !expected.includes(value);
      default:
        this.logger.warn('Unknown operator', { operator });
        return false;
    }
  }

  /**
   * Resolve variable from context
   */
  private resolveVariable(variable: string, context: WorkflowContext): any {
    // Check if it's a step output reference (e.g., "step1.output")
    if (variable.includes('.')) {
      const [stepId, ...path] = variable.split('.');
      if (context.stepOutputs[stepId]) {
        return this.getNestedValue(context.stepOutputs[stepId], path.join('.'));
      }
    }

    // Check variables
    if (context.variables[variable] !== undefined) {
      return context.variables[variable];
    }

    // Check step outputs
    if (context.stepOutputs[variable] !== undefined) {
      return context.stepOutputs[variable];
    }

    // Return as-is if not found (might be a literal value)
    return variable;
  }

  /**
   * Resolve prompt template
   */
  private resolvePromptTemplate(prompt: string | any, context: WorkflowContext): string {
    if (typeof prompt === 'string') {
      return this.resolveTemplate(prompt, context);
    }

    if (prompt.template) {
      let resolved = prompt.template;
      for (const [key, varName] of Object.entries(prompt.variables)) {
        const value = this.resolveVariable(varName as string, context);
        resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      return resolved;
    }

    return String(prompt);
  }

  /**
   * Resolve template string with variables
   */
  private resolveTemplate(template: string, context: WorkflowContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const value = this.resolveVariable(varName.trim(), context);
      return String(value);
    });
  }

  /**
   * Resolve object with variable substitution
   */
  private resolveObject(obj: any, context: WorkflowContext): any {
    if (typeof obj === 'string') {
      return this.resolveTemplate(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, context));
    }

    if (typeof obj === 'object' && obj !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObject(value, context);
      }
      return resolved;
    }

    return obj;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Extract field from object
   */
  private extractField(obj: any, field: string): any {
    return this.getNestedValue(obj, field);
  }

  /**
   * Apply transformation
   */
  private applyTransformation(data: any, transformation: any): any {
    switch (transformation.type) {
      case 'extract':
        return this.extractField(data, transformation.config.field);
      case 'map':
        return Array.isArray(data) ? data.map(transformation.config.fn) : data;
      case 'filter':
        return Array.isArray(data) ? data.filter(transformation.config.fn) : data;
      case 'format':
        return this.formatData(data, transformation.config.format);
      default:
        return data;
    }
  }

  /**
   * Format data
   */
  private formatData(data: any, format: string): any {
    // Simple formatting - can be expanded
    return String(data);
  }
}

