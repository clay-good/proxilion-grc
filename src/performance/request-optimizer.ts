/**
 * Request Optimizer - Reduces MITM proxy latency
 * 
 * Optimizations:
 * 1. Parallel scanning (PII + compliance + DLP simultaneously)
 * 2. Early termination (stop on first BLOCK-level finding)
 * 3. Smart caching (cache scan results for identical content)
 * 4. Connection pooling (reuse connections to AI providers)
 * 5. Header optimization (remove unnecessary headers)
 * 6. Streaming support (process chunks as they arrive)
 */

import { UnifiedAIRequest, ScanResult, ThreatLevel, PolicyAction } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export interface OptimizationConfig {
  enableParallelScanning?: boolean;
  enableEarlyTermination?: boolean;
  enableScanCaching?: boolean;
  enableConnectionPooling?: boolean;
  enableHeaderOptimization?: boolean;
  enableStreaming?: boolean;
  scanCacheTTL?: number; // milliseconds
  maxCacheSize?: number; // number of entries
}

export interface OptimizationMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheHitRate: number;
  earlyTerminations: number;
  avgLatencyMs: number;
  avgScanTimeMs: number;
  avgForwardTimeMs: number;
  latencyReduction: number; // percentage
}

export class RequestOptimizer {
  private config: OptimizationConfig;
  private scanCache: Map<string, { result: ScanResult; timestamp: number }>;
  private latencyMetrics: number[] = [];
  private scanTimeMetrics: number[] = [];
  private forwardTimeMetrics: number[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private earlyTerminations = 0;
  private totalRequests = 0;

  constructor(config: OptimizationConfig = {}) {
    this.config = {
      enableParallelScanning: config.enableParallelScanning ?? true,
      enableEarlyTermination: config.enableEarlyTermination ?? true,
      enableScanCaching: config.enableScanCaching ?? true,
      enableConnectionPooling: config.enableConnectionPooling ?? true,
      enableHeaderOptimization: config.enableHeaderOptimization ?? true,
      enableStreaming: config.enableStreaming ?? false, // Disabled by default
      scanCacheTTL: config.scanCacheTTL ?? 60000, // 1 minute
      maxCacheSize: config.maxCacheSize ?? 10000,
    };

    this.scanCache = new Map();

    // Periodic cache cleanup
    setInterval(() => this.cleanupCache(), 30000); // Every 30 seconds
  }

  /**
   * Generate cache key from request content
   */
  private generateCacheKey(request: UnifiedAIRequest): string {
    // Hash the messages content for cache key
    const content = JSON.stringify(request.messages);
    return this.simpleHash(content);
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get cached scan result if available
   */
  public getCachedScanResult(request: UnifiedAIRequest): ScanResult | null {
    if (!this.config.enableScanCaching) {
      return null;
    }

    const cacheKey = this.generateCacheKey(request);
    const cached = this.scanCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.config.scanCacheTTL!) {
        this.cacheHits++;
        metrics.counter('optimizer.cache.hits', 1);
        logger.debug('Scan cache hit', { cacheKey, age });
        return cached.result;
      } else {
        // Expired
        this.scanCache.delete(cacheKey);
      }
    }

    this.cacheMisses++;
    metrics.counter('optimizer.cache.misses', 1);
    return null;
  }

