/**
 * Prompt Analytics Engine
 * 
 * Track and analyze prompt performance:
 * - Latency metrics
 * - Cost tracking
 * - Quality scores
 * - Success rates
 * - Token usage
 * - Comparative analysis
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface PromptExecution {
  id: string;
  promptId: string;
  versionId: string;
  userId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
  success: boolean;
  error?: string;
  qualityScore?: number;       // 0-1 (if available)
  metadata: Record<string, any>;
  timestamp: number;
}

export interface PromptMetrics {
  promptId: string;
  versionId?: string;
  
  // Execution stats
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  
  // Latency stats
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  
  // Token stats
  averageInputTokens: number;
  averageOutputTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  
  // Cost stats
  totalCost: number;
  averageCost: number;
  minCost: number;
  maxCost: number;
  
  // Quality stats
  averageQualityScore?: number;
  
  // Time range
  firstExecution: number;
  lastExecution: number;
}

export interface PromptComparison {
  promptIds: string[];
  metrics: Map<string, PromptMetrics>;
  winner?: {
    promptId: string;
    reason: string;
    score: number;
  };
  recommendations: string[];
}

export class PromptAnalytics {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Storage
  private executions: Map<string, PromptExecution[]> = new Map(); // promptId -> executions
  private maxExecutionsPerPrompt: number = 10000;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Record a prompt execution
   */
  recordExecution(execution: Omit<PromptExecution, 'id' | 'timestamp'>): PromptExecution {
    const fullExecution: PromptExecution = {
      ...execution,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    // Get or create executions array
    let executions = this.executions.get(execution.promptId) || [];
    executions.push(fullExecution);

    // Keep only recent executions
    if (executions.length > this.maxExecutionsPerPrompt) {
      executions = executions.slice(-this.maxExecutionsPerPrompt);
    }

    this.executions.set(execution.promptId, executions);

    // Record metrics
    this.metrics.increment('prompt_analytics_execution_total', 1, {
      promptId: execution.promptId,
      provider: execution.provider,
      model: execution.model,
      success: execution.success.toString(),
    });

    this.metrics.histogram('prompt_analytics_latency_ms', execution.latencyMs, {
      promptId: execution.promptId,
    });

    this.metrics.histogram('prompt_analytics_cost', execution.cost, {
      promptId: execution.promptId,
    });

    this.metrics.histogram('prompt_analytics_input_tokens', execution.inputTokens, {
      promptId: execution.promptId,
    });

    this.metrics.histogram('prompt_analytics_output_tokens', execution.outputTokens, {
      promptId: execution.promptId,
    });

    if (execution.qualityScore !== undefined) {
      this.metrics.histogram('prompt_analytics_quality_score', execution.qualityScore, {
        promptId: execution.promptId,
      });
    }

    return fullExecution;
  }

  /**
   * Get metrics for a prompt
   */
  getMetrics(promptId: string, versionId?: string): PromptMetrics | null {
    let executions = this.executions.get(promptId) || [];

    if (executions.length === 0) {
      return null;
    }

    // Filter by version if specified
    if (versionId) {
      executions = executions.filter(e => e.versionId === versionId);
      if (executions.length === 0) {
        return null;
      }
    }

    // Calculate stats
    const successful = executions.filter(e => e.success);
    const failed = executions.filter(e => !e.success);

    const latencies = executions.map(e => e.latencyMs).sort((a, b) => a - b);
    const costs = executions.map(e => e.cost).sort((a, b) => a - b);
    const qualityScores = executions
      .filter(e => e.qualityScore !== undefined)
      .map(e => e.qualityScore!);

    const metrics: PromptMetrics = {
      promptId,
      versionId,
      
      // Execution stats
      totalExecutions: executions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      successRate: successful.length / executions.length,
      
      // Latency stats
      averageLatencyMs: this.average(latencies),
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      
      // Token stats
      averageInputTokens: this.average(executions.map(e => e.inputTokens)),
      averageOutputTokens: this.average(executions.map(e => e.outputTokens)),
      totalInputTokens: executions.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutputTokens: executions.reduce((sum, e) => sum + e.outputTokens, 0),
      
      // Cost stats
      totalCost: executions.reduce((sum, e) => sum + e.cost, 0),
      averageCost: this.average(costs),
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      
      // Quality stats
      averageQualityScore: qualityScores.length > 0 ? this.average(qualityScores) : undefined,
      
      // Time range
      firstExecution: executions[0].timestamp,
      lastExecution: executions[executions.length - 1].timestamp,
    };

    return metrics;
  }

  /**
   * Compare multiple prompts
   */
  compare(promptIds: string[], options?: {
    versionIds?: Map<string, string>;
    optimizeFor?: 'latency' | 'cost' | 'quality' | 'balanced';
  }): PromptComparison {
    const metricsMap = new Map<string, PromptMetrics>();
    
    for (const promptId of promptIds) {
      const versionId = options?.versionIds?.get(promptId);
      const metrics = this.getMetrics(promptId, versionId);
      
      if (metrics) {
        metricsMap.set(promptId, metrics);
      }
    }

    // Determine winner based on optimization goal
    let winner: PromptComparison['winner'];
    const recommendations: string[] = [];

    if (metricsMap.size > 0) {
      const optimizeFor = options?.optimizeFor || 'balanced';
      winner = this.determineWinner(metricsMap, optimizeFor);
      recommendations.push(...this.generateRecommendations(metricsMap));
    }

    return {
      promptIds,
      metrics: metricsMap,
      winner,
      recommendations,
    };
  }

  /**
   * Determine winner based on optimization goal
   */
  private determineWinner(
    metricsMap: Map<string, PromptMetrics>,
    optimizeFor: 'latency' | 'cost' | 'quality' | 'balanced'
  ): PromptComparison['winner'] {
    const entries = Array.from(metricsMap.entries());
    
    if (entries.length === 0) {
      return undefined;
    }

    let bestPromptId: string;
    let bestScore: number;
    let reason: string;

    switch (optimizeFor) {
      case 'latency':
        // Lower latency is better
        const latencyScores = entries.map(([id, m]) => ({
          id,
          score: 1 / m.averageLatencyMs,
        }));
        const bestLatency = latencyScores.reduce((best, curr) => 
          curr.score > best.score ? curr : best
        );
        bestPromptId = bestLatency.id;
        bestScore = bestLatency.score;
        reason = `Lowest average latency: ${metricsMap.get(bestPromptId)!.averageLatencyMs.toFixed(2)}ms`;
        break;

      case 'cost':
        // Lower cost is better
        const costScores = entries.map(([id, m]) => ({
          id,
          score: 1 / m.averageCost,
        }));
        const bestCost = costScores.reduce((best, curr) => 
          curr.score > best.score ? curr : best
        );
        bestPromptId = bestCost.id;
        bestScore = bestCost.score;
        reason = `Lowest average cost: $${metricsMap.get(bestPromptId)!.averageCost.toFixed(4)}`;
        break;

      case 'quality':
        // Higher quality is better
        const qualityScores = entries
          .filter(([_, m]) => m.averageQualityScore !== undefined)
          .map(([id, m]) => ({
            id,
            score: m.averageQualityScore!,
          }));
        
        if (qualityScores.length === 0) {
          return undefined;
        }
        
        const bestQuality = qualityScores.reduce((best, curr) => 
          curr.score > best.score ? curr : best
        );
        bestPromptId = bestQuality.id;
        bestScore = bestQuality.score;
        reason = `Highest quality score: ${bestScore.toFixed(3)}`;
        break;

      case 'balanced':
      default:
        // Balanced score: consider latency, cost, quality, success rate
        const balancedScores = entries.map(([id, m]) => {
          const latencyScore = 1 / (m.averageLatencyMs / 1000); // Normalize to seconds
          const costScore = 1 / (m.averageCost * 100);          // Normalize
          const qualityScore = m.averageQualityScore || 0.5;
          const successScore = m.successRate;
          
          // Weighted average
          const score = (
            latencyScore * 0.25 +
            costScore * 0.25 +
            qualityScore * 0.25 +
            successScore * 0.25
          );
          
          return { id, score };
        });
        
        const bestBalanced = balancedScores.reduce((best, curr) => 
          curr.score > best.score ? curr : best
        );
        bestPromptId = bestBalanced.id;
        bestScore = bestBalanced.score;
        reason = 'Best balanced score across all metrics';
        break;
    }

    return {
      promptId: bestPromptId,
      reason,
      score: bestScore,
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(metricsMap: Map<string, PromptMetrics>): string[] {
    const recommendations: string[] = [];
    const entries = Array.from(metricsMap.entries());

    if (entries.length === 0) {
      return recommendations;
    }

    // Check success rates
    const lowSuccessRate = entries.filter(([_, m]) => m.successRate < 0.95);
    if (lowSuccessRate.length > 0) {
      recommendations.push(
        `${lowSuccessRate.length} prompt(s) have success rate below 95%. Consider improving error handling.`
      );
    }

    // Check latency
    const avgLatencies = entries.map(([_, m]) => m.averageLatencyMs);
    const maxLatency = Math.max(...avgLatencies);
    const minLatency = Math.min(...avgLatencies);
    
    if (maxLatency > minLatency * 2) {
      recommendations.push(
        `Latency varies significantly (${minLatency.toFixed(0)}ms - ${maxLatency.toFixed(0)}ms). Consider optimizing slower prompts.`
      );
    }

    // Check costs
    const avgCosts = entries.map(([_, m]) => m.averageCost);
    const maxCost = Math.max(...avgCosts);
    const minCost = Math.min(...avgCosts);
    
    if (maxCost > minCost * 2) {
      recommendations.push(
        `Cost varies significantly ($${minCost.toFixed(4)} - $${maxCost.toFixed(4)}). Consider using more cost-effective prompts.`
      );
    }

    // Check token usage
    const avgOutputTokens = entries.map(([_, m]) => m.averageOutputTokens);
    const maxTokens = Math.max(...avgOutputTokens);
    
    if (maxTokens > 2000) {
      recommendations.push(
        `Some prompts generate very long outputs (${maxTokens.toFixed(0)} tokens). Consider adding length constraints.`
      );
    }

    return recommendations;
  }

  /**
   * Get executions for a prompt
   */
  getExecutions(promptId: string, limit?: number): PromptExecution[] {
    const executions = this.executions.get(promptId) || [];
    return limit ? executions.slice(-limit) : executions;
  }

  /**
   * Clear executions for a prompt
   */
  clearExecutions(promptId: string): void {
    this.executions.delete(promptId);
    
    this.logger.info('Executions cleared', { promptId });
  }

  /**
   * Calculate average
   */
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedNumbers: number[], p: number): number {
    if (sortedNumbers.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedNumbers.length) - 1;
    return sortedNumbers[Math.max(0, index)];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPrompts: number;
    totalExecutions: number;
    averageExecutionsPerPrompt: number;
  } {
    const totalExecutions = Array.from(this.executions.values())
      .reduce((sum, execs) => sum + execs.length, 0);

    return {
      totalPrompts: this.executions.size,
      totalExecutions,
      averageExecutionsPerPrompt: this.executions.size > 0 
        ? totalExecutions / this.executions.size 
        : 0,
    };
  }
}

