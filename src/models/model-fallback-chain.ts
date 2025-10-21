/**
 * Model Fallback Chain
 * 
 * Defines fallback chains for automatic failover when primary models
 * are unavailable, rate-limited, or experiencing errors.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { ModelRegistry, ModelMetadata } from './model-registry.js';
import { ProviderHealthMonitor } from './provider-health-monitor.js';
import { IntelligentModelRouter, RoutingRequirements } from './intelligent-model-router.js';

export interface FallbackRule {
  id: string;
  name: string;
  description: string;
  primaryModel: string;
  fallbackModels: string[];      // Ordered list of fallback models
  enabled: boolean;
  conditions: FallbackCondition[];
  maxRetries: number;
  retryDelay: number;            // ms
  circuitBreakerThreshold: number; // Failures before opening circuit
  circuitBreakerTimeout: number;   // ms before trying again
}

export interface FallbackCondition {
  type: 'error' | 'rate_limit' | 'timeout' | 'unavailable' | 'latency' | 'cost';
  threshold?: number;
  enabled: boolean;
}

export interface FallbackAttempt {
  model: string;
  provider: string;
  success: boolean;
  error?: string;
  latency: number;
  timestamp: number;
}

export interface FallbackResult {
  success: boolean;
  finalModel: string;
  finalProvider: string;
  attempts: FallbackAttempt[];
  totalLatency: number;
  fallbacksUsed: number;
  circuitBreakerTriggered: boolean;
}

export interface CircuitBreakerState {
  model: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  nextRetryTime: number;
}

export class ModelFallbackChain {
  private logger: Logger;
  private metrics: MetricsCollector;
  private modelRegistry: ModelRegistry;
  private healthMonitor: ProviderHealthMonitor;
  private router: IntelligentModelRouter;
  private fallbackRules: Map<string, FallbackRule> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(
    modelRegistry: ModelRegistry,
    healthMonitor: ProviderHealthMonitor,
    router: IntelligentModelRouter
  ) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.modelRegistry = modelRegistry;
    this.healthMonitor = healthMonitor;
    this.router = router;

    this.initializeDefaultFallbackChains();
  }

  /**
   * Initialize default fallback chains
   */
  private initializeDefaultFallbackChains(): void {
    // GPT-4 Turbo fallback chain
    this.addFallbackRule({
      id: 'gpt-4-turbo-chain',
      name: 'GPT-4 Turbo Fallback Chain',
      description: 'Fallback from GPT-4 Turbo to alternatives',
      primaryModel: 'gpt-4-turbo',
      fallbackModels: ['claude-3-opus', 'claude-3-sonnet', 'gpt-3.5-turbo'],
      enabled: true,
      conditions: [
        { type: 'error', enabled: true },
        { type: 'rate_limit', enabled: true },
        { type: 'timeout', threshold: 5000, enabled: true },
        { type: 'unavailable', enabled: true },
      ],
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
    });

    // Claude 3 Opus fallback chain
    this.addFallbackRule({
      id: 'claude-3-opus-chain',
      name: 'Claude 3 Opus Fallback Chain',
      description: 'Fallback from Claude 3 Opus to alternatives',
      primaryModel: 'claude-3-opus',
      fallbackModels: ['gpt-4-turbo', 'claude-3-sonnet', 'gemini-pro'],
      enabled: true,
      conditions: [
        { type: 'error', enabled: true },
        { type: 'rate_limit', enabled: true },
        { type: 'timeout', threshold: 5000, enabled: true },
        { type: 'unavailable', enabled: true },
      ],
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
    });

    // Cost-optimized fallback chain
    this.addFallbackRule({
      id: 'cost-optimized-chain',
      name: 'Cost-Optimized Fallback Chain',
      description: 'Start with cheapest, fallback to more expensive',
      primaryModel: 'gpt-3.5-turbo',
      fallbackModels: ['gemini-pro', 'claude-3-sonnet', 'gpt-4-turbo'],
      enabled: true,
      conditions: [
        { type: 'error', enabled: true },
        { type: 'rate_limit', enabled: true },
        { type: 'unavailable', enabled: true },
      ],
      maxRetries: 3,
      retryDelay: 500,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 30000,
    });

    this.logger.info('Initialized default fallback chains', { 
      chainCount: this.fallbackRules.size 
    });
  }

  /**
   * Add a fallback rule
   */
  addFallbackRule(rule: FallbackRule): void {
    this.fallbackRules.set(rule.id, rule);
    this.logger.info('Added fallback rule', { ruleId: rule.id, primaryModel: rule.primaryModel });
  }

  /**
   * Get fallback rule by ID
   */
  getFallbackRule(ruleId: string): FallbackRule | undefined {
    return this.fallbackRules.get(ruleId);
  }

  /**
   * Get fallback rule for a model
   */
  getFallbackRuleForModel(modelId: string): FallbackRule | undefined {
    return Array.from(this.fallbackRules.values()).find(
      rule => rule.primaryModel === modelId && rule.enabled
    );
  }

  /**
   * Execute fallback chain for a failed request
   */
  async executeFallback(
    primaryModel: string,
    error: Error,
    requirements?: RoutingRequirements
  ): Promise<FallbackResult> {
    const startTime = Date.now();
    const attempts: FallbackAttempt[] = [];
    let circuitBreakerTriggered = false;

    // Get fallback rule
    const rule = this.getFallbackRuleForModel(primaryModel);
    if (!rule) {
      this.logger.warn('No fallback rule found for model', { primaryModel });
      return {
        success: false,
        finalModel: primaryModel,
        finalProvider: this.modelRegistry.getModel(primaryModel)?.provider || 'unknown',
        attempts,
        totalLatency: Date.now() - startTime,
        fallbacksUsed: 0,
        circuitBreakerTriggered: false,
      };
    }

    // Check if error matches fallback conditions
    if (!this.shouldFallback(error, rule)) {
      this.logger.debug('Error does not match fallback conditions', { 
        primaryModel, 
        error: error.message 
      });
      return {
        success: false,
        finalModel: primaryModel,
        finalProvider: this.modelRegistry.getModel(primaryModel)?.provider || 'unknown',
        attempts,
        totalLatency: Date.now() - startTime,
        fallbacksUsed: 0,
        circuitBreakerTriggered: false,
      };
    }

    // Record primary model failure
    attempts.push({
      model: primaryModel,
      provider: this.modelRegistry.getModel(primaryModel)?.provider || 'unknown',
      success: false,
      error: error.message,
      latency: 0,
      timestamp: Date.now(),
    });

    // Update circuit breaker
    this.updateCircuitBreaker(primaryModel, false);

    // Try fallback models
    for (const fallbackModel of rule.fallbackModels) {
      // Check circuit breaker
      if (this.isCircuitOpen(fallbackModel)) {
        this.logger.debug('Circuit breaker open for model', { model: fallbackModel });
        circuitBreakerTriggered = true;
        continue;
      }

      // Check if model is available
      const model = this.modelRegistry.getModel(fallbackModel);
      if (!model || !model.available) {
        this.logger.debug('Fallback model not available', { model: fallbackModel });
        continue;
      }

      // Check provider health
      if (!this.healthMonitor.isProviderAvailable(model.provider)) {
        this.logger.debug('Fallback model provider unhealthy', { 
          model: fallbackModel, 
          provider: model.provider 
        });
        continue;
      }

      // Attempt fallback
      const attemptStart = Date.now();
      try {
        // In a real implementation, this would make the actual request
        // For now, we'll simulate it
        await new Promise(resolve => setTimeout(resolve, rule.retryDelay));
        
        const success = Math.random() > 0.1; // 90% success rate simulation
        const latency = Date.now() - attemptStart;

        attempts.push({
          model: fallbackModel,
          provider: model.provider,
          success,
          latency,
          timestamp: Date.now(),
        });

        if (success) {
          this.updateCircuitBreaker(fallbackModel, true);
          this.metrics.increment('model_fallback_success_total', 1, {
            primaryModel,
            fallbackModel,
          });

          this.logger.info('Fallback successful', { 
            primaryModel, 
            fallbackModel,
            attempts: attempts.length 
          });

          return {
            success: true,
            finalModel: fallbackModel,
            finalProvider: model.provider,
            attempts,
            totalLatency: Date.now() - startTime,
            fallbacksUsed: attempts.length - 1,
            circuitBreakerTriggered,
          };
        } else {
          this.updateCircuitBreaker(fallbackModel, false);
        }
      } catch (fallbackError) {
        const latency = Date.now() - attemptStart;
        attempts.push({
          model: fallbackModel,
          provider: model.provider,
          success: false,
          error: (fallbackError as Error).message,
          latency,
          timestamp: Date.now(),
        });

        this.updateCircuitBreaker(fallbackModel, false);
      }
    }

    // All fallbacks failed
    this.metrics.increment('model_fallback_exhausted_total', 1, { primaryModel });
    this.logger.error('All fallbacks exhausted', undefined, {
      primaryModel,
      attempts: attempts.length
    });

    return {
      success: false,
      finalModel: primaryModel,
      finalProvider: this.modelRegistry.getModel(primaryModel)?.provider || 'unknown',
      attempts,
      totalLatency: Date.now() - startTime,
      fallbacksUsed: attempts.length - 1,
      circuitBreakerTriggered,
    };
  }

  /**
   * Check if error should trigger fallback
   */
  private shouldFallback(error: Error, rule: FallbackRule): boolean {
    const errorMessage = error.message.toLowerCase();

    for (const condition of rule.conditions) {
      if (!condition.enabled) continue;

      switch (condition.type) {
        case 'error':
          return true; // Any error triggers fallback

        case 'rate_limit':
          if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            return true;
          }
          break;

        case 'timeout':
          if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
            return true;
          }
          break;

        case 'unavailable':
          if (errorMessage.includes('unavailable') || errorMessage.includes('503')) {
            return true;
          }
          break;
      }
    }

    return false;
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreaker(model: string, success: boolean): void {
    let state = this.circuitBreakers.get(model);
    
    if (!state) {
      state = {
        model,
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        nextRetryTime: 0,
      };
    }

    const rule = this.getFallbackRuleForModel(model);
    if (!rule) return;

    if (success) {
      // Reset on success
      state.failureCount = 0;
      state.state = 'closed';
    } else {
      // Increment failure count
      state.failureCount++;
      state.lastFailureTime = Date.now();

      // Open circuit if threshold exceeded
      if (state.failureCount >= rule.circuitBreakerThreshold) {
        state.state = 'open';
        state.nextRetryTime = Date.now() + rule.circuitBreakerTimeout;
        
        this.logger.warn('Circuit breaker opened', { 
          model, 
          failureCount: state.failureCount 
        });
        
        this.metrics.increment('model_circuit_breaker_opened_total', 1, { model });
      }
    }

    this.circuitBreakers.set(model, state);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(model: string): boolean {
    const state = this.circuitBreakers.get(model);
    if (!state || state.state === 'closed') {
      return false;
    }

    // Check if timeout has passed
    if (state.state === 'open' && Date.now() >= state.nextRetryTime) {
      state.state = 'half-open';
      this.circuitBreakers.set(model, state);
      return false;
    }

    return state.state === 'open';
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(model: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(model);
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(model: string): void {
    this.circuitBreakers.delete(model);
    this.logger.info('Reset circuit breaker', { model });
  }

  /**
   * Get fallback statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    circuitBreakersOpen: number;
    circuitBreakersHalfOpen: number;
  } {
    const rules = Array.from(this.fallbackRules.values());
    const breakers = Array.from(this.circuitBreakers.values());

    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      circuitBreakersOpen: breakers.filter(b => b.state === 'open').length,
      circuitBreakersHalfOpen: breakers.filter(b => b.state === 'half-open').length,
    };
  }
}

