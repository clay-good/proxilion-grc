/**
 * User Analytics
 * 
 * Tracks user behavior, security violations, and training needs.
 * Provides insights for:
 * - Users who need security training
 * - Departments with most violations
 * - High-risk users
 * - Compliance metrics per user/team/org
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { UserIdentity } from '../identity/identity-extractor.js';
import { Finding, ThreatLevel } from '../types/index.js';

export interface SecurityViolation {
  id: string;
  timestamp: number;
  userId: string;
  email?: string;
  teamId?: string;
  organizationId: string;
  violationType: string;
  threatLevel: ThreatLevel;
  findings: Finding[];
  requestId: string;
  blocked: boolean;
  prompt?: string;  // Sanitized prompt (PII removed)
  model?: string;
  provider?: string;
}

export interface UserBehaviorMetrics {
  userId: string;
  email?: string;
  username?: string;
  teamId?: string;
  organizationId: string;
  
  // Request metrics
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  
  // Security metrics
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
  mediumViolations: number;
  lowViolations: number;
  
  // Violation types
  piiViolations: number;
  promptInjectionViolations: number;
  toxicityViolations: number;
  dlpViolations: number;
  complianceViolations: number;
  
  // Training indicators
  needsTraining: boolean;
  trainingPriority: 'critical' | 'high' | 'medium' | 'low' | 'none';
  trainingTopics: string[];
  
  // Time metrics
  firstSeen: number;
  lastSeen: number;
  lastViolation?: number;
}

export interface TeamMetrics {
  teamId: string;
  teamName?: string;
  organizationId: string;
  
  userCount: number;
  totalRequests: number;
  totalViolations: number;
  
  highRiskUsers: string[];  // User IDs
  usersNeedingTraining: string[];  // User IDs
  
  violationsByType: Record<string, number>;
  violationsByThreatLevel: Record<ThreatLevel, number>;
}

export interface OrganizationMetrics {
  organizationId: string;
  organizationName?: string;
  
  userCount: number;
  teamCount: number;
  totalRequests: number;
  totalViolations: number;
  
  highRiskUsers: string[];
  highRiskTeams: string[];
  usersNeedingTraining: string[];
  
  violationsByType: Record<string, number>;
  violationsByThreatLevel: Record<ThreatLevel, number>;
  
  complianceScore: number;  // 0-100
}

export class UserAnalytics {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  private userMetrics: Map<string, UserBehaviorMetrics> = new Map();
  private teamMetrics: Map<string, TeamMetrics> = new Map();
  private orgMetrics: Map<string, OrganizationMetrics> = new Map();
  private violations: SecurityViolation[] = [];
  
  // Thresholds for training recommendations
  private readonly TRAINING_THRESHOLDS = {
    criticalViolations: 1,    // Any critical violation = training needed
    highViolations: 3,         // 3+ high violations = training needed
    mediumViolations: 10,      // 10+ medium violations = training needed
    violationRate: 0.1,        // 10%+ of requests blocked = training needed
  };

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Record a security violation
   */
  recordViolation(violation: SecurityViolation): void {
    this.violations.push(violation);
    
    // Update user metrics
    this.updateUserMetrics(violation);
    
    // Update team metrics
    if (violation.teamId) {
      this.updateTeamMetrics(violation);
    }
    
    // Update organization metrics
    this.updateOrganizationMetrics(violation);
    
    this.logger.info('Security violation recorded', {
      userId: violation.userId,
      violationType: violation.violationType,
      threatLevel: violation.threatLevel,
    });
    
    this.metrics.increment('user_analytics_violation_recorded_total', 1, {
      violationType: violation.violationType,
      threatLevel: violation.threatLevel,
    });
  }

  /**
   * Record a successful request (no violations)
   */
  recordSuccessfulRequest(identity: UserIdentity, _requestId: string): void {
    const userMetrics = this.getOrCreateUserMetrics(identity);
    userMetrics.totalRequests++;
    userMetrics.allowedRequests++;
    userMetrics.lastSeen = Date.now();
  }

  /**
   * Update user metrics
   */
  private updateUserMetrics(violation: SecurityViolation): void {
    const identity: UserIdentity = {
      userId: violation.userId,
      email: violation.email,
      teamId: violation.teamId,
      organizationId: violation.organizationId,
      source: 'unknown',
      confidence: 1.0,
    };
    
    const userMetrics = this.getOrCreateUserMetrics(identity);
    
    userMetrics.totalRequests++;
    if (violation.blocked) {
      userMetrics.blockedRequests++;
    } else {
      userMetrics.allowedRequests++;
    }
    
    userMetrics.totalViolations++;
    userMetrics.lastSeen = Date.now();
    userMetrics.lastViolation = violation.timestamp;
    
    // Update by threat level
    switch (violation.threatLevel) {
      case ThreatLevel.CRITICAL:
        userMetrics.criticalViolations++;
        break;
      case ThreatLevel.HIGH:
        userMetrics.highViolations++;
        break;
      case ThreatLevel.MEDIUM:
        userMetrics.mediumViolations++;
        break;
      case ThreatLevel.LOW:
        userMetrics.lowViolations++;
        break;
    }
    
    // Update by violation type
    for (const finding of violation.findings) {
      if (finding.type.startsWith('pii_')) {
        userMetrics.piiViolations++;
      } else if (finding.type.startsWith('injection_')) {
        userMetrics.promptInjectionViolations++;
      } else if (finding.type.startsWith('toxicity_')) {
        userMetrics.toxicityViolations++;
      } else if (finding.type.startsWith('dlp_')) {
        userMetrics.dlpViolations++;
      } else if (finding.type.startsWith('compliance_')) {
        userMetrics.complianceViolations++;
      }
    }
    
    // Determine training needs
    this.assessTrainingNeeds(userMetrics);
  }

  /**
   * Assess if user needs training
   */
  private assessTrainingNeeds(userMetrics: UserBehaviorMetrics): void {
    const topics: string[] = [];
    let priority: 'critical' | 'high' | 'medium' | 'low' | 'none' = 'none';
    
    // Check critical violations
    if (userMetrics.criticalViolations >= this.TRAINING_THRESHOLDS.criticalViolations) {
      priority = 'critical';
      topics.push('Critical Security Violations');
    }
    
    // Check high violations
    if (userMetrics.highViolations >= this.TRAINING_THRESHOLDS.highViolations) {
      if (priority === 'none') priority = 'high';
      topics.push('High-Risk Behavior');
    }
    
    // Check medium violations
    if (userMetrics.mediumViolations >= this.TRAINING_THRESHOLDS.mediumViolations) {
      if (priority === 'none') priority = 'medium';
    }
    
    // Check violation rate
    const violationRate = userMetrics.totalRequests > 0 
      ? userMetrics.blockedRequests / userMetrics.totalRequests 
      : 0;
    
    if (violationRate >= this.TRAINING_THRESHOLDS.violationRate) {
      if (priority === 'none') priority = 'medium';
      topics.push('Security Best Practices');
    }
    
    // Check specific violation types
    if (userMetrics.piiViolations > 5) {
      topics.push('PII Handling');
    }
    if (userMetrics.promptInjectionViolations > 3) {
      topics.push('Prompt Injection Prevention');
    }
    if (userMetrics.toxicityViolations > 3) {
      topics.push('Appropriate AI Usage');
    }
    if (userMetrics.dlpViolations > 3) {
      topics.push('Data Loss Prevention');
    }
    if (userMetrics.complianceViolations > 3) {
      topics.push('Compliance Requirements');
    }
    
    userMetrics.needsTraining = priority !== 'none';
    userMetrics.trainingPriority = priority;
    userMetrics.trainingTopics = topics;
  }

  /**
   * Update team metrics
   */
  private updateTeamMetrics(violation: SecurityViolation): void {
    if (!violation.teamId) return;
    
    let teamMetrics = this.teamMetrics.get(violation.teamId);
    if (!teamMetrics) {
      teamMetrics = {
        teamId: violation.teamId,
        organizationId: violation.organizationId,
        userCount: 0,
        totalRequests: 0,
        totalViolations: 0,
        highRiskUsers: [],
        usersNeedingTraining: [],
        violationsByType: {},
        violationsByThreatLevel: {
          [ThreatLevel.NONE]: 0,
          [ThreatLevel.LOW]: 0,
          [ThreatLevel.MEDIUM]: 0,
          [ThreatLevel.HIGH]: 0,
          [ThreatLevel.CRITICAL]: 0,
        },
      };
      this.teamMetrics.set(violation.teamId, teamMetrics);
    }

    // TypeScript now knows teamMetrics is defined
    const metrics = this.teamMetrics.get(violation.teamId)!;
    metrics.totalRequests++;
    metrics.totalViolations++;
    metrics.violationsByThreatLevel[violation.threatLevel]++;

    // Update violation types
    for (const finding of violation.findings) {
      metrics.violationsByType[finding.type] =
        (metrics.violationsByType[finding.type] || 0) + 1;
    }
  }

  /**
   * Update organization metrics
   */
  private updateOrganizationMetrics(violation: SecurityViolation): void {
    let orgMetrics = this.orgMetrics.get(violation.organizationId);
    if (!orgMetrics) {
      orgMetrics = {
        organizationId: violation.organizationId,
        userCount: 0,
        teamCount: 0,
        totalRequests: 0,
        totalViolations: 0,
        highRiskUsers: [],
        highRiskTeams: [],
        usersNeedingTraining: [],
        violationsByType: {},
        violationsByThreatLevel: {
          [ThreatLevel.NONE]: 0,
          [ThreatLevel.LOW]: 0,
          [ThreatLevel.MEDIUM]: 0,
          [ThreatLevel.HIGH]: 0,
          [ThreatLevel.CRITICAL]: 0,
        },
        complianceScore: 100,
      };
      this.orgMetrics.set(violation.organizationId, orgMetrics);
    }

    // TypeScript now knows orgMetrics is defined
    const metrics = this.orgMetrics.get(violation.organizationId)!;
    metrics.totalRequests++;
    metrics.totalViolations++;
    metrics.violationsByThreatLevel[violation.threatLevel]++;

    // Update violation types
    for (const finding of violation.findings) {
      metrics.violationsByType[finding.type] =
        (metrics.violationsByType[finding.type] || 0) + 1;
    }

    // Update compliance score (100 - violation rate * 100)
    this.updateOrganizationComplianceScore(violation.organizationId);
  }

  /**
   * Update organization compliance score
   */
  private updateOrganizationComplianceScore(organizationId: string): void {
    const orgMetrics = this.orgMetrics.get(organizationId);
    if (!orgMetrics) return;

    // Count total requests for this organization across all users
    let totalRequests = 0;
    let totalViolations = 0;

    for (const userMetrics of this.userMetrics.values()) {
      if (userMetrics.organizationId === organizationId) {
        totalRequests += userMetrics.totalRequests;
        totalViolations += userMetrics.totalViolations;
      }
    }

    orgMetrics.totalRequests = totalRequests;
    orgMetrics.totalViolations = totalViolations;

    const violationRate = totalRequests > 0 ? totalViolations / totalRequests : 0;
    orgMetrics.complianceScore = Math.max(0, 100 - violationRate * 100);
  }

  /**
   * Get or create user metrics
   */
  private getOrCreateUserMetrics(identity: UserIdentity): UserBehaviorMetrics {
    let userMetrics = this.userMetrics.get(identity.userId);
    if (!userMetrics) {
      userMetrics = {
        userId: identity.userId,
        email: identity.email,
        username: identity.username,
        teamId: identity.teamId,
        organizationId: identity.organizationId,
        totalRequests: 0,
        blockedRequests: 0,
        allowedRequests: 0,
        totalViolations: 0,
        criticalViolations: 0,
        highViolations: 0,
        mediumViolations: 0,
        lowViolations: 0,
        piiViolations: 0,
        promptInjectionViolations: 0,
        toxicityViolations: 0,
        dlpViolations: 0,
        complianceViolations: 0,
        needsTraining: false,
        trainingPriority: 'none',
        trainingTopics: [],
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      };
      this.userMetrics.set(identity.userId, userMetrics);
    }
    return userMetrics;
  }

  /**
   * Get users who need training
   */
  getUsersNeedingTraining(organizationId?: string): UserBehaviorMetrics[] {
    const users: UserBehaviorMetrics[] = [];
    
    for (const userMetrics of this.userMetrics.values()) {
      if (organizationId && userMetrics.organizationId !== organizationId) {
        continue;
      }
      
      if (userMetrics.needsTraining) {
        users.push(userMetrics);
      }
    }
    
    // Sort by training priority
    return users.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
      return priorityOrder[a.trainingPriority] - priorityOrder[b.trainingPriority];
    });
  }

  /**
   * Get high-risk users
   */
  getHighRiskUsers(organizationId?: string): UserBehaviorMetrics[] {
    const users: UserBehaviorMetrics[] = [];
    
    for (const userMetrics of this.userMetrics.values()) {
      if (organizationId && userMetrics.organizationId !== organizationId) {
        continue;
      }
      
      // High risk = critical violations or high violation rate
      const violationRate = userMetrics.totalRequests > 0 
        ? userMetrics.blockedRequests / userMetrics.totalRequests 
        : 0;
      
      if (userMetrics.criticalViolations > 0 || violationRate > 0.2) {
        users.push(userMetrics);
      }
    }
    
    // Sort by risk (critical violations first, then violation rate)
    return users.sort((a, b) => {
      if (a.criticalViolations !== b.criticalViolations) {
        return b.criticalViolations - a.criticalViolations;
      }
      const aRate = a.totalRequests > 0 ? a.blockedRequests / a.totalRequests : 0;
      const bRate = b.totalRequests > 0 ? b.blockedRequests / b.totalRequests : 0;
      return bRate - aRate;
    });
  }

  /**
   * Get user metrics
   */
  getUserMetrics(userId: string): UserBehaviorMetrics | null {
    return this.userMetrics.get(userId) || null;
  }

  /**
   * Get team metrics
   */
  getTeamMetrics(teamId: string): TeamMetrics | null {
    return this.teamMetrics.get(teamId) || null;
  }

  /**
   * Get organization metrics
   */
  getOrganizationMetrics(organizationId: string): OrganizationMetrics | null {
    return this.orgMetrics.get(organizationId) || null;
  }

  /**
   * Get all violations for a user
   */
  getUserViolations(userId: string, limit: number = 100): SecurityViolation[] {
    return this.violations
      .filter(v => v.userId === userId)
      .slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalUsers: this.userMetrics.size,
      totalTeams: this.teamMetrics.size,
      totalOrganizations: this.orgMetrics.size,
      totalViolations: this.violations.length,
      usersNeedingTraining: this.getUsersNeedingTraining().length,
      highRiskUsers: this.getHighRiskUsers().length,
    };
  }
}

