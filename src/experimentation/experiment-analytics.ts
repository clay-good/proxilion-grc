/**
 * Experiment Analytics
 * 
 * Provides statistical analysis for A/B tests including:
 * - Statistical significance testing
 * - Confidence intervals
 * - Winner determination
 * - Sample size calculations
 */

import { Logger } from '../utils/logger.js';
import { ExperimentMetrics } from './experiment-manager.js';

export interface StatisticalTest {
  variantA: string;
  variantB: string;
  metric: string;
  pValue: number;              // p-value (0-1)
  significant: boolean;        // Is result statistically significant?
  confidenceLevel: number;     // Confidence level used (e.g., 0.95)
  effectSize: number;          // Difference between variants
  relativeImprovement: number; // Percentage improvement
}

export interface ConfidenceInterval {
  variantId: string;
  metric: string;
  mean: number;
  lower: number;              // Lower bound
  upper: number;              // Upper bound
  confidenceLevel: number;    // e.g., 0.95 for 95%
}

export interface WinnerAnalysis {
  experimentId: string;
  winner: string | null;      // Variant ID or null if no clear winner
  confidence: number;         // Confidence in winner (0-1)
  reason: string;
  improvements: Record<string, number>; // Metric -> improvement %
  recommendedAction: 'continue' | 'stop' | 'declare_winner' | 'inconclusive';
}

export interface SampleSizeRecommendation {
  metric: string;
  currentSampleSize: number;
  requiredSampleSize: number;
  progress: number;           // 0-1
  estimatedDaysRemaining: number;
}

export class ExperimentAnalytics {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Perform t-test between two variants
   */
  performTTest(
    metricsA: ExperimentMetrics,
    metricsB: ExperimentMetrics,
    metric: 'latency' | 'cost' | 'conversionRate',
    confidenceLevel: number = 0.95
  ): StatisticalTest {
    const valueA = this.getMetricValue(metricsA, metric);
    const valueB = this.getMetricValue(metricsB, metric);

    // Calculate effect size
    const effectSize = valueB - valueA;
    const relativeImprovement = valueA !== 0 ? ((valueB - valueA) / valueA) * 100 : 0;

    // Calculate pooled standard deviation (simplified)
    const nA = metricsA.totalRequests;
    const nB = metricsB.totalRequests;

    // Estimate variance (simplified - in production use actual variance)
    const varianceA = this.estimateVariance(metricsA, metric);
    const varianceB = this.estimateVariance(metricsB, metric);

    // Calculate t-statistic
    const pooledVariance = ((nA - 1) * varianceA + (nB - 1) * varianceB) / (nA + nB - 2);
    const standardError = Math.sqrt(pooledVariance * (1 / nA + 1 / nB));
    const tStatistic = standardError !== 0 ? effectSize / standardError : 0;

    // Calculate degrees of freedom
    const degreesOfFreedom = nA + nB - 2;

    // Calculate p-value (simplified approximation)
    const pValue = this.calculatePValue(tStatistic, degreesOfFreedom);

    // Determine significance
    const alpha = 1 - confidenceLevel;
    const significant = pValue < alpha;

    this.logger.debug('Performed t-test', {
      variantA: metricsA.variantId,
      variantB: metricsB.variantId,
      metric,
      pValue,
      significant,
      effectSize,
    });

    return {
      variantA: metricsA.variantId,
      variantB: metricsB.variantId,
      metric,
      pValue,
      significant,
      confidenceLevel,
      effectSize,
      relativeImprovement,
    };
  }

  /**
   * Calculate confidence interval for a variant
   */
  calculateConfidenceInterval(
    metrics: ExperimentMetrics,
    metric: 'latency' | 'cost' | 'conversionRate',
    confidenceLevel: number = 0.95
  ): ConfidenceInterval {
    const mean = this.getMetricValue(metrics, metric);
    const n = metrics.totalRequests;
    const variance = this.estimateVariance(metrics, metric);
    const standardError = Math.sqrt(variance / n);

    // Calculate critical value (z-score for normal distribution)
    const alpha = 1 - confidenceLevel;
    const zScore = this.getZScore(1 - alpha / 2);

    // Calculate bounds
    const marginOfError = zScore * standardError;
    const lower = mean - marginOfError;
    const upper = mean + marginOfError;

    return {
      variantId: metrics.variantId,
      metric,
      mean,
      lower,
      upper,
      confidenceLevel,
    };
  }

