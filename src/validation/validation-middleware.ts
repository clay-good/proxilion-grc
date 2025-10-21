/**
 * Validation Middleware
 * 
 * Middleware for validating requests and responses against registered schemas
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { UnifiedAIRequest, UnifiedAIResponse } from '../types/index.js';
import { SchemaRegistry } from './schema-registry.js';
import { JSONSchemaValidator } from './json-schema-validator.js';
import {
  ValidationMiddlewareConfig,
  ValidationResult,
  SchemaMatchCriteria,
  ValidationContext,
  JSONSchema,
} from './schema-types.js';

export class ValidationMiddleware {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<ValidationMiddlewareConfig>;
  private schemaRegistry: SchemaRegistry;
  private validator: JSONSchemaValidator;

  constructor(
    schemaRegistry: SchemaRegistry,
    config?: Partial<ValidationMiddlewareConfig>
  ) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.schemaRegistry = schemaRegistry;
    this.validator = new JSONSchemaValidator();

    this.config = {
      validateRequests: config?.validateRequests ?? true,
      validateResponses: config?.validateResponses ?? true,
      strictMode: config?.strictMode ?? false,
      failOnValidationError: config?.failOnValidationError ?? false,
      logValidationErrors: config?.logValidationErrors ?? true,
      collectMetrics: config?.collectMetrics ?? true,
    };

    this.logger.info('Validation middleware initialized', {
      validateRequests: this.config.validateRequests,
      validateResponses: this.config.validateResponses,
    });
  }

  /**
   * Validate request
   */
  async validateRequest(request: UnifiedAIRequest): Promise<ValidationResult> {
    if (!this.config.validateRequests) {
      return this.createPassResult();
    }

    const startTime = Date.now();

    try {
      // Find matching schema
      const criteria: SchemaMatchCriteria = {
        provider: request.provider,
        model: request.model,
        endpoint: request.metadata.endpoint,
        method: 'POST',
        contentType: 'application/json',
        direction: 'request',
      };

      const schema = this.schemaRegistry.getSchemaByMatch(criteria);
      if (!schema) {
        this.logger.debug('No schema found for request', { criteria });
        return this.createPassResult();
      }

      // Validate request data
      const context: ValidationContext = {
        strictMode: this.config.strictMode,
        allowAdditionalProperties: !this.config.strictMode,
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
        validateFormats: true,
      };

      const result = this.validator.validate(
        this.extractRequestData(request),
        schema.schema as JSONSchema,
        context
      );

      result.metadata.schemaId = schema.id;
      result.metadata.schemaVersion = schema.version;

      // Update statistics
      const duration = Date.now() - startTime;
      this.schemaRegistry.updateStats(schema.id, result.valid, duration, result.errors);

      // Log validation errors
      if (!result.valid && this.config.logValidationErrors) {
        this.logger.warn('Request validation failed', {
          schemaId: schema.id,
          errors: result.errors,
          correlationId: request.metadata.correlationId,
        });
      }

      // Collect metrics
      if (this.config.collectMetrics) {
        this.metrics.increment('request_validation_total');
        if (result.valid) {
          this.metrics.increment('request_validation_success_total');
        } else {
          this.metrics.increment('request_validation_failure_total');
        }
        this.metrics.histogram('request_validation_duration_ms', duration);
      }

      // Throw error if configured
      if (!result.valid && this.config.failOnValidationError) {
        throw new ValidationError('Request validation failed', result.errors);
      }

      return result;
    } catch (error) {
      this.logger.error('Request validation error', error as Error);
      throw error;
    }
  }

  /**
   * Validate response
   */
  async validateResponse(
    response: UnifiedAIResponse,
    request: UnifiedAIRequest
  ): Promise<ValidationResult> {
    if (!this.config.validateResponses) {
      return this.createPassResult();
    }

    const startTime = Date.now();

    try {
      // Find matching schema
      const criteria: SchemaMatchCriteria = {
        provider: request.provider,
        model: request.model,
        endpoint: request.metadata.endpoint,
        method: 'POST',
        contentType: 'application/json',
        direction: 'response',
      };

      const schema = this.schemaRegistry.getSchemaByMatch(criteria);
      if (!schema) {
        this.logger.debug('No schema found for response', { criteria });
        return this.createPassResult();
      }

      // Validate response data
      const context: ValidationContext = {
        strictMode: this.config.strictMode,
        allowAdditionalProperties: !this.config.strictMode,
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
        validateFormats: true,
      };

      const result = this.validator.validate(
        this.extractResponseData(response),
        schema.schema as JSONSchema,
        context
      );

      result.metadata.schemaId = schema.id;
      result.metadata.schemaVersion = schema.version;

      // Update statistics
      const duration = Date.now() - startTime;
      this.schemaRegistry.updateStats(schema.id, result.valid, duration, result.errors);

      // Log validation errors
      if (!result.valid && this.config.logValidationErrors) {
        this.logger.warn('Response validation failed', {
          schemaId: schema.id,
          errors: result.errors,
          correlationId: request.metadata.correlationId,
        });
      }

      // Collect metrics
      if (this.config.collectMetrics) {
        this.metrics.increment('response_validation_total');
        if (result.valid) {
          this.metrics.increment('response_validation_success_total');
        } else {
          this.metrics.increment('response_validation_failure_total');
        }
        this.metrics.histogram('response_validation_duration_ms', duration);
      }

      // Throw error if configured
      if (!result.valid && this.config.failOnValidationError) {
        throw new ValidationError('Response validation failed', result.errors);
      }

      return result;
    } catch (error) {
      this.logger.error('Response validation error', error as Error);
      throw error;
    }
  }

  /**
   * Extract request data for validation
   */
  private extractRequestData(request: UnifiedAIRequest): any {
    return {
      model: request.model,
      messages: request.messages,
      temperature: request.parameters.temperature,
      maxTokens: request.parameters.maxTokens,
      topP: request.parameters.topP,
      frequencyPenalty: request.parameters.frequencyPenalty,
      presencePenalty: request.parameters.presencePenalty,
      stop: request.parameters.stopSequences,
      stream: request.streaming,
      tools: request.tools,
    };
  }

  /**
   * Extract response data for validation
   */
  private extractResponseData(response: UnifiedAIResponse): any {
    return {
      provider: response.provider,
      model: response.model,
      content: response.content,
      finishReason: response.finishReason,
      usage: response.usage,
      metadata: response.metadata,
    };
  }

  /**
   * Create pass result (no validation performed)
   */
  private createPassResult(): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      metadata: {
        validatedAt: Date.now(),
        duration: 0,
      },
    };
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return this.schemaRegistry.getStats();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidationMiddlewareConfig>): void {
    Object.assign(this.config, config);
    this.logger.info('Validation middleware configuration updated', config);
  }
}

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: any[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

