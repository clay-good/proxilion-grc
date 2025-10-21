/**
 * Anomaly Detection Engine
 * 
 * Core ML-based anomaly detection system for identifying unusual patterns
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AnomalyDetectionConfig,
  Anomaly,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  AnomalyFeatures,
  AnomalyScore,
  UserBehaviorProfile,
  ApplicationBehaviorProfile,
  BaselineStatistics,
  AnomalyDetectionResult,
} from './anomaly-types.js';
import { IsolationForest } from '../ml/isolation-forest.js';
import { Autoencoder } from '../ml/autoencoder.js';

export class AnomalyDetector {
  private config: AnomalyDetectionConfig;
  private userProfiles: Map<string, UserBehaviorProfile> = new Map();
  private appProfiles: Map<string, ApplicationBehaviorProfile> = new Map();
  private detectedAnomalies: Anomaly[] = [];
  private baselineStats: Map<string, BaselineStatistics> = new Map();
  private isolationForest?: IsolationForest;
  private autoencoder?: Autoencoder;
  private trainingData: number[][] = [];

  constructor(config: Partial<AnomalyDetectionConfig> = {}) {
    this.config = {
      enabled: true,
      enableUsagePatternDetection: true,
      enableSecurityThreatDetection: true,
      enableCostAnomalyDetection: true,
      enablePerformanceAnomalyDetection: true,
      enableBehavioralDetection: true,
      usagePatternSensitivity: 0.7,
      securityThreatSensitivity: 0.9,
      costAnomalySensitivity: 0.8,
      performanceAnomalySensitivity: 0.7,
      behavioralSensitivity: 0.75,
      learningPeriodDays: 7,
      minDataPointsForBaseline: 100,
      baselineUpdateInterval: 60 * 60 * 1000, // 1 hour
      minAnomalyScore: 60,
      confidenceThreshold: 0.7,
      alertOnDetection: true,
      alertSeverityThreshold: AnomalySeverity.MEDIUM,
      maxAnomaliesStored: 10000,
      anomalyRetentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      ...config,
    };
  }

  /**
   * Detect anomalies in request data
   */
  async detectAnomalies(
    features: AnomalyFeatures,
    context: {
      userId?: string;
      applicationId?: string;
      correlationId: string;
    }
  ): Promise<AnomalyDetectionResult> {
    if (!this.config.enabled) {
      return this.emptyResult();
    }

    const anomalies: Anomaly[] = [];
    const startTime = Date.now();

    // Get profiles
    const userProfile = context.userId
      ? this.userProfiles.get(context.userId)
      : undefined;
    const appProfile = context.applicationId
      ? this.appProfiles.get(context.applicationId)
      : undefined;

    // Run detection algorithms
    if (this.config.enableUsagePatternDetection) {
      const usageAnomalies = this.detectUsageAnomalies(
        features,
        userProfile,
        appProfile,
        context
      );
      anomalies.push(...usageAnomalies);
    }

    if (this.config.enableSecurityThreatDetection) {
      const securityAnomalies = this.detectSecurityAnomalies(
        features,
        userProfile,
        context
      );
      anomalies.push(...securityAnomalies);
    }

    if (this.config.enableCostAnomalyDetection) {
      const costAnomalies = this.detectCostAnomalies(
        features,
        userProfile,
        appProfile,
        context
      );
      anomalies.push(...costAnomalies);
    }

    if (this.config.enablePerformanceAnomalyDetection) {
      const perfAnomalies = this.detectPerformanceAnomalies(
        features,
        appProfile,
        context
      );
      anomalies.push(...perfAnomalies);
    }

    if (this.config.enableBehavioralDetection) {
      const behavioralAnomalies = this.detectBehavioralAnomalies(
        features,
        userProfile,
        context
      );
      anomalies.push(...behavioralAnomalies);
    }

    // ML-based detection using Isolation Forest
    const mlAnomalies = this.detectMLAnomalies(features, context);
    anomalies.push(...mlAnomalies);

    // Add training data for continuous learning
    if (anomalies.length === 0) {
      // Only add normal data points for training
      this.addTrainingDataPoint(features);
    }

    // Filter by score and confidence
    const filteredAnomalies = anomalies.filter(
      (a) =>
        a.score.overall >= this.config.minAnomalyScore &&
        a.score.confidence >= this.config.confidenceThreshold
    );

    // Store anomalies
    this.storeAnomalies(filteredAnomalies);

    // Build result
    const result: AnomalyDetectionResult = {
      anomalies: filteredAnomalies,
      totalAnomalies: filteredAnomalies.length,
      highSeverityCount: filteredAnomalies.filter(
        (a) => a.severity === AnomalySeverity.HIGH
      ).length,
      criticalSeverityCount: filteredAnomalies.filter(
        (a) => a.severity === AnomalySeverity.CRITICAL
      ).length,
      summary: {
        usageAnomalies: filteredAnomalies.filter(
          (a) => a.type === AnomalyType.USAGE_PATTERN
        ).length,
        securityAnomalies: filteredAnomalies.filter(
          (a) => a.type === AnomalyType.SECURITY_THREAT
        ).length,
        costAnomalies: filteredAnomalies.filter(
          (a) => a.type === AnomalyType.COST_ANOMALY
        ).length,
        performanceAnomalies: filteredAnomalies.filter(
          (a) => a.type === AnomalyType.PERFORMANCE_ANOMALY
        ).length,
        behavioralAnomalies: filteredAnomalies.filter(
          (a) => a.type === AnomalyType.BEHAVIORAL_ANOMALY
        ).length,
      },
      detectionTime: Date.now() - startTime,
      profilesAnalyzed: (userProfile ? 1 : 0) + (appProfile ? 1 : 0),
    };

    return result;
  }

  /**
   * Detect usage pattern anomalies
   */
  private detectUsageAnomalies(
    features: AnomalyFeatures,
    userProfile?: UserBehaviorProfile,
    appProfile?: ApplicationBehaviorProfile,
    context?: any
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check request rate anomaly
    if (userProfile && features.requestRateDeviation > 3) {
      const score = this.calculateAnomalyScore(
        features.requestRateDeviation * 10, // Scale up for better scoring
        this.config.usagePatternSensitivity,
        'usage'
      );

      if (score.overall >= this.config.minAnomalyScore) {
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.USAGE_PATTERN,
          severity: this.calculateSeverity(score.overall),
          status: AnomalyStatus.DETECTED,
          score,
          correlationId: context?.correlationId || 'unknown',
          userId: context?.userId,
          applicationId: context?.applicationId,
          description: `Unusual request rate detected: ${features.requestRate.toFixed(2)} req/min (expected: ${userProfile.avgRequestsPerHour / 60})`,
          features,
          expectedBehavior: {
            requestRate: userProfile.avgRequestsPerHour / 60,
          },
          actualBehavior: {
            requestRate: features.requestRate,
          },
          evidence: [
            {
              metric: 'Request Rate',
              expected: userProfile.avgRequestsPerHour / 60,
              actual: features.requestRate,
              deviation: features.requestRateDeviation,
            },
          ],
          recommendations: [
            'Investigate if this is legitimate increased usage',
            'Check for potential API abuse or credential compromise',
            'Review recent changes in application behavior',
          ],
          detectedBy: 'usage_pattern_detector',
        });
      }
    }

    // Check for rate anomaly (potential DDoS or abuse)
    if (appProfile && features.requestRate > appProfile.avgRequestsPerMinute * 5) {
      const score = this.calculateAnomalyScore(
        features.requestRate / appProfile.avgRequestsPerMinute,
        this.config.usagePatternSensitivity,
        'usage'
      );

      anomalies.push({
        id: uuidv4(),
        timestamp: Date.now(),
        type: AnomalyType.RATE_ANOMALY,
        severity: AnomalySeverity.HIGH,
        status: AnomalyStatus.DETECTED,
        score,
        correlationId: context?.correlationId || 'unknown',
        applicationId: context?.applicationId,
        description: `Abnormally high request rate: ${features.requestRate.toFixed(2)} req/min`,
        features,
        expectedBehavior: {
          requestRate: appProfile.avgRequestsPerMinute,
        },
        actualBehavior: {
          requestRate: features.requestRate,
        },
        evidence: [
          {
            metric: 'Request Rate',
            expected: appProfile.avgRequestsPerMinute,
            actual: features.requestRate,
            deviation: features.requestRate / appProfile.avgRequestsPerMinute,
          },
        ],
        recommendations: [
          'Implement rate limiting',
          'Check for DDoS attack',
          'Verify API key is not compromised',
        ],
        detectedBy: 'rate_anomaly_detector',
      });
    }

    return anomalies;
  }

  /**
   * Detect security threat anomalies
   */
  private detectSecurityAnomalies(
    features: AnomalyFeatures,
    userProfile?: UserBehaviorProfile,
    context?: any
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check for high security violations
    if (features.securityViolations > 0) {
      const score = this.calculateAnomalyScore(
        features.securityViolations * 20,
        this.config.securityThreatSensitivity,
        'security'
      );

      anomalies.push({
        id: uuidv4(),
        timestamp: Date.now(),
        type: AnomalyType.SECURITY_THREAT,
        severity: AnomalySeverity.CRITICAL,
        status: AnomalyStatus.DETECTED,
        score,
        correlationId: context?.correlationId || 'unknown',
        userId: context?.userId,
        description: `Security violations detected: ${features.securityViolations} findings`,
        features,
        expectedBehavior: {
          securityViolations: 0,
        },
        actualBehavior: {
          securityViolations: features.securityViolations,
        },
        evidence: [
          {
            metric: 'Security Violations',
            expected: 0,
            actual: features.securityViolations,
            deviation: features.securityViolations,
          },
        ],
        recommendations: [
          'Block user immediately if pattern continues',
          'Review security scanner findings',
          'Investigate potential attack attempt',
          'Consider additional authentication',
        ],
        detectedBy: 'security_threat_detector',
      });
    }

    // Check for new IP address (potential credential theft)
    if (userProfile && features.newIpAddress && userProfile.profileConfidence > 0.8) {
      const score = this.calculateAnomalyScore(
        70,
        this.config.securityThreatSensitivity,
        'security'
      );

      anomalies.push({
        id: uuidv4(),
        timestamp: Date.now(),
        type: AnomalyType.CREDENTIAL_ABUSE,
        severity: AnomalySeverity.MEDIUM,
        status: AnomalyStatus.DETECTED,
        score,
        correlationId: context?.correlationId || 'unknown',
        userId: context?.userId,
        description: 'Access from new IP address detected',
        features,
        expectedBehavior: {
          newIpAddress: false,
        },
        actualBehavior: {
          newIpAddress: true,
        },
        evidence: [
          {
            metric: 'IP Address',
            expected: 'Known IP',
            actual: 'New IP',
            deviation: 1,
          },
        ],
        recommendations: [
          'Verify user identity',
          'Check for credential compromise',
          'Enable MFA if not already enabled',
        ],
        detectedBy: 'credential_abuse_detector',
      });
    }

    return anomalies;
  }

  /**
   * Calculate anomaly score
   */
  private calculateAnomalyScore(
    rawScore: number,
    sensitivity: number,
    category: string
  ): AnomalyScore {
    // Normalize score to 0-100
    const normalizedScore = Math.min(100, Math.max(0, rawScore * sensitivity));

    // Calculate confidence based on data availability
    const confidence = Math.min(1, sensitivity);

    return {
      overall: normalizedScore,
      confidence,
      usageScore: category === 'usage' ? normalizedScore : 0,
      securityScore: category === 'security' ? normalizedScore : 0,
      costScore: category === 'cost' ? normalizedScore : 0,
      performanceScore: category === 'performance' ? normalizedScore : 0,
      behavioralScore: category === 'behavioral' ? normalizedScore : 0,
      factors: [
        {
          name: category,
          score: normalizedScore,
          weight: sensitivity,
          description: `${category} anomaly detected`,
        },
      ],
    };
  }

  /**
   * Calculate severity from score
   */
  private calculateSeverity(score: number): AnomalySeverity {
    if (score >= 90) return AnomalySeverity.CRITICAL;
    if (score >= 75) return AnomalySeverity.HIGH;
    if (score >= 50) return AnomalySeverity.MEDIUM;
    if (score >= 25) return AnomalySeverity.LOW;
    return AnomalySeverity.INFO;
  }

  private detectCostAnomalies(
    features: AnomalyFeatures,
    userProfile?: UserBehaviorProfile,
    appProfile?: ApplicationBehaviorProfile,
    context?: any
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check for unusual cost per request
    if (userProfile && features.costDeviation > 3) {
      const score = this.calculateAnomalyScore(
        features.costDeviation * 25,
        this.config.costAnomalySensitivity,
        'cost'
      );

      if (score.overall >= this.config.minAnomalyScore) {
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.COST_ANOMALY,
          severity: this.calculateSeverity(score.overall),
          status: AnomalyStatus.DETECTED,
          score,
          correlationId: context?.correlationId || 'unknown',
          userId: context?.userId,
          description: `Unusual cost per request: $${features.costPerRequest.toFixed(4)} (expected: $${userProfile.avgCostPerRequest.toFixed(4)})`,
          features,
          expectedBehavior: {
            costPerRequest: userProfile.avgCostPerRequest,
          },
          actualBehavior: {
            costPerRequest: features.costPerRequest,
          },
          evidence: [
            {
              metric: 'Cost Per Request',
              expected: userProfile.avgCostPerRequest,
              actual: features.costPerRequest,
              deviation: features.costDeviation,
            },
          ],
          recommendations: [
            'Review model selection - may be using more expensive models',
            'Check prompt length - longer prompts cost more',
            'Verify no runaway token generation',
            'Consider implementing cost limits',
          ],
          detectedBy: 'cost_anomaly_detector',
        });
      }
    }

    // Check for total cost spike
    if (appProfile && features.totalCost > appProfile.totalCost * 1.5) {
      const score = this.calculateAnomalyScore(
        (features.totalCost / appProfile.totalCost) * 50,
        this.config.costAnomalySensitivity,
        'cost'
      );

      anomalies.push({
        id: uuidv4(),
        timestamp: Date.now(),
        type: AnomalyType.COST_ANOMALY,
        severity: AnomalySeverity.HIGH,
        status: AnomalyStatus.DETECTED,
        score,
        correlationId: context?.correlationId || 'unknown',
        applicationId: context?.applicationId,
        description: `Significant cost increase detected: $${features.totalCost.toFixed(2)}`,
        features,
        expectedBehavior: {
          totalCost: appProfile.totalCost,
        },
        actualBehavior: {
          totalCost: features.totalCost,
        },
        evidence: [
          {
            metric: 'Total Cost',
            expected: appProfile.totalCost,
            actual: features.totalCost,
            deviation: features.totalCost / appProfile.totalCost,
          },
        ],
        recommendations: [
          'Implement budget alerts',
          'Review recent usage patterns',
          'Check for API key abuse',
          'Consider rate limiting',
        ],
        detectedBy: 'cost_spike_detector',
      });
    }

    return anomalies;
  }

  private detectPerformanceAnomalies(
    features: AnomalyFeatures,
    appProfile?: ApplicationBehaviorProfile,
    context?: any
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check for high latency
    if (appProfile && features.latencyDeviation > 3) {
      const score = this.calculateAnomalyScore(
        features.latencyDeviation * 20,
        this.config.performanceAnomalySensitivity,
        'performance'
      );

      if (score.overall >= this.config.minAnomalyScore) {
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.PERFORMANCE_ANOMALY,
          severity: this.calculateSeverity(score.overall),
          status: AnomalyStatus.DETECTED,
          score,
          correlationId: context?.correlationId || 'unknown',
          applicationId: context?.applicationId,
          description: `High latency detected: ${features.latency.toFixed(0)}ms (expected: ${appProfile.avgLatency.toFixed(0)}ms)`,
          features,
          expectedBehavior: {
            latency: appProfile.avgLatency,
          },
          actualBehavior: {
            latency: features.latency,
          },
          evidence: [
            {
              metric: 'Latency',
              expected: appProfile.avgLatency,
              actual: features.latency,
              deviation: features.latencyDeviation,
            },
          ],
          recommendations: [
            'Check provider status',
            'Review network connectivity',
            'Consider using faster models',
            'Implement caching',
          ],
          detectedBy: 'performance_anomaly_detector',
        });
      }
    }

    // Check for high error rate
    if (appProfile && features.errorRate > appProfile.errorRate * 3) {
      const score = this.calculateAnomalyScore(
        (features.errorRate / appProfile.errorRate) * 30,
        this.config.performanceAnomalySensitivity,
        'performance'
      );

      anomalies.push({
        id: uuidv4(),
        timestamp: Date.now(),
        type: AnomalyType.PERFORMANCE_ANOMALY,
        severity: AnomalySeverity.HIGH,
        status: AnomalyStatus.DETECTED,
        score,
        correlationId: context?.correlationId || 'unknown',
        applicationId: context?.applicationId,
        description: `High error rate: ${(features.errorRate * 100).toFixed(1)}%`,
        features,
        expectedBehavior: {
          errorRate: appProfile.errorRate,
        },
        actualBehavior: {
          errorRate: features.errorRate,
        },
        evidence: [
          {
            metric: 'Error Rate',
            expected: appProfile.errorRate,
            actual: features.errorRate,
            deviation: features.errorRate / appProfile.errorRate,
          },
        ],
        recommendations: [
          'Check provider availability',
          'Review error logs',
          'Implement retry logic',
          'Consider failover to backup provider',
        ],
        detectedBy: 'error_rate_detector',
      });
    }

    return anomalies;
  }

  private detectBehavioralAnomalies(
    features: AnomalyFeatures,
    userProfile?: UserBehaviorProfile,
    context?: any
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    if (!userProfile || userProfile.profileConfidence < 0.5) {
      return anomalies; // Not enough data for behavioral analysis
    }

    // Check for new model usage
    if (features.newModel) {
      const score = this.calculateAnomalyScore(
        50,
        this.config.behavioralSensitivity,
        'behavioral'
      );

      if (score.overall >= this.config.minAnomalyScore) {
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.BEHAVIORAL_ANOMALY,
          severity: AnomalySeverity.LOW,
          status: AnomalyStatus.DETECTED,
          score,
          correlationId: context?.correlationId || 'unknown',
          userId: context?.userId,
          description: 'User accessing new AI model',
          features,
          expectedBehavior: {
            newModel: false,
          },
          actualBehavior: {
            newModel: true,
          },
          evidence: [
            {
              metric: 'Model Usage',
              expected: 'Typical models',
              actual: 'New model',
              deviation: 1,
            },
          ],
          recommendations: [
            'Monitor for unusual behavior',
            'Verify legitimate use case',
          ],
          detectedBy: 'behavioral_anomaly_detector',
        });
      }
    }

    // Check for unusual time access
    if (features.unusualTime) {
      const score = this.calculateAnomalyScore(
        60,
        this.config.behavioralSensitivity,
        'behavioral'
      );

      if (score.overall >= this.config.minAnomalyScore) {
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.BEHAVIORAL_ANOMALY,
          severity: AnomalySeverity.MEDIUM,
          status: AnomalyStatus.DETECTED,
          score,
          correlationId: context?.correlationId || 'unknown',
          userId: context?.userId,
          description: 'Access at unusual time detected',
          features,
          expectedBehavior: {
            unusualTime: false,
          },
          actualBehavior: {
            unusualTime: true,
          },
          evidence: [
            {
              metric: 'Access Time',
              expected: 'Peak hours',
              actual: `Hour ${features.hourOfDay}`,
              deviation: 1,
            },
          ],
          recommendations: [
            'Verify user identity',
            'Check for credential compromise',
            'Monitor for data exfiltration',
          ],
          detectedBy: 'behavioral_anomaly_detector',
        });
      }
    }

    // Check for potential data exfiltration (large response lengths)
    if (
      features.responseLengthDeviation > 5 &&
      features.responseLength > userProfile.avgResponseLength * 10
    ) {
      const score = this.calculateAnomalyScore(
        features.responseLengthDeviation * 15,
        this.config.behavioralSensitivity,
        'behavioral'
      );

      anomalies.push({
        id: uuidv4(),
        timestamp: Date.now(),
        type: AnomalyType.DATA_EXFILTRATION,
        severity: AnomalySeverity.HIGH,
        status: AnomalyStatus.DETECTED,
        score,
        correlationId: context?.correlationId || 'unknown',
        userId: context?.userId,
        description: `Unusually large response: ${features.responseLength} tokens`,
        features,
        expectedBehavior: {
          responseLength: userProfile.avgResponseLength,
        },
        actualBehavior: {
          responseLength: features.responseLength,
        },
        evidence: [
          {
            metric: 'Response Length',
            expected: userProfile.avgResponseLength,
            actual: features.responseLength,
            deviation: features.responseLengthDeviation,
          },
        ],
        recommendations: [
          'Review response content for sensitive data',
          'Check for data exfiltration attempt',
          'Implement response size limits',
          'Audit user activity',
        ],
        detectedBy: 'data_exfiltration_detector',
      });
    }

    return anomalies;
  }

  private storeAnomalies(anomalies: Anomaly[]): void {
    this.detectedAnomalies.push(...anomalies);

    // Cleanup old anomalies
    const cutoff = Date.now() - this.config.anomalyRetentionPeriod;
    this.detectedAnomalies = this.detectedAnomalies.filter(
      (a) => a.timestamp > cutoff
    );

    // Limit storage
    if (this.detectedAnomalies.length > this.config.maxAnomaliesStored) {
      this.detectedAnomalies = this.detectedAnomalies.slice(
        -this.config.maxAnomaliesStored
      );
    }
  }

  private emptyResult(): AnomalyDetectionResult {
    return {
      anomalies: [],
      totalAnomalies: 0,
      highSeverityCount: 0,
      criticalSeverityCount: 0,
      summary: {
        usageAnomalies: 0,
        securityAnomalies: 0,
        costAnomalies: 0,
        performanceAnomalies: 0,
        behavioralAnomalies: 0,
      },
      detectionTime: 0,
      profilesAnalyzed: 0,
    };
  }

  /**
   * Get all detected anomalies
   */
  getAnomalies(filter?: {
    type?: AnomalyType;
    severity?: AnomalySeverity;
    userId?: string;
    startTime?: number;
    endTime?: number;
  }): Anomaly[] {
    let anomalies = [...this.detectedAnomalies];

    if (filter) {
      if (filter.type) {
        anomalies = anomalies.filter((a) => a.type === filter.type);
      }
      if (filter.severity) {
        anomalies = anomalies.filter((a) => a.severity === filter.severity);
      }
      if (filter.userId) {
        anomalies = anomalies.filter((a) => a.userId === filter.userId);
      }
      if (filter.startTime) {
        anomalies = anomalies.filter((a) => a.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        anomalies = anomalies.filter((a) => a.timestamp <= filter.endTime!);
      }
    }

    return anomalies;
  }

  /**
   * Update user profile
   */
  updateUserProfile(userId: string, profile: Partial<UserBehaviorProfile>): void {
    const existing = this.userProfiles.get(userId);
    if (existing) {
      this.userProfiles.set(userId, { ...existing, ...profile });
    } else {
      this.userProfiles.set(userId, {
        userId,
        avgRequestsPerHour: 0,
        avgRequestsPerDay: 0,
        peakUsageHours: [],
        typicalModels: [],
        typicalProviders: [],
        avgCostPerRequest: 0,
        avgDailyCost: 0,
        maxDailyCost: 0,
        avgPromptLength: 0,
        avgResponseLength: 0,
        typicalTopics: [],
        typicalIpAddresses: [],
        typicalUserAgents: [],
        typicalLocations: [],
        typicalRequestDuration: 0,
        typicalResponseTime: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalRequests: 0,
        profileConfidence: 0,
        ...profile,
      });
    }
  }

  /**
   * Update application profile
   */
  updateApplicationProfile(
    appId: string,
    profile: Partial<ApplicationBehaviorProfile>
  ): void {
    const existing = this.appProfiles.get(appId);
    if (existing) {
      this.appProfiles.set(appId, { ...existing, ...profile });
    } else {
      this.appProfiles.set(appId, {
        applicationId: appId,
        avgRequestsPerMinute: 0,
        avgRequestsPerHour: 0,
        peakUsagePatterns: [],
        modelDistribution: {},
        providerDistribution: {},
        avgCostPerRequest: 0,
        totalCost: 0,
        costTrend: 'stable',
        avgLatency: 0,
        errorRate: 0,
        timeoutRate: 0,
        securityViolationRate: 0,
        typicalScannerFindings: {},
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalRequests: 0,
        profileConfidence: 0,
        ...profile,
      });
    }
  }

  /**
   * Train Isolation Forest model with collected data
   */
  trainIsolationForest(): void {
    if (this.trainingData.length < this.config.minDataPointsForBaseline) {
      return;
    }

    this.isolationForest = new IsolationForest({
      numTrees: 100,
      subsampleSize: Math.min(256, this.trainingData.length),
      contamination: 0.1,
    });

    this.isolationForest.train(this.trainingData);
  }

  /**
   * Train Autoencoder model with collected data
   */
  trainAutoencoder(): void {
    if (this.trainingData.length < this.config.minDataPointsForBaseline) {
      return;
    }

    const inputSize = this.trainingData[0].length;
    this.autoencoder = new Autoencoder({
      inputSize,
      hiddenSize: Math.floor(inputSize / 2),
      bottleneckSize: Math.floor(inputSize / 4),
      learningRate: 0.01,
      epochs: 50,
      batchSize: 32,
      threshold: 2.5, // 2.5 standard deviations
    });

    this.autoencoder.train(this.trainingData);
  }

  /**
   * Add training data point
   */
  addTrainingDataPoint(features: AnomalyFeatures): void {
    const dataPoint = this.featuresToVector(features);
    this.trainingData.push(dataPoint);

    // Limit training data size
    if (this.trainingData.length > 10000) {
      this.trainingData.shift();
    }

    // Retrain periodically
    if (this.trainingData.length % 1000 === 0) {
      this.trainIsolationForest();
      this.trainAutoencoder();
    }
  }

  /**
   * Convert features to numerical vector for ML
   */
  private featuresToVector(features: AnomalyFeatures): number[] {
    return [
      features.requestRate || 0,
      features.requestRateDeviation || 0,
      features.costPerRequest || 0,
      features.costDeviation || 0,
      features.latency || 0,
      features.latencyDeviation || 0,
      features.errorRate || 0,
      features.promptLength || 0,
      features.promptLengthDeviation || 0,
      features.responseLength || 0,
      features.responseLengthDeviation || 0,
      features.securityViolations || 0,
      features.scannerFindings || 0,
      features.newModel ? 1 : 0,
      features.newProvider ? 1 : 0,
      features.newIpAddress ? 1 : 0,
    ];
  }

  /**
   * Detect anomalies using ML models (Isolation Forest and Autoencoder)
   */
  private detectMLAnomalies(
    features: AnomalyFeatures,
    context: { userId?: string; applicationId?: string; correlationId: string }
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const dataPoint = this.featuresToVector(features);

    // Isolation Forest detection
    if (this.isolationForest) {
      const prediction = this.isolationForest.predict(dataPoint);

      if (prediction.isAnomaly && prediction.confidence > this.config.confidenceThreshold) {
        const overallScore = prediction.score * 100;
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.USAGE_PATTERN,
          severity: this.calculateSeverity(overallScore),
          status: AnomalyStatus.DETECTED,
          score: {
            overall: overallScore,
            confidence: prediction.confidence,
            usageScore: overallScore,
            securityScore: 0,
            costScore: 0,
            performanceScore: 0,
            behavioralScore: 0,
            factors: [
              {
                name: 'ml-isolation-forest',
                score: overallScore,
                weight: 1.0,
                description: 'Isolation Forest anomaly detection score',
              },
            ],
          },
          description: 'ML-based anomaly detected using Isolation Forest',
          features,
          expectedBehavior: {},
          actualBehavior: {},
          evidence: [
            {
              metric: 'ml-isolation-forest',
              expected: 'normal',
              actual: 'anomaly',
              deviation: prediction.score,
            },
          ],
          userId: context.userId,
          applicationId: context.applicationId,
          correlationId: context.correlationId,
          recommendations: [
            'Review recent usage patterns',
            'Check for unauthorized access',
            'Verify application behavior',
          ],
          detectedBy: 'isolation-forest-ml',
        });
      }
    }

    // Autoencoder detection
    if (this.autoencoder) {
      const prediction = this.autoencoder.predict(dataPoint);

      if (prediction.isAnomaly && prediction.confidence > this.config.confidenceThreshold) {
        const overallScore = prediction.reconstructionError * 100;
        anomalies.push({
          id: uuidv4(),
          timestamp: Date.now(),
          type: AnomalyType.BEHAVIORAL_ANOMALY,
          severity: this.calculateSeverity(overallScore),
          status: AnomalyStatus.DETECTED,
          score: {
            overall: overallScore,
            confidence: prediction.confidence,
            usageScore: 0,
            securityScore: 0,
            costScore: 0,
            performanceScore: 0,
            behavioralScore: overallScore,
            factors: [
              {
                name: 'ml-autoencoder',
                score: overallScore,
                weight: 1.0,
                description: 'Autoencoder reconstruction error anomaly score',
              },
            ],
          },
          description: 'ML-based anomaly detected using Autoencoder (high reconstruction error)',
          features,
          expectedBehavior: {},
          actualBehavior: {},
          evidence: [
            {
              metric: 'ml-autoencoder-reconstruction-error',
              expected: 'low',
              actual: 'high',
              deviation: prediction.reconstructionError,
            },
          ],
          userId: context.userId,
          applicationId: context.applicationId,
          correlationId: context.correlationId,
          recommendations: [
            'Investigate unusual behavior patterns',
            'Compare with historical data',
            'Check for data quality issues',
          ],
          detectedBy: 'autoencoder-ml',
        });
      }
    }

    return anomalies;
  }
}

