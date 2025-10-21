/**
 * Policy engine for evaluating security policies and making decisions
 */

import {
  Policy,
  PolicyCondition,
  PolicyDecision,
  PolicyAction,
  AggregatedScanResult,
  ThreatLevel,
  UnifiedAIRequest,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

// Re-export Policy type for external use
export type { Policy } from '../types/index.js';

export class PolicyEngine {
  private policies: Policy[] = [];

  constructor() {
    this.loadDefaultPolicies();
  }

  private loadDefaultPolicies(): void {
    // Default policy: Block critical threats
    this.addPolicy({
      id: 'default-block-critical',
      name: 'Block Critical Threats',
      description: 'Automatically block requests with critical threat level',
      enabled: true,
      priority: 100,
      conditions: [
        {
          type: 'threat_level',
          operator: 'eq',
          value: ThreatLevel.CRITICAL,
        },
      ],
      actions: [
        {
          action: PolicyAction.BLOCK,
        },
        {
          action: PolicyAction.ALERT,
        },
      ],
    });

    // Default policy: Alert on high threats
    this.addPolicy({
      id: 'default-alert-high',
      name: 'Alert on High Threats',
      description: 'Alert security team for high threat level requests',
      enabled: true,
      priority: 90,
      conditions: [
        {
          type: 'threat_level',
          operator: 'eq',
          value: ThreatLevel.HIGH,
        },
      ],
      actions: [
        {
          action: PolicyAction.ALERT,
        },
        {
          action: PolicyAction.LOG,
        },
        {
          action: PolicyAction.ALLOW,
        },
      ],
    });

    // Default policy: Log medium threats
    this.addPolicy({
      id: 'default-log-medium',
      name: 'Log Medium Threats',
      description: 'Log requests with medium threat level',
      enabled: true,
      priority: 80,
      conditions: [
        {
          type: 'threat_level',
          operator: 'eq',
          value: ThreatLevel.MEDIUM,
        },
      ],
      actions: [
        {
          action: PolicyAction.LOG,
        },
        {
          action: PolicyAction.ALLOW,
        },
      ],
    });

    // Default policy: Allow low/no threats
    this.addPolicy({
      id: 'default-allow-safe',
      name: 'Allow Safe Requests',
      description: 'Allow requests with low or no threat level',
      enabled: true,
      priority: 70,
      conditions: [
        {
          type: 'threat_level',
          operator: 'in',
          value: [ThreatLevel.LOW, ThreatLevel.NONE],
        },
      ],
      actions: [
        {
          action: PolicyAction.ALLOW,
        },
      ],
    });
  }

  addPolicy(policy: Policy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
    logger.info(`Added policy: ${policy.name}`, { policyId: policy.id });
  }

  updatePolicy(policyId: string, updates: Partial<Policy>): boolean {
    const policy = this.policies.find((p) => p.id === policyId);
    if (policy) {
      Object.assign(policy, updates);
      this.policies.sort((a, b) => b.priority - a.priority);
      logger.info(`Updated policy: ${policyId}`);
      return true;
    }
    return false;
  }

  removePolicy(policyId: string): boolean {
    const index = this.policies.findIndex((p) => p.id === policyId);
    if (index !== -1) {
      this.policies.splice(index, 1);
      logger.info(`Removed policy: ${policyId}`);
      return true;
    }
    return false;
  }

  async evaluate(
    request: UnifiedAIRequest,
    scanResult: AggregatedScanResult
  ): Promise<PolicyDecision> {
    const startTime = Date.now();

    logger.info('Evaluating policies', {
      correlationId: request.metadata.correlationId,
      threatLevel: scanResult.overallThreatLevel,
      policyCount: this.policies.length,
    });

    // Find first matching policy
    for (const policy of this.policies) {
      if (!policy.enabled) continue;

      const matches = this.evaluateConditions(policy.conditions, request, scanResult);

      if (matches.allMatched) {
        const decision: PolicyDecision = {
          policyId: policy.id,
          action: this.getPrimaryAction(policy.actions),
          reason: `Policy "${policy.name}" matched`,
          matchedConditions: matches.matched,
          timestamp: Date.now(),
          metadata: {
            policyName: policy.name,
            policyPriority: policy.priority,
            allActions: policy.actions.map((a) => a.action),
          },
        };

        const duration = Date.now() - startTime;
        metrics.histogram('policy.evaluation.duration', duration);
        metrics.counter('policy.matched', 1, {
          policyId: policy.id,
          action: decision.action,
        });

        logger.info('Policy matched', {
          correlationId: request.metadata.correlationId,
          policyId: policy.id,
          policyName: policy.name,
          action: decision.action,
          duration,
        });

        return decision;
      }
    }

    // No policy matched - default to block for safety
    const decision: PolicyDecision = {
      policyId: 'default-fallback',
      action: PolicyAction.BLOCK,
      reason: 'No matching policy found - defaulting to block',
      matchedConditions: [],
      timestamp: Date.now(),
    };

    logger.warn('No policy matched - using fallback', {
      correlationId: request.metadata.correlationId,
    });

    return decision;
  }

  private evaluateConditions(
    conditions: PolicyCondition[],
    request: UnifiedAIRequest,
    scanResult: AggregatedScanResult
  ): { allMatched: boolean; matched: PolicyCondition[] } {
    const matched: PolicyCondition[] = [];

    for (const condition of conditions) {
      if (this.evaluateCondition(condition, request, scanResult)) {
        matched.push(condition);
      }
    }

    return {
      allMatched: matched.length === conditions.length,
      matched,
    };
  }

  private evaluateCondition(
    condition: PolicyCondition,
    request: UnifiedAIRequest,
    scanResult: AggregatedScanResult
  ): boolean {
    switch (condition.type) {
      case 'threat_level':
        return this.evaluateThreatLevel(condition, scanResult.overallThreatLevel);

      case 'scanner':
        return this.evaluateScanner(condition, scanResult);

      case 'user':
        return this.evaluateUser(condition, request);

      case 'time':
        return this.evaluateTime(condition);

      default:
        logger.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  private evaluateThreatLevel(condition: PolicyCondition, threatLevel: ThreatLevel): boolean {
    // Map threat levels to numeric values for comparison
    const threatLevelValues: Record<ThreatLevel, number> = {
      [ThreatLevel.NONE]: 0,
      [ThreatLevel.LOW]: 1,
      [ThreatLevel.MEDIUM]: 2,
      [ThreatLevel.HIGH]: 3,
      [ThreatLevel.CRITICAL]: 4,
    };

    const currentValue = threatLevelValues[threatLevel];
    const conditionValue = threatLevelValues[condition.value as ThreatLevel];

    switch (condition.operator) {
      case 'eq':
        return threatLevel === condition.value;

      case 'ne':
        return threatLevel !== condition.value;

      case 'gt':
        return currentValue > conditionValue;

      case 'gte':
        return currentValue >= conditionValue;

      case 'lt':
        return currentValue < conditionValue;

      case 'lte':
        return currentValue <= conditionValue;

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(threatLevel);

      default:
        return false;
    }
  }

  private evaluateScanner(condition: PolicyCondition, scanResult: AggregatedScanResult): boolean {
    const scannerId = condition.field;
    if (!scannerId) return false;

    const scannerResult = scanResult.scanResults.find((r) => r.scannerId === scannerId);
    if (!scannerResult) return false;

    switch (condition.operator) {
      case 'eq':
        return scannerResult.passed === condition.value;

      case 'gt':
        return scannerResult.score > (condition.value as number);

      case 'gte':
        return scannerResult.score >= (condition.value as number);

      case 'lt':
        return scannerResult.score < (condition.value as number);

      case 'lte':
        return scannerResult.score <= (condition.value as number);

      default:
        return false;
    }
  }

  private evaluateUser(condition: PolicyCondition, request: UnifiedAIRequest): boolean {
    const userId = request.metadata.userId;
    if (!userId) return false;

    switch (condition.operator) {
      case 'eq':
        return userId === condition.value;

      case 'ne':
        return userId !== condition.value;

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(userId);

      default:
        return false;
    }
  }

  private evaluateTime(condition: PolicyCondition): boolean {
    const now = new Date();
    const currentHour = now.getHours();

    // Example: business hours check
    if (condition.field === 'business_hours') {
      return currentHour >= 9 && currentHour < 17;
    }

    return false;
  }

  private getPrimaryAction(actions: Policy['actions']): PolicyAction {
    // Priority order for actions
    const actionPriority = [
      PolicyAction.BLOCK,
      PolicyAction.QUEUE,
      PolicyAction.MODIFY,
      PolicyAction.REDIRECT,
      PolicyAction.ALERT,
      PolicyAction.LOG,
      PolicyAction.ALLOW,
    ];

    for (const priority of actionPriority) {
      if (actions.some((a) => a.action === priority)) {
        return priority;
      }
    }

    return PolicyAction.ALLOW;
  }

  getPolicies(): Policy[] {
    return [...this.policies];
  }

  getPolicy(policyId: string): Policy | undefined {
    return this.policies.find((p) => p.id === policyId);
  }
}