  /**
   * Cache scan result
   */
  public cacheScanResult(request: UnifiedAIRequest, result: ScanResult): void {
    if (!this.config.enableScanCaching) {
      return;
    }

    // Check cache size limit
    const maxSize = this.config.maxCacheSize || 10000;
    if (this.scanCache.size >= maxSize) {
      // Remove oldest entry
      const firstKey = this.scanCache.keys().next().value;
      if (firstKey) {
        this.scanCache.delete(firstKey);
      }
    }

    const cacheKey = this.generateCacheKey(request);
    this.scanCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    logger.debug('Scan result cached', { cacheKey });
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let removed = 0;
    const ttl = this.config.scanCacheTTL || 60000;

    for (const [key, value] of this.scanCache.entries()) {
      if (now - value.timestamp > ttl) {
        this.scanCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Cache cleanup', { removed, remaining: this.scanCache.size });
      metrics.gauge('optimizer.cache.size', this.scanCache.size);
    }
  }

  /**
   * Check if early termination is possible
   * Returns true if we should stop scanning immediately
   */
  public shouldTerminateEarly(scanResult: ScanResult): boolean {
    if (!this.config.enableEarlyTermination) {
      return false;
    }

    // Terminate early if we found CRITICAL threat
    const hasCriticalThreat = scanResult.findings.some(f => f.severity === ThreatLevel.CRITICAL);

    if (hasCriticalThreat) {
      this.earlyTerminations++;
      metrics.counter('optimizer.early_terminations', 1);
      logger.debug('Early termination triggered', {
        findings: scanResult.findings.length,
      });
      return true;
    }

    return false;
  }

  /**
   * Optimize request headers (remove unnecessary headers)
   */
  public optimizeHeaders(headers: Record<string, string>): Record<string, string> {
    if (!this.config.enableHeaderOptimization) {
      return headers;
    }

    const optimized = { ...headers };

    // Remove headers that add latency without value
    const unnecessaryHeaders = [
      'x-forwarded-for',
      'x-forwarded-proto',
      'x-forwarded-host',
      'x-real-ip',
      'cf-connecting-ip',
      'cf-ipcountry',
      'cf-ray',
      'cf-visitor',
      'accept-encoding', // Let the AI provider handle compression
    ];

    for (const header of unnecessaryHeaders) {
      delete optimized[header];
      delete optimized[header.toLowerCase()];
    }

    // Simplify user-agent
    if (optimized['user-agent']) {
      optimized['user-agent'] = 'Proxilion/1.0';
    }

    return optimized;
  }

  /**
   * Record latency metrics
   */
  public recordLatency(totalMs: number, scanMs: number, forwardMs: number): void {
    this.totalRequests++;
    this.latencyMetrics.push(totalMs);
    this.scanTimeMetrics.push(scanMs);
    this.forwardTimeMetrics.push(forwardMs);

    // Keep only last 1000 measurements
    if (this.latencyMetrics.length > 1000) {
      this.latencyMetrics.shift();
      this.scanTimeMetrics.shift();
      this.forwardTimeMetrics.shift();
    }

    metrics.histogram('optimizer.latency.total', totalMs);
    metrics.histogram('optimizer.latency.scan', scanMs);
    metrics.histogram('optimizer.latency.forward', forwardMs);
  }

  /**
   * Get optimization metrics
   */
  public getMetrics(): OptimizationMetrics {
    const avgLatency = this.latencyMetrics.length > 0
      ? this.latencyMetrics.reduce((a, b) => a + b, 0) / this.latencyMetrics.length
      : 0;

    const avgScanTime = this.scanTimeMetrics.length > 0
      ? this.scanTimeMetrics.reduce((a, b) => a + b, 0) / this.scanTimeMetrics.length
      : 0;

    const avgForwardTime = this.forwardTimeMetrics.length > 0
      ? this.forwardTimeMetrics.reduce((a, b) => a + b, 0) / this.forwardTimeMetrics.length
      : 0;

    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? (this.cacheHits / totalCacheRequests) * 100
      : 0;

    // Calculate latency reduction (scan time saved by caching)
    const latencyReduction = totalCacheRequests > 0
      ? (this.cacheHits * avgScanTime) / (totalCacheRequests * avgLatency) * 100
      : 0;

    return {
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      cacheHitRate,
      earlyTerminations: this.earlyTerminations,
      avgLatencyMs: avgLatency,
      avgScanTimeMs: avgScanTime,
      avgForwardTimeMs: avgForwardTime,
      latencyReduction,
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.latencyMetrics = [];
    this.scanTimeMetrics = [];
    this.forwardTimeMetrics = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.earlyTerminations = 0;
    this.totalRequests = 0;
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.scanCache.clear();
    logger.info('Scan cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats() {
    return {
      size: this.scanCache.size,
      maxSize: this.config.maxCacheSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits + this.cacheMisses > 0
        ? (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100
        : 0,
      ttl: this.config.scanCacheTTL,
    };
  }
}