  /**
   * Determine experiment winner
   */
  determineWinner(
    allMetrics: ExperimentMetrics[],
    primaryMetric: 'latency' | 'cost' | 'conversionRate' = 'conversionRate',
    confidenceLevel: number = 0.95,
    minSampleSize: number = 100
  ): WinnerAnalysis {
    if (allMetrics.length < 2) {
      return {
        experimentId: allMetrics[0]?.experimentId || '',
        winner: null,
        confidence: 0,
        reason: 'Need at least 2 variants',
        improvements: {},
        recommendedAction: 'continue',
      };
    }

    // Check minimum sample size
    const insufficientSamples = allMetrics.filter(m => m.totalRequests < minSampleSize);
    if (insufficientSamples.length > 0) {
      return {
        experimentId: allMetrics[0].experimentId,
        winner: null,
        confidence: 0,
        reason: `Insufficient samples (min: ${minSampleSize})`,
        improvements: {},
        recommendedAction: 'continue',
      };
    }

    // Find best performing variant
    const sortedMetrics = [...allMetrics].sort((a, b) => {
      const valueA = this.getMetricValue(a, primaryMetric);
      const valueB = this.getMetricValue(b, primaryMetric);
      
      // For latency and cost, lower is better
      if (primaryMetric === 'latency' || primaryMetric === 'cost') {
        return valueA - valueB;
      }
      // For conversion rate, higher is better
      return valueB - valueA;
    });

    const bestVariant = sortedMetrics[0];
    const secondBest = sortedMetrics[1];

    // Perform statistical test
    const test = this.performTTest(secondBest, bestVariant, primaryMetric, confidenceLevel);

    // Calculate improvements
    const improvements: Record<string, number> = {};
    for (const metric of ['latency', 'cost', 'conversionRate'] as const) {
      const bestValue = this.getMetricValue(bestVariant, metric);
      const baseValue = this.getMetricValue(secondBest, metric);
      
      if (baseValue !== 0) {
        improvements[metric] = ((bestValue - baseValue) / baseValue) * 100;
      }
    }

    // Determine winner and recommendation
    if (test.significant) {
      return {
        experimentId: bestVariant.experimentId,
        winner: bestVariant.variantId,
        confidence: 1 - test.pValue,
        reason: `Statistically significant improvement (p=${test.pValue.toFixed(4)})`,
        improvements,
        recommendedAction: 'declare_winner',
      };
    } else {
      return {
        experimentId: bestVariant.experimentId,
        winner: null,
        confidence: 0,
        reason: `No statistically significant difference (p=${test.pValue.toFixed(4)})`,
        improvements,
        recommendedAction: 'continue',
      };
    }
  }

  /**
   * Calculate required sample size
   */
  calculateRequiredSampleSize(
    baselineConversionRate: number,
    minimumDetectableEffect: number, // e.g., 0.05 for 5% improvement
    confidenceLevel: number = 0.95,
    power: number = 0.80
  ): number {
    // Simplified sample size calculation for proportions
    const alpha = 1 - confidenceLevel;
    const beta = 1 - power;

    const zAlpha = this.getZScore(1 - alpha / 2);
    const zBeta = this.getZScore(power);

    const p1 = baselineConversionRate;
    const p2 = baselineConversionRate * (1 + minimumDetectableEffect);
    const pBar = (p1 + p2) / 2;

    const numerator = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
    const denominator = Math.pow(p2 - p1, 2);

    const sampleSize = Math.ceil(numerator / denominator);

    return sampleSize;
  }

  /**
   * Get sample size recommendation
   */
  getSampleSizeRecommendation(
    metrics: ExperimentMetrics,
    baselineConversionRate: number,
    minimumDetectableEffect: number,
    averageRequestsPerDay: number
  ): SampleSizeRecommendation {
    const requiredSampleSize = this.calculateRequiredSampleSize(
      baselineConversionRate,
      minimumDetectableEffect
    );

    const currentSampleSize = metrics.totalRequests;
    const progress = Math.min(currentSampleSize / requiredSampleSize, 1);
    const remaining = Math.max(requiredSampleSize - currentSampleSize, 0);
    const estimatedDaysRemaining = averageRequestsPerDay > 0 
      ? Math.ceil(remaining / averageRequestsPerDay)
      : 0;

    return {
      metric: 'conversionRate',
      currentSampleSize,
      requiredSampleSize,
      progress,
      estimatedDaysRemaining,
    };
  }

