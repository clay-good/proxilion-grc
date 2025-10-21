/**
 * Example: Creating custom security policies
 */

import { Policy, PolicyAction, ThreatLevel } from '../src/types/index.js';

// Example 1: Block all requests during maintenance window
export const maintenancePolicy: Policy = {
  id: 'maintenance-block',
  name: 'Maintenance Window Block',
  description: 'Block all AI requests during scheduled maintenance',
  enabled: false, // Enable during maintenance
  priority: 200, // Very high priority
  conditions: [
    {
      type: 'time',
      field: 'maintenance_window',
      operator: 'eq',
      value: true,
    },
  ],
  actions: [
    {
      action: PolicyAction.BLOCK,
      parameters: {
        message: 'Service temporarily unavailable due to maintenance',
      },
    },
  ],
};

// Example 2: Rate limiting for specific users
export const rateLimitPolicy: Policy = {
  id: 'user-rate-limit',
  name: 'User Rate Limiting',
  description: 'Limit requests from specific users',
  enabled: true,
  priority: 150,
  conditions: [
    {
      type: 'user',
      operator: 'in',
      value: ['user-123', 'user-456'],
    },
  ],
  actions: [
    {
      action: PolicyAction.QUEUE,
      parameters: {
        maxRequestsPerMinute: 10,
      },
    },
  ],
};

// Example 3: Alert on sensitive data in finance department
export const financeDataPolicy: Policy = {
  id: 'finance-sensitive-data',
  name: 'Finance Department Data Protection',
  description: 'Alert security team when finance users send sensitive data',
  enabled: true,
  priority: 120,
  conditions: [
    {
      type: 'user',
      field: 'department',
      operator: 'eq',
      value: 'finance',
    },
    {
      type: 'scanner',
      field: 'pii-scanner',
      operator: 'gt',
      value: 0.5, // Score threshold
    },
  ],
  actions: [
    {
      action: PolicyAction.ALERT,
      parameters: {
        channel: 'security-team',
        severity: 'high',
      },
    },
    {
      action: PolicyAction.LOG,
    },
    {
      action: PolicyAction.ALLOW,
    },
  ],
};

// Example 4: Modify requests to add safety instructions
export const safetyInstructionPolicy: Policy = {
  id: 'add-safety-instructions',
  name: 'Add Safety Instructions',
  description: 'Automatically add safety instructions to all requests',
  enabled: true,
  priority: 50,
  conditions: [
    {
      type: 'threat_level',
      operator: 'in',
      value: [ThreatLevel.NONE, ThreatLevel.LOW],
    },
  ],
  actions: [
    {
      action: PolicyAction.MODIFY,
      parameters: {
        addSystemMessage: 'Always prioritize user safety and privacy in your responses.',
      },
    },
    {
      action: PolicyAction.ALLOW,
    },
  ],
};

// Example 5: Block high-risk requests from external networks
export const externalNetworkPolicy: Policy = {
  id: 'external-network-high-risk',
  name: 'Block External High-Risk Requests',
  description: 'Block high-risk requests originating from external networks',
  enabled: true,
  priority: 180,
  conditions: [
    {
      type: 'threat_level',
      operator: 'in',
      value: [ThreatLevel.HIGH, ThreatLevel.CRITICAL],
    },
    {
      type: 'custom',
      field: 'network_zone',
      operator: 'eq',
      value: 'external',
    },
  ],
  actions: [
    {
      action: PolicyAction.BLOCK,
    },
    {
      action: PolicyAction.ALERT,
      parameters: {
        channel: 'security-incidents',
        severity: 'critical',
      },
    },
  ],
};

// Example 6: Queue requests with medium threat for manual review
export const manualReviewPolicy: Policy = {
  id: 'manual-review-medium',
  name: 'Manual Review for Medium Threats',
  description: 'Queue medium threat requests for manual security review',
  enabled: true,
  priority: 85,
  conditions: [
    {
      type: 'threat_level',
      operator: 'eq',
      value: ThreatLevel.MEDIUM,
    },
  ],
  actions: [
    {
      action: PolicyAction.QUEUE,
      parameters: {
        reviewQueue: 'security-review',
        maxWaitTime: 7200000, // 2 hours
      },
    },
    {
      action: PolicyAction.LOG,
    },
  ],
};

// Example 7: Redirect requests to sandbox environment for testing
export const sandboxRedirectPolicy: Policy = {
  id: 'sandbox-redirect',
  name: 'Redirect to Sandbox',
  description: 'Redirect test users to sandbox AI environment',
  enabled: true,
  priority: 160,
  conditions: [
    {
      type: 'user',
      field: 'role',
      operator: 'eq',
      value: 'tester',
    },
  ],
  actions: [
    {
      action: PolicyAction.REDIRECT,
      parameters: {
        targetEndpoint: 'https://sandbox-api.openai.com',
      },
    },
  ],
};

// Example 8: Cost control policy
export const costControlPolicy: Policy = {
  id: 'cost-control',
  name: 'Cost Control Policy',
  description: 'Block expensive model requests that exceed budget',
  enabled: true,
  priority: 140,
  conditions: [
    {
      type: 'custom',
      field: 'estimated_cost',
      operator: 'gt',
      value: 1.0, // $1.00 per request
    },
    {
      type: 'custom',
      field: 'budget_remaining',
      operator: 'lt',
      value: 100, // Less than $100 remaining
    },
  ],
  actions: [
    {
      action: PolicyAction.BLOCK,
      parameters: {
        message: 'Request exceeds budget limits',
      },
    },
    {
      action: PolicyAction.ALERT,
      parameters: {
        channel: 'finance-team',
      },
    },
  ],
};

// Export all policies
export const customPolicies = [
  maintenancePolicy,
  rateLimitPolicy,
  financeDataPolicy,
  safetyInstructionPolicy,
  externalNetworkPolicy,
  manualReviewPolicy,
  sandboxRedirectPolicy,
  costControlPolicy,
];

