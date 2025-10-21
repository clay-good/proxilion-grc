/**
 * Transformation Manager
 * 
 * Coordinates request and response transformations between AI providers.
 * Enables seamless protocol translation and multi-provider support.
 */

import { RequestTransformer, TransformationConfig, TransformationResult } from './request-transformer.js';
import { ResponseTransformer, ResponseTransformationConfig, ResponseTransformationResult } from './response-transformer.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface TransformationRule {
  id: string;
  name: string;
  description: string;
  sourceProvider: 'openai' | 'anthropic' | 'google' | 'cohere';
  targetProvider: 'openai' | 'anthropic' | 'google' | 'cohere';
  enabled: boolean;
  conditions?: {
    modelPattern?: string;
    userPattern?: string;
    organizationId?: string;
  };
  preserveMetadata?: boolean;
  strictMode?: boolean;
}

export interface TransformationPipeline {
  requestTransformation?: TransformationRule;
  responseTransformation?: TransformationRule;
}

export class TransformationManager {
  private requestTransformer: RequestTransformer;
  private responseTransformer: ResponseTransformer;
  private rules: Map<string, TransformationRule>;
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    this.requestTransformer = new RequestTransformer();
    this.responseTransformer = new ResponseTransformer();
    this.rules = new Map();
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Add transformation rule
   */
  addRule(rule: TransformationRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info('Transformation rule added', { ruleId: rule.id, name: rule.name });
    this.metrics.increment('transformation_rule_added_total');
  }

  /**
   * Remove transformation rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.logger.info('Transformation rule removed', { ruleId });
    this.metrics.increment('transformation_rule_removed_total');
  }

  /**
   * Get transformation rule
   */
  getRule(ruleId: string): TransformationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all transformation rules
   */
  getAllRules(): TransformationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Find matching transformation rule
   */
  findMatchingRule(
    sourceProvider: string,
    targetProvider: string,
    context?: {
      model?: string;
      userId?: string;
      organizationId?: string;
    }
  ): TransformationRule | undefined {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      if (rule.sourceProvider !== sourceProvider || rule.targetProvider !== targetProvider) {
        continue;
      }

      // Check conditions
      if (rule.conditions) {
        if (rule.conditions.modelPattern && context?.model) {
          const regex = new RegExp(rule.conditions.modelPattern);
          if (!regex.test(context.model)) {
            continue;
          }
        }

        if (rule.conditions.userPattern && context?.userId) {
          const regex = new RegExp(rule.conditions.userPattern);
          if (!regex.test(context.userId)) {
            continue;
          }
        }

        if (rule.conditions.organizationId && context?.organizationId) {
          if (rule.conditions.organizationId !== context.organizationId) {
            continue;
          }
        }
      }

      return rule;
    }

    return undefined;
  }

  /**
   * Transform request
   */
  async transformRequest(
    request: any,
    config: TransformationConfig
  ): Promise<TransformationResult> {
    const startTime = Date.now();

    try {
      const result = await this.requestTransformer.transform(request, config);

      const duration = Date.now() - startTime;
      this.metrics.histogram('transformation_request_duration_ms', duration, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
        success: result.success.toString(),
      });

      return result;
    } catch (error) {
      this.logger.error('Request transformation failed', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Transform response
   */
  async transformResponse(
    response: any,
    config: ResponseTransformationConfig
  ): Promise<ResponseTransformationResult> {
    const startTime = Date.now();

    try {
      const result = await this.responseTransformer.transform(response, config);

      const duration = Date.now() - startTime;
      this.metrics.histogram('transformation_response_duration_ms', duration, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
        success: result.success.toString(),
      });

      return result;
    } catch (error) {
      this.logger.error('Response transformation failed', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Transform request with rule
   */
  async transformRequestWithRule(
    request: any,
    ruleId: string
  ): Promise<TransformationResult> {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      throw new Error(`Transformation rule not found: ${ruleId}`);
    }

    if (!rule.enabled) {
      throw new Error(`Transformation rule is disabled: ${ruleId}`);
    }

    const config: TransformationConfig = {
      sourceProvider: rule.sourceProvider,
      targetProvider: rule.targetProvider,
      preserveMetadata: rule.preserveMetadata,
      strictMode: rule.strictMode,
    };

    return this.transformRequest(request, config);
  }

  /**
   * Transform response with rule
   */
  async transformResponseWithRule(
    response: any,
    ruleId: string
  ): Promise<ResponseTransformationResult> {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      throw new Error(`Transformation rule not found: ${ruleId}`);
    }

    if (!rule.enabled) {
      throw new Error(`Transformation rule is disabled: ${ruleId}`);
    }

    const config: ResponseTransformationConfig = {
      sourceProvider: rule.sourceProvider,
      targetProvider: rule.targetProvider,
      preserveMetadata: rule.preserveMetadata,
    };

    return this.transformResponse(response, config);
  }

  /**
   * Auto-transform request based on context
   */
  async autoTransformRequest(
    request: any,
    sourceProvider: string,
    targetProvider: string,
    context?: {
      model?: string;
      userId?: string;
      organizationId?: string;
    }
  ): Promise<TransformationResult> {
    const rule = this.findMatchingRule(sourceProvider, targetProvider, context);

    if (rule) {
      this.logger.info('Auto-transforming request with rule', { ruleId: rule.id, name: rule.name });
      return this.transformRequestWithRule(request, rule.id);
    }

    // No rule found, use default transformation
    const config: TransformationConfig = {
      sourceProvider: sourceProvider as any,
      targetProvider: targetProvider as any,
      preserveMetadata: true,
      strictMode: false,
    };

    return this.transformRequest(request, config);
  }

  /**
   * Auto-transform response based on context
   */
  async autoTransformResponse(
    response: any,
    sourceProvider: string,
    targetProvider: string,
    context?: {
      model?: string;
      userId?: string;
      organizationId?: string;
    }
  ): Promise<ResponseTransformationResult> {
    const rule = this.findMatchingRule(sourceProvider, targetProvider, context);

    if (rule) {
      this.logger.info('Auto-transforming response with rule', { ruleId: rule.id, name: rule.name });
      return this.transformResponseWithRule(response, rule.id);
    }

    // No rule found, use default transformation
    const config: ResponseTransformationConfig = {
      sourceProvider: sourceProvider as any,
      targetProvider: targetProvider as any,
      preserveMetadata: true,
    };

    return this.transformResponse(response, config);
  }

  /**
   * Get transformation statistics
   */
  getStats() {
    return {
      totalRules: this.rules.size,
      enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      disabledRules: Array.from(this.rules.values()).filter(r => !r.enabled).length,
      rulesByProvider: this.getRulesByProvider(),
    };
  }

  /**
   * Get rules grouped by provider
   */
  private getRulesByProvider() {
    const grouped: Record<string, number> = {};

    for (const rule of this.rules.values()) {
      const key = `${rule.sourceProvider}->${rule.targetProvider}`;
      grouped[key] = (grouped[key] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Enable rule
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      this.logger.info('Transformation rule enabled', { ruleId });
      this.metrics.increment('transformation_rule_enabled_total');
    }
  }

  /**
   * Disable rule
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      this.logger.info('Transformation rule disabled', { ruleId });
      this.metrics.increment('transformation_rule_disabled_total');
    }
  }
}

