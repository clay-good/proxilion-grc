/**
 * Tests for User Analytics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UserAnalytics } from '../src/analytics/user-analytics.js';
import { UserIdentity } from '../src/identity/identity-extractor.js';
import { ThreatLevel } from '../src/types/index.js';

describe('UserAnalytics', () => {
  let analytics: UserAnalytics;

  beforeEach(() => {
    analytics = new UserAnalytics();
  });

  describe('Violation Recording', () => {
    it('should record a security violation', () => {
      const violation = {
        id: 'violation-1',
        timestamp: Date.now(),
        userId: 'user-123',
        email: 'test@example.com',
        teamId: 'team-456',
        organizationId: 'org-789',
        violationType: 'pii_email',
        threatLevel: ThreatLevel.HIGH,
        findings: [
          {
            type: 'pii_email',
            severity: ThreatLevel.HIGH,
            message: 'Email address detected',
            location: 'prompt',
            value: 'test@example.com',
          },
        ],
        requestId: 'req-1',
        blocked: true,
        model: 'gpt-4',
        provider: 'openai',
      };

      analytics.recordViolation(violation);

      const userMetrics = analytics.getUserMetrics('user-123');

      expect(userMetrics).toBeDefined();
      expect(userMetrics?.totalViolations).toBe(1);
      expect(userMetrics?.highViolations).toBe(1);
      expect(userMetrics?.piiViolations).toBe(1);
      expect(userMetrics?.blockedRequests).toBe(1);
    });

    it('should track multiple violations for the same user', () => {
      const baseViolation = {
        id: 'violation-1',
        timestamp: Date.now(),
        userId: 'user-multi',
        organizationId: 'org-1',
        violationType: 'pii_email',
        threatLevel: ThreatLevel.HIGH,
        findings: [
          {
            type: 'pii_email',
            severity: ThreatLevel.HIGH,
            message: 'Email detected',
            location: 'prompt',
          },
        ],
        requestId: 'req-1',
        blocked: true,
      };

      analytics.recordViolation(baseViolation);
      analytics.recordViolation({ ...baseViolation, id: 'violation-2', requestId: 'req-2' });
      analytics.recordViolation({ ...baseViolation, id: 'violation-3', requestId: 'req-3' });

      const userMetrics = analytics.getUserMetrics('user-multi');

      expect(userMetrics?.totalViolations).toBe(3);
      expect(userMetrics?.totalRequests).toBe(3);
      expect(userMetrics?.blockedRequests).toBe(3);
    });
  });

  describe('Successful Request Recording', () => {
    it('should record successful requests', () => {
      const identity: UserIdentity = {
        userId: 'user-success',
        email: 'success@example.com',
        organizationId: 'org-1',
        source: 'api-key',
        confidence: 1.0,
      };

      analytics.recordSuccessfulRequest(identity, 'req-1');
      analytics.recordSuccessfulRequest(identity, 'req-2');

      const userMetrics = analytics.getUserMetrics('user-success');

      expect(userMetrics?.totalRequests).toBe(2);
      expect(userMetrics?.allowedRequests).toBe(2);
      expect(userMetrics?.totalViolations).toBe(0);
    });
  });

  describe('Training Needs Assessment', () => {
    it('should identify users needing training due to critical violations', () => {
      const violation = {
        id: 'violation-critical',
        timestamp: Date.now(),
        userId: 'user-critical',
        organizationId: 'org-1',
        violationType: 'injection_sql',
        threatLevel: ThreatLevel.CRITICAL,
        findings: [
          {
            type: 'injection_sql',
            severity: ThreatLevel.CRITICAL,
            message: 'SQL injection detected',
            location: 'prompt',
          },
        ],
        requestId: 'req-1',
        blocked: true,
      };

      analytics.recordViolation(violation);

      const usersNeedingTraining = analytics.getUsersNeedingTraining();

      expect(usersNeedingTraining).toHaveLength(1);
      expect(usersNeedingTraining[0].userId).toBe('user-critical');
      expect(usersNeedingTraining[0].needsTraining).toBe(true);
      expect(usersNeedingTraining[0].trainingPriority).toBe('critical');
    });

    it('should identify users needing training due to multiple high violations', () => {
      const baseViolation = {
        id: 'violation-1',
        timestamp: Date.now(),
        userId: 'user-high',
        organizationId: 'org-1',
        violationType: 'pii_email',
        threatLevel: ThreatLevel.HIGH,
        findings: [
          {
            type: 'pii_email',
            severity: ThreatLevel.HIGH,
            message: 'PII detected',
            location: 'prompt',
          },
        ],
        requestId: 'req-1',
        blocked: true,
      };

      // Record 4 high violations (threshold is 3)
      for (let i = 0; i < 4; i++) {
        analytics.recordViolation({
          ...baseViolation,
          id: `violation-${i}`,
          requestId: `req-${i}`,
        });
      }

      const usersNeedingTraining = analytics.getUsersNeedingTraining();

      expect(usersNeedingTraining).toHaveLength(1);
      expect(usersNeedingTraining[0].userId).toBe('user-high');
      expect(usersNeedingTraining[0].trainingPriority).toBe('high');
    });

    it('should recommend specific training topics', () => {
      const violations = [
        {
          id: 'v1',
          timestamp: Date.now(),
          userId: 'user-topics',
          organizationId: 'org-1',
          violationType: 'pii_email',
          threatLevel: ThreatLevel.MEDIUM,
          findings: [{ type: 'pii_email', severity: ThreatLevel.MEDIUM, message: 'PII', location: 'prompt' }],
          requestId: 'req-1',
          blocked: false,
        },
        {
          id: 'v2',
          timestamp: Date.now(),
          userId: 'user-topics',
          organizationId: 'org-1',
          violationType: 'pii_ssn',
          threatLevel: ThreatLevel.MEDIUM,
          findings: [{ type: 'pii_ssn', severity: ThreatLevel.MEDIUM, message: 'PII', location: 'prompt' }],
          requestId: 'req-2',
          blocked: false,
        },
      ];

      // Record 6 PII violations to trigger training recommendation
      for (let i = 0; i < 6; i++) {
        analytics.recordViolation({
          ...violations[i % 2],
          id: `v${i}`,
          requestId: `req-${i}`,
        });
      }

      const userMetrics = analytics.getUserMetrics('user-topics');

      expect(userMetrics?.trainingTopics).toContain('PII Handling');
    });
  });

  describe('High-Risk User Identification', () => {
    it('should identify users with critical violations as high-risk', () => {
      const violation = {
        id: 'violation-risk',
        timestamp: Date.now(),
        userId: 'user-risk',
        organizationId: 'org-1',
        violationType: 'injection_prompt',
        threatLevel: ThreatLevel.CRITICAL,
        findings: [
          {
            type: 'injection_prompt',
            severity: ThreatLevel.CRITICAL,
            message: 'Prompt injection',
            location: 'prompt',
          },
        ],
        requestId: 'req-1',
        blocked: true,
      };

      analytics.recordViolation(violation);

      const highRiskUsers = analytics.getHighRiskUsers();

      expect(highRiskUsers).toHaveLength(1);
      expect(highRiskUsers[0].userId).toBe('user-risk');
      expect(highRiskUsers[0].criticalViolations).toBe(1);
    });

    it('should identify users with high violation rate as high-risk', () => {
      const identity: UserIdentity = {
        userId: 'user-rate',
        organizationId: 'org-1',
        source: 'api-key',
        confidence: 1.0,
      };

      // Record 2 successful requests
      analytics.recordSuccessfulRequest(identity, 'req-1');
      analytics.recordSuccessfulRequest(identity, 'req-2');

      // Record 3 blocked requests (violation rate = 3/5 = 60% > 20% threshold)
      for (let i = 0; i < 3; i++) {
        analytics.recordViolation({
          id: `v${i}`,
          timestamp: Date.now(),
          userId: 'user-rate',
          organizationId: 'org-1',
          violationType: 'pii_email',
          threatLevel: ThreatLevel.MEDIUM,
          findings: [{ type: 'pii_email', severity: ThreatLevel.MEDIUM, message: 'PII', location: 'prompt' }],
          requestId: `req-${i + 3}`,
          blocked: true,
        });
      }

      const highRiskUsers = analytics.getHighRiskUsers();

      expect(highRiskUsers).toHaveLength(1);
      expect(highRiskUsers[0].userId).toBe('user-rate');
    });
  });

  describe('Team Metrics', () => {
    it('should track team-level metrics', () => {
      const violation = {
        id: 'violation-team',
        timestamp: Date.now(),
        userId: 'user-team-1',
        teamId: 'team-123',
        organizationId: 'org-1',
        violationType: 'pii_email',
        threatLevel: ThreatLevel.HIGH,
        findings: [
          {
            type: 'pii_email',
            severity: ThreatLevel.HIGH,
            message: 'Email detected',
            location: 'prompt',
          },
        ],
        requestId: 'req-1',
        blocked: true,
      };

      analytics.recordViolation(violation);

      const teamMetrics = analytics.getTeamMetrics('team-123');

      expect(teamMetrics).toBeDefined();
      expect(teamMetrics?.teamId).toBe('team-123');
      expect(teamMetrics?.totalViolations).toBe(1);
      expect(teamMetrics?.violationsByThreatLevel[ThreatLevel.HIGH]).toBe(1);
    });
  });

  describe('Organization Metrics', () => {
    it('should track organization-level metrics', () => {
      const violation = {
        id: 'violation-org',
        timestamp: Date.now(),
        userId: 'user-org-1',
        organizationId: 'org-metrics',
        violationType: 'pii_email',
        threatLevel: ThreatLevel.MEDIUM,
        findings: [
          {
            type: 'pii_email',
            severity: ThreatLevel.MEDIUM,
            message: 'Email detected',
            location: 'prompt',
          },
        ],
        requestId: 'req-1',
        blocked: false,
      };

      analytics.recordViolation(violation);

      const orgMetrics = analytics.getOrganizationMetrics('org-metrics');

      expect(orgMetrics).toBeDefined();
      expect(orgMetrics?.organizationId).toBe('org-metrics');
      expect(orgMetrics?.totalViolations).toBe(1);
      expect(orgMetrics?.violationsByThreatLevel[ThreatLevel.MEDIUM]).toBe(1);
    });

    it('should calculate compliance score', () => {
      const identity: UserIdentity = {
        userId: 'user-compliance',
        organizationId: 'org-compliance',
        source: 'api-key',
        confidence: 1.0,
      };

      // Record 9 successful requests
      for (let i = 0; i < 9; i++) {
        analytics.recordSuccessfulRequest(identity, `req-${i}`);
      }

      // Record 1 violation (10% violation rate)
      analytics.recordViolation({
        id: 'v1',
        timestamp: Date.now(),
        userId: 'user-compliance',
        organizationId: 'org-compliance',
        violationType: 'pii_email',
        threatLevel: ThreatLevel.LOW,
        findings: [{ type: 'pii_email', severity: ThreatLevel.LOW, message: 'PII', location: 'prompt' }],
        requestId: 'req-10',
        blocked: false,
      });

      const orgMetrics = analytics.getOrganizationMetrics('org-compliance');

      // Compliance score = 100 - (1/10 * 100) = 90
      expect(orgMetrics?.complianceScore).toBe(90);
    });
  });

  describe('Violation History', () => {
    it('should retrieve user violation history', () => {
      const violations = [
        {
          id: 'v1',
          timestamp: Date.now(),
          userId: 'user-history',
          organizationId: 'org-1',
          violationType: 'pii_email',
          threatLevel: ThreatLevel.MEDIUM,
          findings: [{ type: 'pii_email', severity: ThreatLevel.MEDIUM, message: 'PII', location: 'prompt' }],
          requestId: 'req-1',
          blocked: false,
        },
        {
          id: 'v2',
          timestamp: Date.now(),
          userId: 'user-history',
          organizationId: 'org-1',
          violationType: 'pii_ssn',
          threatLevel: ThreatLevel.HIGH,
          findings: [{ type: 'pii_ssn', severity: ThreatLevel.HIGH, message: 'SSN', location: 'prompt' }],
          requestId: 'req-2',
          blocked: true,
        },
      ];

      violations.forEach(v => analytics.recordViolation(v));

      const history = analytics.getUserViolations('user-history', 100);

      expect(history).toHaveLength(2);
      expect(history[0].userId).toBe('user-history');
      expect(history[1].userId).toBe('user-history');
    });
  });

  describe('Statistics', () => {
    it('should provide overall statistics', () => {
      // Create violations for multiple users
      for (let i = 0; i < 3; i++) {
        analytics.recordViolation({
          id: `v${i}`,
          timestamp: Date.now(),
          userId: `user-${i}`,
          organizationId: 'org-1',
          violationType: 'pii_email',
          threatLevel: ThreatLevel.HIGH,
          findings: [{ type: 'pii_email', severity: ThreatLevel.HIGH, message: 'PII', location: 'prompt' }],
          requestId: `req-${i}`,
          blocked: true,
        });
      }

      const stats = analytics.getStats();

      expect(stats.totalUsers).toBe(3);
      expect(stats.totalViolations).toBe(3);
    });
  });
});

