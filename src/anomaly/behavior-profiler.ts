/**
 * Behavioral Profiling System
 * 
 * Learns and tracks normal behavior patterns for users and applications
 */

import {
  UserBehaviorProfile,
  ApplicationBehaviorProfile,
  BaselineStatistics,
} from './anomaly-types.js';

export interface RequestData {
  userId?: string;
  applicationId?: string;
  model: string;
  provider: string;
  promptLength: number;
  responseLength: number;
  cost: number;
  latency: number;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  errorOccurred: boolean;
  securityViolations: number;
}

export class BehaviorProfiler {
  private userProfiles: Map<string, UserBehaviorProfile> = new Map();
  private appProfiles: Map<string, ApplicationBehaviorProfile> = new Map();
  private requestHistory: Map<string, RequestData[]> = new Map();
  private learningPeriodDays: number;
  private minDataPoints: number;

  constructor(config: { learningPeriodDays?: number; minDataPoints?: number } = {}) {
    this.learningPeriodDays = config.learningPeriodDays || 7;
    this.minDataPoints = config.minDataPoints || 100;
  }

  /**
   * Learn from a request
   */
  learnFromRequest(data: RequestData): void {
    if (data.userId) {
      this.updateUserProfile(data);
    }

    if (data.applicationId) {
      this.updateApplicationProfile(data);
    }

    // Store request history
    this.storeRequestHistory(data);
  }

  /**
   * Update user behavior profile
   */
  private updateUserProfile(data: RequestData): void {
    if (!data.userId) return;

    let profile = this.userProfiles.get(data.userId);

    if (!profile) {
      // Create new profile
      profile = {
        userId: data.userId,
        avgRequestsPerHour: 0,
        avgRequestsPerDay: 0,
        peakUsageHours: [],
        typicalModels: [data.model],
        typicalProviders: [data.provider],
        avgCostPerRequest: data.cost,
        avgDailyCost: data.cost,
        maxDailyCost: data.cost,
        avgPromptLength: data.promptLength,
        avgResponseLength: data.responseLength,
        typicalTopics: [],
        typicalIpAddresses: data.ipAddress ? [data.ipAddress] : [],
        typicalUserAgents: data.userAgent ? [data.userAgent] : [],
        typicalLocations: data.location ? [data.location] : [],
        typicalRequestDuration: data.latency,
        typicalResponseTime: data.latency,
        firstSeen: data.timestamp,
        lastSeen: data.timestamp,
        totalRequests: 1,
        profileConfidence: 0.1,
      };
      this.userProfiles.set(data.userId, profile);
      return;
    }

    // Update existing profile with exponential moving average
    const alpha = 0.1; // Smoothing factor

    profile.avgCostPerRequest =
      alpha * data.cost + (1 - alpha) * profile.avgCostPerRequest;
    profile.avgPromptLength =
      alpha * data.promptLength + (1 - alpha) * profile.avgPromptLength;
    profile.avgResponseLength =
      alpha * data.responseLength + (1 - alpha) * profile.avgResponseLength;
    profile.typicalRequestDuration =
      alpha * data.latency + (1 - alpha) * profile.typicalRequestDuration;
    profile.typicalResponseTime =
      alpha * data.latency + (1 - alpha) * profile.typicalResponseTime;

    // Update typical models
    if (!profile.typicalModels.includes(data.model)) {
      profile.typicalModels.push(data.model);
      if (profile.typicalModels.length > 10) {
        profile.typicalModels.shift();
      }
    }

    // Update typical providers
    if (!profile.typicalProviders.includes(data.provider)) {
      profile.typicalProviders.push(data.provider);
      if (profile.typicalProviders.length > 5) {
        profile.typicalProviders.shift();
      }
    }

    // Update typical IP addresses
    if (data.ipAddress && !profile.typicalIpAddresses.includes(data.ipAddress)) {
      profile.typicalIpAddresses.push(data.ipAddress);
      if (profile.typicalIpAddresses.length > 10) {
        profile.typicalIpAddresses.shift();
      }
    }

    // Update typical user agents
    if (data.userAgent && !profile.typicalUserAgents.includes(data.userAgent)) {
      profile.typicalUserAgents.push(data.userAgent);
      if (profile.typicalUserAgents.length > 5) {
        profile.typicalUserAgents.shift();
      }
    }

    // Update metadata
    profile.lastSeen = data.timestamp;
    profile.totalRequests++;

    // Calculate profile confidence based on data points
    profile.profileConfidence = Math.min(
      1,
      profile.totalRequests / this.minDataPoints
    );

    // Calculate request rates
    const daysSinceFirst =
      (data.timestamp - profile.firstSeen) / (1000 * 60 * 60 * 24);
    if (daysSinceFirst > 0) {
      profile.avgRequestsPerDay = profile.totalRequests / daysSinceFirst;
      profile.avgRequestsPerHour = profile.avgRequestsPerDay / 24;
    }

    // Calculate peak usage hours
    this.updatePeakUsageHours(profile, data.timestamp);

    this.userProfiles.set(data.userId, profile);
  }

