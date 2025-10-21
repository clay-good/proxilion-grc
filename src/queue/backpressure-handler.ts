/**
 * Backpressure Handler
 * 
 * Implements backpressure mechanisms to protect the system from overload:
 * - Load shedding
 * - Request rejection
 * - Adaptive rate limiting
 * - Circuit breaking
 * - Graceful degradation
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { PriorityLevel } from './priority-queue-manager.js';

export type BackpressureStrategy = 'reject' | 'shed' | 'throttle' | 'degrade';
export type LoadLevel = 'normal' | 'elevated' | 'high' | 'critical';

export interface BackpressureConfig {
  enabled: boolean;
  strategy: BackpressureStrategy;
  
  // Thresholds
  elevatedThreshold: number;   // 0-1 (e.g., 0.7 = 70% capacity)
  highThreshold: number;       // 0-1 (e.g., 0.85 = 85% capacity)
  criticalThreshold: number;   // 0-1 (e.g., 0.95 = 95% capacity)
  
  // Load shedding
  shedPriorities: PriorityLevel[]; // Priorities to shed under load
  shedPercentage: number;      // Percentage to shed (0-1)
  
  // Throttling
  throttleRate: number;        // Requests per second
  throttleWindow: number;      // Window in ms
  
  // Circuit breaker
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number; // Error rate threshold (0-1)
  circuitBreakerTimeout: number;   // Timeout in ms
}

export interface BackpressureStatus {
  enabled: boolean;
  loadLevel: LoadLevel;
  currentLoad: number;         // 0-1
  strategy: BackpressureStrategy;
  rejectedRequests: number;
  shedRequests: number;
  throttledRequests: number;
  circuitBreakerOpen: boolean;
}

export interface LoadMetrics {
  queueUtilization: number;    // 0-1
  processingUtilization: number; // 0-1
  cpuUtilization?: number;     // 0-1
  memoryUtilization?: number;  // 0-1
  errorRate: number;           // 0-1
}

export class BackpressureHandler {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: BackpressureConfig;
  
  // State
  private currentLoadLevel: LoadLevel = 'normal';
  private rejectedCount: number = 0;
  private shedCount: number = 0;
  private throttledCount: number = 0;
  
  // Circuit breaker
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerOpenedAt?: number;
  private recentErrors: number = 0;
  private recentRequests: number = 0;
  
  // Throttling
  private throttleTokens: number;
  private lastThrottleRefill: number;

  constructor(config?: Partial<BackpressureConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      enabled: config?.enabled ?? true,
      strategy: config?.strategy ?? 'shed',
      elevatedThreshold: config?.elevatedThreshold ?? 0.70,
      highThreshold: config?.highThreshold ?? 0.85,
      criticalThreshold: config?.criticalThreshold ?? 0.95,
      shedPriorities: config?.shedPriorities ?? ['low', 'background'],
      shedPercentage: config?.shedPercentage ?? 0.5,
      throttleRate: config?.throttleRate ?? 100,
      throttleWindow: config?.throttleWindow ?? 1000,
      enableCircuitBreaker: config?.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: config?.circuitBreakerThreshold ?? 0.5,
      circuitBreakerTimeout: config?.circuitBreakerTimeout ?? 30000,
    };
    
    this.throttleTokens = this.config.throttleRate;
    this.lastThrottleRefill = Date.now();
  }

  /**
   * Check if request should be allowed
   */
  shouldAllow(priority: PriorityLevel, loadMetrics: LoadMetrics): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Update load level
    this.updateLoadLevel(loadMetrics);

    // Check circuit breaker
    if (this.config.enableCircuitBreaker && this.circuitBreakerOpen) {
      // Check if timeout has passed
      if (this.circuitBreakerOpenedAt && Date.now() - this.circuitBreakerOpenedAt > this.config.circuitBreakerTimeout) {
        this.closeCircuitBreaker();
      } else {
        this.rejectedCount++;
        this.metrics.increment('backpressure_rejected_total', 1, {
          reason: 'circuit_breaker',
          priority,
        });
        
        return {
          allowed: false,
          reason: 'Circuit breaker is open',
          retryAfter: this.config.circuitBreakerTimeout,
        };
      }
    }

    // Apply strategy based on load level
    switch (this.currentLoadLevel) {
      case 'normal':
        return { allowed: true };
      
      case 'elevated':
        return this.applyElevatedStrategy(priority);
      
      case 'high':
        return this.applyHighStrategy(priority);
      
      case 'critical':
        return this.applyCriticalStrategy(priority);
      
      default:
        return { allowed: true };
    }
  }

  /**
   * Apply strategy for elevated load
   */
  private applyElevatedStrategy(priority: PriorityLevel): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    // Shed low priority requests
    if (this.config.strategy === 'shed' && this.config.shedPriorities.includes(priority)) {
      if (Math.random() < this.config.shedPercentage * 0.5) {
        this.shedCount++;
        this.metrics.increment('backpressure_shed_total', 1, {
          priority,
          loadLevel: 'elevated',
        });
        
        return {
          allowed: false,
          reason: 'Load shedding (elevated load)',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Apply strategy for high load
   */
  private applyHighStrategy(priority: PriorityLevel): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    // Shed more aggressively
    if (this.config.strategy === 'shed' && this.config.shedPriorities.includes(priority)) {
      if (Math.random() < this.config.shedPercentage) {
        this.shedCount++;
        this.metrics.increment('backpressure_shed_total', 1, {
          priority,
          loadLevel: 'high',
        });
        
        return {
          allowed: false,
          reason: 'Load shedding (high load)',
        };
      }
    }

    // Throttle all requests
    if (this.config.strategy === 'throttle') {
      if (!this.checkThrottle()) {
        this.throttledCount++;
        this.metrics.increment('backpressure_throttled_total', 1, {
          priority,
          loadLevel: 'high',
        });
        
        return {
          allowed: false,
          reason: 'Throttled (high load)',
          retryAfter: this.config.throttleWindow,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Apply strategy for critical load
   */
  private applyCriticalStrategy(priority: PriorityLevel): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    // Only allow critical and high priority
    if (priority !== 'critical' && priority !== 'high') {
      this.rejectedCount++;
      this.metrics.increment('backpressure_rejected_total', 1, {
        reason: 'critical_load',
        priority,
      });
      
      return {
        allowed: false,
        reason: 'System under critical load',
        retryAfter: 5000,
      };
    }

    // Shed high priority with 50% probability
    if (priority === 'high' && Math.random() < 0.5) {
      this.shedCount++;
      this.metrics.increment('backpressure_shed_total', 1, {
        priority,
        loadLevel: 'critical',
      });
      
      return {
        allowed: false,
        reason: 'Load shedding (critical load)',
      };
    }

    return { allowed: true };
  }

  /**
   * Check throttle
   */
  private checkThrottle(): boolean {
    const now = Date.now();
    const timeSinceRefill = now - this.lastThrottleRefill;

    // Refill tokens
    if (timeSinceRefill >= this.config.throttleWindow) {
      this.throttleTokens = this.config.throttleRate;
      this.lastThrottleRefill = now;
    }

    // Check if tokens available
    if (this.throttleTokens > 0) {
      this.throttleTokens--;
      return true;
    }

    return false;
  }

  /**
   * Update load level
   */
  private updateLoadLevel(loadMetrics: LoadMetrics): void {
    // Calculate overall load (weighted average)
    const load = (
      loadMetrics.queueUtilization * 0.4 +
      loadMetrics.processingUtilization * 0.4 +
      (loadMetrics.cpuUtilization || 0) * 0.1 +
      (loadMetrics.memoryUtilization || 0) * 0.1
    );

    let newLevel: LoadLevel;

    if (load >= this.config.criticalThreshold) {
      newLevel = 'critical';
    } else if (load >= this.config.highThreshold) {
      newLevel = 'high';
    } else if (load >= this.config.elevatedThreshold) {
      newLevel = 'elevated';
    } else {
      newLevel = 'normal';
    }

    if (newLevel !== this.currentLoadLevel) {
      this.logger.info('Load level changed', {
        oldLevel: this.currentLoadLevel,
        newLevel,
        load: load.toFixed(2),
      });

      this.currentLoadLevel = newLevel;

      this.metrics.gauge('backpressure_load_level', this.loadLevelToNumber(newLevel));
    }

    this.metrics.gauge('backpressure_load', load);
  }

  /**
   * Record request result
   */
  recordResult(success: boolean): void {
    this.recentRequests++;
    if (!success) {
      this.recentErrors++;
    }

    // Check circuit breaker
    if (this.config.enableCircuitBreaker && this.recentRequests >= 10) {
      const errorRate = this.recentErrors / this.recentRequests;
      
      if (errorRate >= this.config.circuitBreakerThreshold) {
        this.openCircuitBreaker();
      }

      // Reset counters
      this.recentRequests = 0;
      this.recentErrors = 0;
    }
  }

  /**
   * Open circuit breaker
   */
  private openCircuitBreaker(): void {
    if (this.circuitBreakerOpen) {
      return;
    }

    this.circuitBreakerOpen = true;
    this.circuitBreakerOpenedAt = Date.now();

    this.logger.warn('Circuit breaker opened', {
      errorRate: (this.recentErrors / this.recentRequests).toFixed(2),
      threshold: this.config.circuitBreakerThreshold,
    });

    this.metrics.increment('backpressure_circuit_breaker_opened_total');
  }

  /**
   * Close circuit breaker
   */
  private closeCircuitBreaker(): void {
    if (!this.circuitBreakerOpen) {
      return;
    }

    this.circuitBreakerOpen = false;
    this.circuitBreakerOpenedAt = undefined;

    this.logger.info('Circuit breaker closed');

    this.metrics.increment('backpressure_circuit_breaker_closed_total');
  }

  /**
   * Get status
   */
  getStatus(): BackpressureStatus {
    return {
      enabled: this.config.enabled,
      loadLevel: this.currentLoadLevel,
      currentLoad: this.loadLevelToNumber(this.currentLoadLevel) / 3,
      strategy: this.config.strategy,
      rejectedRequests: this.rejectedCount,
      shedRequests: this.shedCount,
      throttledRequests: this.throttledCount,
      circuitBreakerOpen: this.circuitBreakerOpen,
    };
  }

  /**
   * Reset counters
   */
  reset(): void {
    this.rejectedCount = 0;
    this.shedCount = 0;
    this.throttledCount = 0;
    this.recentErrors = 0;
    this.recentRequests = 0;
  }

  /**
   * Convert load level to number
   */
  private loadLevelToNumber(level: LoadLevel): number {
    switch (level) {
      case 'normal': return 0;
      case 'elevated': return 1;
      case 'high': return 2;
      case 'critical': return 3;
    }
  }
}

