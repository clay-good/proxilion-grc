/**
 * Anomaly Detection Types
 * 
 * Type definitions for ML-based anomaly detection system
 */

export enum AnomalyType {
  USAGE_PATTERN = 'usage_pattern',
  SECURITY_THREAT = 'security_threat',
  COST_ANOMALY = 'cost_anomaly',
  PERFORMANCE_ANOMALY = 'performance_anomaly',
  BEHAVIORAL_ANOMALY = 'behavioral_anomaly',
  DATA_EXFILTRATION = 'data_exfiltration',
  CREDENTIAL_ABUSE = 'credential_abuse',
  RATE_ANOMALY = 'rate_anomaly',
}

export enum AnomalySeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AnomalyStatus {
  DETECTED = 'detected',
  INVESTIGATING = 'investigating',
  CONFIRMED = 'confirmed',
  FALSE_POSITIVE = 'false_positive',
  RESOLVED = 'resolved',
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  
  // Detection settings
  enableUsagePatternDetection: boolean;
  enableSecurityThreatDetection: boolean;
  enableCostAnomalyDetection: boolean;
  enablePerformanceAnomalyDetection: boolean;
  enableBehavioralDetection: boolean;
  
  // Sensitivity settings (0-1, higher = more sensitive)
  usagePatternSensitivity: number;
  securityThreatSensitivity: number;
  costAnomalySensitivity: number;
  performanceAnomalySensitivity: number;
  behavioralSensitivity: number;
  
  // Learning settings
  learningPeriodDays: number;
  minDataPointsForBaseline: number;
  baselineUpdateInterval: number; // milliseconds
  
  // Scoring settings
  minAnomalyScore: number; // Minimum score to report (0-100)
  confidenceThreshold: number; // Minimum confidence (0-1)
  
  // Alert settings
  alertOnDetection: boolean;
  alertSeverityThreshold: AnomalySeverity;
  
  // Storage settings
  maxAnomaliesStored: number;
  anomalyRetentionPeriod: number; // milliseconds
}

export interface UserBehaviorProfile {
  userId: string;
  
  // Usage patterns
  avgRequestsPerHour: number;
  avgRequestsPerDay: number;
  peakUsageHours: number[];
  typicalModels: string[];
  typicalProviders: string[];
  
  // Cost patterns
  avgCostPerRequest: number;
  avgDailyCost: number;
  maxDailyCost: number;
  
  // Content patterns
  avgPromptLength: number;
  avgResponseLength: number;
  typicalTopics: string[];
  
  // Security patterns
  typicalIpAddresses: string[];
  typicalUserAgents: string[];
  typicalLocations: string[];
  
  // Timing patterns
  typicalRequestDuration: number;
  typicalResponseTime: number;
  
  // Metadata
  firstSeen: number;
  lastSeen: number;
  totalRequests: number;
  profileConfidence: number; // 0-1
}

export interface ApplicationBehaviorProfile {
  applicationId: string;
  
  // Usage patterns
  avgRequestsPerMinute: number;
  avgRequestsPerHour: number;
  peakUsagePatterns: { hour: number; count: number }[];
  
  // Model usage
  modelDistribution: Record<string, number>;
  providerDistribution: Record<string, number>;
  
  // Cost patterns
  avgCostPerRequest: number;
  totalCost: number;
  costTrend: 'increasing' | 'decreasing' | 'stable';
  
  // Performance patterns
  avgLatency: number;
  errorRate: number;
  timeoutRate: number;
  
  // Security patterns
  securityViolationRate: number;
  typicalScannerFindings: Record<string, number>;
  
  // Metadata
  firstSeen: number;
  lastSeen: number;
  totalRequests: number;
  profileConfidence: number;
}

export interface AnomalyFeatures {
  // Usage features
  requestRate: number;
  requestRateDeviation: number;
  
  // Cost features
  costPerRequest: number;
  costDeviation: number;
  totalCost: number;
  
  // Content features
  promptLength: number;
  promptLengthDeviation: number;
  responseLength: number;
  responseLengthDeviation: number;
  
  // Security features
  securityViolations: number;
  threatLevel: string;
  scannerFindings: number;
  
  // Performance features
  latency: number;
  latencyDeviation: number;
  errorRate: number;
  
  // Behavioral features
  newModel: boolean;
  newProvider: boolean;
  newIpAddress: boolean;
  newUserAgent: boolean;
  unusualTime: boolean;
  
  // Temporal features
  hourOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
}

export interface AnomalyScore {
  overall: number; // 0-100
  confidence: number; // 0-1
  
  // Component scores
  usageScore: number;
  securityScore: number;
  costScore: number;
  performanceScore: number;
  behavioralScore: number;
  
  // Contributing factors
  factors: {
    name: string;
    score: number;
    weight: number;
    description: string;
  }[];
}

export interface Anomaly {
  id: string;
  timestamp: number;
  
  // Classification
  type: AnomalyType;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  
  // Scoring
  score: AnomalyScore;
  
  // Context
  userId?: string;
  applicationId?: string;
  correlationId: string;
  
  // Details
  description: string;
  features: AnomalyFeatures;
  expectedBehavior: Partial<AnomalyFeatures>;
  actualBehavior: Partial<AnomalyFeatures>;
  
  // Evidence
  evidence: {
    metric: string;
    expected: number | string;
    actual: number | string;
    deviation: number;
  }[];
  
  // Recommendations
  recommendations: string[];
  
  // Metadata
  detectedBy: string; // Detection algorithm
  investigatedBy?: string;
  resolvedBy?: string;
  notes?: string;
}

export interface AnomalyDetectionResult {
  anomalies: Anomaly[];
  totalAnomalies: number;
  highSeverityCount: number;
  criticalSeverityCount: number;
  
  // Summary
  summary: {
    usageAnomalies: number;
    securityAnomalies: number;
    costAnomalies: number;
    performanceAnomalies: number;
    behavioralAnomalies: number;
  };
  
  // Metadata
  detectionTime: number;
  profilesAnalyzed: number;
}

export interface BaselineStatistics {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
  count: number;
  lastUpdated: number;
}

export interface ThreatIntelligence {
  id: string;
  type: 'ip' | 'user_agent' | 'pattern' | 'signature';
  value: string;
  severity: AnomalySeverity;
  description: string;
  source: string;
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
}

export interface AnomalyDetectionMetrics {
  // Detection metrics
  totalAnomaliesDetected: number;
  anomaliesByType: Record<AnomalyType, number>;
  anomaliesBySeverity: Record<AnomalySeverity, number>;
  
  // Accuracy metrics
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  
  // Performance metrics
  avgDetectionTime: number;
  profilesAnalyzed: number;
  
  // Timing
  lastDetectionRun: number;
  totalDetectionRuns: number;
}