  /**
   * Calculate Bayesian probability of being best
   */
  calculateBayesianProbability(
    allMetrics: ExperimentMetrics[],
    metric: 'latency' | 'cost' | 'conversionRate',
    simulations: number = 10000
  ): Record<string, number> {
    const probabilities: Record<string, number> = {};

    // Monte Carlo simulation
    const wins: Record<string, number> = {};
    
    for (const m of allMetrics) {
      wins[m.variantId] = 0;
    }

    for (let i = 0; i < simulations; i++) {
      const samples: { variantId: string; value: number }[] = [];

      for (const m of allMetrics) {
        const mean = this.getMetricValue(m, metric);
        const variance = this.estimateVariance(m, metric);
        const stdDev = Math.sqrt(variance);
        
        // Sample from normal distribution
        const sample = this.sampleNormal(mean, stdDev);
        samples.push({ variantId: m.variantId, value: sample });
      }

      // Find best sample
      const sorted = samples.sort((a, b) => {
        if (metric === 'latency' || metric === 'cost') {
          return a.value - b.value; // Lower is better
        }
        return b.value - a.value; // Higher is better
      });

      wins[sorted[0].variantId]++;
    }

    // Calculate probabilities
    for (const variantId in wins) {
      probabilities[variantId] = wins[variantId] / simulations;
    }

    return probabilities;
  }

  /**
   * Get metric value from metrics object
   */
  private getMetricValue(metrics: ExperimentMetrics, metric: 'latency' | 'cost' | 'conversionRate'): number {
    switch (metric) {
      case 'latency':
        return metrics.averageLatency;
      case 'cost':
        return metrics.averageCost;
      case 'conversionRate':
        return metrics.conversionRate;
    }
  }

  /**
   * Estimate variance for a metric (simplified)
   */
  private estimateVariance(metrics: ExperimentMetrics, metric: 'latency' | 'cost' | 'conversionRate'): number {
    const value = this.getMetricValue(metrics, metric);
    
    // Simplified variance estimation
    if (metric === 'conversionRate') {
      // Binomial variance: p(1-p)
      return value * (1 - value);
    } else {
      // Assume coefficient of variation of 0.3
      return Math.pow(value * 0.3, 2);
    }
  }

  /**
   * Calculate p-value from t-statistic (simplified approximation)
   */
  private calculatePValue(tStatistic: number, degreesOfFreedom: number): number {
    // Simplified p-value calculation using normal approximation
    const absT = Math.abs(tStatistic);
    
    // For large df, t-distribution approximates normal distribution
    // Using complementary error function approximation
    const z = absT;
    const pValue = 2 * (1 - this.normalCDF(z));
    
    return Math.max(0, Math.min(1, pValue));
  }

  /**
   * Normal cumulative distribution function
   */
  private normalCDF(x: number): number {
    // Approximation of normal CDF
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Get z-score for a given probability
   */
  private getZScore(probability: number): number {
    // Common z-scores
    if (probability >= 0.975) return 1.96;  // 95% CI
    if (probability >= 0.95) return 1.645;  // 90% CI
    if (probability >= 0.90) return 1.28;   // 80% CI
    
    // Approximation for other values
    return Math.sqrt(2) * this.inverseErf(2 * probability - 1);
  }

  /**
   * Inverse error function (approximation)
   */
  private inverseErf(x: number): number {
    const a = 0.147;
    const b = 2 / (Math.PI * a) + Math.log(1 - x * x) / 2;
    const sqrt1 = Math.sqrt(b * b - Math.log(1 - x * x) / a);
    const sqrt2 = Math.sqrt(sqrt1 - b);
    
    return sqrt2 * Math.sign(x);
  }

  /**
   * Sample from normal distribution (Box-Muller transform)
   */
  private sampleNormal(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    return mean + z0 * stdDev;
  }
}

