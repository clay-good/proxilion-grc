/**
 * Feature Flag Manager
 * 
 * Manages feature flags for gradual rollouts, canary deployments,
 * and feature toggles with targeting rules.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type FlagStatus = 'active' | 'inactive' | 'archived';
export type RolloutStrategy = 'percentage' | 'user-list' | 'gradual' | 'ring';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  status: FlagStatus;
  enabled: boolean;              // Master switch
  rolloutPercentage: number;     // 0-100
  rolloutStrategy: RolloutStrategy;
  targetingRules?: FlagTargetingRule[];
  whitelistedUsers?: string[];   // Always enabled for these users
  blacklistedUsers?: string[];   // Always disabled for these users
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, any>;
}

export interface FlagTargetingRule {
  type: 'user' | 'organization' | 'region' | 'environment' | 'custom';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'matches' | 'contains' | 'greater_than' | 'less_than';
  field: string;
  value: any;
}

export interface FlagEvaluation {
  flagId: string;
  enabled: boolean;
  reason: string;
  userId: string;
  evaluatedAt: number;
}

export interface GradualRolloutConfig {
  flagId: string;
  startPercentage: number;       // Starting percentage
  targetPercentage: number;      // Target percentage
  incrementPercentage: number;   // Increment per step
  incrementInterval: number;     // ms between increments
  currentPercentage: number;     // Current percentage
  lastIncrementAt: number;       // Last increment timestamp
  paused: boolean;
}

export class FeatureFlagManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  private flags: Map<string, FeatureFlag> = new Map();
  private evaluations: Map<string, FlagEvaluation[]> = new Map(); // flagId -> evaluations
  private gradualRollouts: Map<string, GradualRolloutConfig> = new Map();
  private rolloutTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Create a new feature flag
   */
  createFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): FeatureFlag {
    const newFlag: FeatureFlag = {
      ...flag,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.flags.set(newFlag.id, newFlag);
    this.evaluations.set(newFlag.id, []);

    this.logger.info('Created feature flag', {
      flagId: newFlag.id,
      enabled: newFlag.enabled,
      rolloutPercentage: newFlag.rolloutPercentage,
    });

    this.metrics.increment('feature_flags_created_total');

    return newFlag;
  }

  /**
   * Get feature flag by ID
   */
  getFlag(flagId: string): FeatureFlag | undefined {
    return this.flags.get(flagId);
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get active flags
   */
  getActiveFlags(): FeatureFlag[] {
    return this.getAllFlags().filter(f => f.status === 'active');
  }

  /**
   * Update feature flag
   */
  updateFlag(flagId: string, updates: Partial<FeatureFlag>): FeatureFlag {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    const updated: FeatureFlag = {
      ...flag,
      ...updates,
      updatedAt: Date.now(),
    };

    this.flags.set(flagId, updated);

    this.logger.info('Updated feature flag', { flagId });

    return updated;
  }

  /**
   * Enable a feature flag
   */
  enableFlag(flagId: string): FeatureFlag {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    flag.enabled = true;
    flag.updatedAt = Date.now();

    this.flags.set(flagId, flag);

    this.logger.info('Enabled feature flag', { flagId });
    this.metrics.increment('feature_flags_enabled_total');

    return flag;
  }

  /**
   * Disable a feature flag
   */
  disableFlag(flagId: string): FeatureFlag {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    flag.enabled = false;
    flag.updatedAt = Date.now();

    this.flags.set(flagId, flag);

    this.logger.info('Disabled feature flag', { flagId });
    this.metrics.increment('feature_flags_disabled_total');

    return flag;
  }

  /**
   * Evaluate feature flag for a user
   */
  evaluateFlag(flagId: string, userId: string, context?: Record<string, any>): FlagEvaluation {
    const flag = this.flags.get(flagId);
    
    if (!flag) {
      return {
        flagId,
        enabled: false,
        reason: 'Flag not found',
        userId,
        evaluatedAt: Date.now(),
      };
    }

    // Check if flag is active
    if (flag.status !== 'active') {
      return this.createEvaluation(flagId, userId, false, `Flag status: ${flag.status}`);
    }

    // Check master switch
    if (!flag.enabled) {
      return this.createEvaluation(flagId, userId, false, 'Flag disabled');
    }

    // Check blacklist
    if (flag.blacklistedUsers?.includes(userId)) {
      return this.createEvaluation(flagId, userId, false, 'User blacklisted');
    }

    // Check whitelist
    if (flag.whitelistedUsers?.includes(userId)) {
      return this.createEvaluation(flagId, userId, true, 'User whitelisted');
    }

    // Check targeting rules
    if (flag.targetingRules && flag.targetingRules.length > 0) {
      if (!this.matchesTargetingRules(flag.targetingRules, context)) {
        return this.createEvaluation(flagId, userId, false, 'Targeting rules not matched');
      }
    }

    // Check rollout percentage
    const enabled = this.isInRollout(userId, flag.rolloutPercentage);
    const reason = enabled 
      ? `In rollout (${flag.rolloutPercentage}%)`
      : `Not in rollout (${flag.rolloutPercentage}%)`;

    return this.createEvaluation(flagId, userId, enabled, reason);
  }

  /**
   * Check if flag is enabled for user
   */
  isEnabled(flagId: string, userId: string, context?: Record<string, any>): boolean {
    const evaluation = this.evaluateFlag(flagId, userId, context);
    return evaluation.enabled;
  }

  /**
   * Start gradual rollout
   */
  startGradualRollout(config: Omit<GradualRolloutConfig, 'currentPercentage' | 'lastIncrementAt' | 'paused'>): void {
    const flag = this.flags.get(config.flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${config.flagId}`);
    }

    const rolloutConfig: GradualRolloutConfig = {
      ...config,
      currentPercentage: config.startPercentage,
      lastIncrementAt: Date.now(),
      paused: false,
    };

    this.gradualRollouts.set(config.flagId, rolloutConfig);

    // Update flag
    flag.rolloutPercentage = config.startPercentage;
    flag.rolloutStrategy = 'gradual';
    this.flags.set(config.flagId, flag);

    // Start timer
    this.scheduleRolloutIncrement(config.flagId);

    this.logger.info('Started gradual rollout', {
      flagId: config.flagId,
      startPercentage: config.startPercentage,
      targetPercentage: config.targetPercentage,
    });
  }

  /**
   * Pause gradual rollout
   */
  pauseGradualRollout(flagId: string): void {
    const rollout = this.gradualRollouts.get(flagId);
    if (!rollout) {
      throw new Error(`Gradual rollout not found: ${flagId}`);
    }

    rollout.paused = true;
    this.gradualRollouts.set(flagId, rollout);

    // Clear timer
    const timer = this.rolloutTimers.get(flagId);
    if (timer) {
      clearTimeout(timer);
      this.rolloutTimers.delete(flagId);
    }

    this.logger.info('Paused gradual rollout', { flagId });
  }

  /**
   * Resume gradual rollout
   */
  resumeGradualRollout(flagId: string): void {
    const rollout = this.gradualRollouts.get(flagId);
    if (!rollout) {
      throw new Error(`Gradual rollout not found: ${flagId}`);
    }

    rollout.paused = false;
    this.gradualRollouts.set(flagId, rollout);

    // Restart timer
    this.scheduleRolloutIncrement(flagId);

    this.logger.info('Resumed gradual rollout', { flagId });
  }

  /**
   * Schedule next rollout increment
   */
  private scheduleRolloutIncrement(flagId: string): void {
    const rollout = this.gradualRollouts.get(flagId);
    if (!rollout || rollout.paused) {
      return;
    }

    // Check if target reached
    if (rollout.currentPercentage >= rollout.targetPercentage) {
      this.logger.info('Gradual rollout completed', {
        flagId,
        finalPercentage: rollout.currentPercentage,
      });
      return;
    }

    const timer = setTimeout(() => {
      this.incrementRollout(flagId);
    }, rollout.incrementInterval);

    this.rolloutTimers.set(flagId, timer);
  }

  /**
   * Increment rollout percentage
   */
  private incrementRollout(flagId: string): void {
    const rollout = this.gradualRollouts.get(flagId);
    if (!rollout || rollout.paused) {
      return;
    }

    const flag = this.flags.get(flagId);
    if (!flag) {
      return;
    }

    // Calculate new percentage
    const newPercentage = Math.min(
      rollout.currentPercentage + rollout.incrementPercentage,
      rollout.targetPercentage
    );

    // Update rollout config
    rollout.currentPercentage = newPercentage;
    rollout.lastIncrementAt = Date.now();
    this.gradualRollouts.set(flagId, rollout);

    // Update flag
    flag.rolloutPercentage = newPercentage;
    flag.updatedAt = Date.now();
    this.flags.set(flagId, flag);

    this.logger.info('Incremented rollout percentage', {
      flagId,
      oldPercentage: rollout.currentPercentage - rollout.incrementPercentage,
      newPercentage,
    });

    this.metrics.gauge('feature_flag_rollout_percentage', newPercentage, { flagId });

    // Schedule next increment
    this.scheduleRolloutIncrement(flagId);
  }

  /**
   * Create flag evaluation
   */
  private createEvaluation(flagId: string, userId: string, enabled: boolean, reason: string): FlagEvaluation {
    const evaluation: FlagEvaluation = {
      flagId,
      enabled,
      reason,
      userId,
      evaluatedAt: Date.now(),
    };

    // Store evaluation
    const evaluations = this.evaluations.get(flagId) || [];
    evaluations.push(evaluation);
    
    // Keep only last 1000 evaluations per flag
    if (evaluations.length > 1000) {
      evaluations.shift();
    }
    
    this.evaluations.set(flagId, evaluations);

    // Emit metrics
    this.metrics.increment('feature_flag_evaluations_total', 1, {
      flagId,
      enabled: enabled.toString(),
    });

    return evaluation;
  }

  /**
   * Check if user is in rollout percentage
   */
  private isInRollout(userId: string, percentage: number): boolean {
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;

    const hash = this.hashString(userId);
    const userPercentile = (hash % 100);
    
    return userPercentile < percentage;
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
   * Check if context matches targeting rules
   */
  private matchesTargetingRules(rules: FlagTargetingRule[], context?: Record<string, any>): boolean {
    if (!context) return false;

    for (const rule of rules) {
      const value = context[rule.field];
      
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
        case 'greater_than':
          if (typeof value !== 'number' || value <= rule.value) return false;
          break;
        case 'less_than':
          if (typeof value !== 'number' || value >= rule.value) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Get flag statistics
   */
  getStats(): {
    totalFlags: number;
    activeFlags: number;
    enabledFlags: number;
    gradualRollouts: number;
  } {
    const flags = this.getAllFlags();
    
    return {
      totalFlags: flags.length,
      activeFlags: flags.filter(f => f.status === 'active').length,
      enabledFlags: flags.filter(f => f.enabled).length,
      gradualRollouts: this.gradualRollouts.size,
    };
  }

  /**
   * Cleanup timers
   */
  cleanup(): void {
    for (const timer of this.rolloutTimers.values()) {
      clearTimeout(timer);
    }
    this.rolloutTimers.clear();
  }
}