  /**
   * Update application behavior profile
   */
  private updateApplicationProfile(data: RequestData): void {
    if (!data.applicationId) return;

    let profile = this.appProfiles.get(data.applicationId);

    if (!profile) {
      // Create new profile
      profile = {
        applicationId: data.applicationId,
        avgRequestsPerMinute: 0,
        avgRequestsPerHour: 0,
        peakUsagePatterns: [],
        modelDistribution: { [data.model]: 1 },
        providerDistribution: { [data.provider]: 1 },
        avgCostPerRequest: data.cost,
        totalCost: data.cost,
        costTrend: 'stable',
        avgLatency: data.latency,
        errorRate: data.errorOccurred ? 1 : 0,
        timeoutRate: 0,
        securityViolationRate: data.securityViolations > 0 ? 1 : 0,
        typicalScannerFindings: {},
        firstSeen: data.timestamp,
        lastSeen: data.timestamp,
        totalRequests: 1,
        profileConfidence: 0.1,
      };
      this.appProfiles.set(data.applicationId, profile);
      return;
    }

    // Update existing profile
    const alpha = 0.1;

    profile.avgCostPerRequest =
      alpha * data.cost + (1 - alpha) * profile.avgCostPerRequest;
    profile.totalCost += data.cost;
    profile.avgLatency = alpha * data.latency + (1 - alpha) * profile.avgLatency;

    // Update model distribution
    profile.modelDistribution[data.model] =
      (profile.modelDistribution[data.model] || 0) + 1;

    // Update provider distribution
    profile.providerDistribution[data.provider] =
      (profile.providerDistribution[data.provider] || 0) + 1;

    // Update error rate
    const errorCount = data.errorOccurred ? 1 : 0;
    profile.errorRate =
      (profile.errorRate * profile.totalRequests + errorCount) /
      (profile.totalRequests + 1);

    // Update security violation rate
    const violationCount = data.securityViolations > 0 ? 1 : 0;
    profile.securityViolationRate =
      (profile.securityViolationRate * profile.totalRequests + violationCount) /
      (profile.totalRequests + 1);

    // Update metadata
    profile.lastSeen = data.timestamp;
    profile.totalRequests++;

    // Calculate profile confidence
    profile.profileConfidence = Math.min(
      1,
      profile.totalRequests / this.minDataPoints
    );

    // Calculate request rates
    const minutesSinceFirst =
      (data.timestamp - profile.firstSeen) / (1000 * 60);
    if (minutesSinceFirst > 0) {
      profile.avgRequestsPerMinute = profile.totalRequests / minutesSinceFirst;
      profile.avgRequestsPerHour = profile.avgRequestsPerMinute * 60;
    }

    // Determine cost trend
    this.updateCostTrend(profile);

    this.appProfiles.set(data.applicationId, profile);
  }

  /**
   * Update peak usage hours for user profile
   */
  private updatePeakUsageHours(
    profile: UserBehaviorProfile,
    timestamp: number
  ): void {
    // Get request history for this user
    const history = this.requestHistory.get(profile.userId) || [];

    // Count requests per hour
    const hourCounts: Record<number, number> = {};
    for (const req of history) {
      const reqHour = new Date(req.timestamp).getHours();
      hourCounts[reqHour] = (hourCounts[reqHour] || 0) + 1;
    }

    // Find top 3 peak hours
    const sortedHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => parseInt(h));

    profile.peakUsageHours = sortedHours;
  }

  /**
   * Update cost trend for application profile
   */
  private updateCostTrend(profile: ApplicationBehaviorProfile): void {
    const history = this.requestHistory.get(profile.applicationId) || [];

    if (history.length < 10) {
      profile.costTrend = 'stable';
      return;
    }

    // Calculate cost trend over last 10 requests
    const recent = history.slice(-10);
    const older = history.slice(-20, -10);

    if (older.length === 0) {
      profile.costTrend = 'stable';
      return;
    }

    const recentAvg = recent.reduce((sum, r) => sum + r.cost, 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + r.cost, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > 0.2) {
      profile.costTrend = 'increasing';
    } else if (change < -0.2) {
      profile.costTrend = 'decreasing';
    } else {
      profile.costTrend = 'stable';
    }
  }

  /**
   * Store request history
   */
  private storeRequestHistory(data: RequestData): void {
    const key = data.userId || data.applicationId;
    if (!key) return;

    let history = this.requestHistory.get(key);
    if (!history) {
      history = [];
      this.requestHistory.set(key, history);
    }

    history.push(data);

    // Keep only recent history (last 1000 requests or 7 days)
    const cutoff = Date.now() - this.learningPeriodDays * 24 * 60 * 60 * 1000;
    history = history.filter((r) => r.timestamp > cutoff).slice(-1000);

    this.requestHistory.set(key, history);
  }

  /**
   * Get user profile
   */
  getUserProfile(userId: string): UserBehaviorProfile | undefined {
    return this.userProfiles.get(userId);
  }

  /**
   * Get application profile
   */
  getApplicationProfile(appId: string): ApplicationBehaviorProfile | undefined {
    return this.appProfiles.get(appId);
  }

  /**
   * Calculate baseline statistics for a metric
   */
  calculateBaseline(values: number[]): BaselineStatistics {
    if (values.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0,
        count: 0,
        lastUpdated: Date.now(),
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      count: values.length,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get all user profiles
   */
  getAllUserProfiles(): UserBehaviorProfile[] {
    return Array.from(this.userProfiles.values());
  }

  /**
   * Get all application profiles
   */
  getAllApplicationProfiles(): ApplicationBehaviorProfile[] {
    return Array.from(this.appProfiles.values());
  }
}

