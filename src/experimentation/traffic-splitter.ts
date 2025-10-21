/**
 * Traffic Splitter
 * 
 * Implements consistent traffic splitting for A/B tests and experiments
 * using various algorithms including consistent hashing, weighted random,
 * and sticky sessions.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type SplitAlgorithm = 'consistent-hash' | 'weighted-random' | 'round-robin' | 'sticky-session';

export interface TrafficSplit {
  id: string;
  name: string;
  algorithm: SplitAlgorithm;
  buckets: TrafficBucket[];
  enabled: boolean;
  stickySession: boolean;      // Keep same bucket for user
  createdAt: number;
}

export interface TrafficBucket {
  id: string;
  name: string;
  weight: number;              // 0-1 (must sum to 1.0)
  config: Record<string, any>; // Bucket configuration
  enabled: boolean;
}

export interface SplitResult {
  splitId: string;
  bucketId: string;
  bucketName: string;
  algorithm: SplitAlgorithm;
  userId: string;
  timestamp: number;
}

export class TrafficSplitter {
  private logger: Logger;
  private metrics: MetricsCollector;
  private splits: Map<string, TrafficSplit> = new Map();
  private sessions: Map<string, SplitResult> = new Map(); // userId:splitId -> result
  private roundRobinCounters: Map<string, number> = new Map(); // splitId -> counter

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Create a new traffic split
   */
  createSplit(split: Omit<TrafficSplit, 'createdAt'>): TrafficSplit {
    // Validate weights sum to 1.0
    const totalWeight = split.buckets.reduce((sum, b) => sum + b.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Bucket weights must sum to 1.0, got ${totalWeight}`);
    }

    const newSplit: TrafficSplit = {
      ...split,
      createdAt: Date.now(),
    };

    this.splits.set(newSplit.id, newSplit);

    this.logger.info('Created traffic split', {
      splitId: newSplit.id,
      algorithm: newSplit.algorithm,
      buckets: newSplit.buckets.length,
    });

    this.metrics.increment('traffic_splits_created_total');

    return newSplit;
  }

  /**
   * Get traffic split by ID
   */
  getSplit(splitId: string): TrafficSplit | undefined {
    return this.splits.get(splitId);
  }

  /**
   * Get all traffic splits
   */
  getAllSplits(): TrafficSplit[] {
    return Array.from(this.splits.values());
  }

  /**
   * Update traffic split
   */
  updateSplit(splitId: string, updates: Partial<TrafficSplit>): TrafficSplit {
    const split = this.splits.get(splitId);
    if (!split) {
      throw new Error(`Traffic split not found: ${splitId}`);
    }

    // Validate weight changes
    if (updates.buckets) {
      const totalWeight = updates.buckets.reduce((sum, b) => sum + b.weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        throw new Error(`Bucket weights must sum to 1.0, got ${totalWeight}`);
      }
    }

    const updated: TrafficSplit = {
      ...split,
      ...updates,
    };

    this.splits.set(splitId, updated);

    this.logger.info('Updated traffic split', { splitId });

    return updated;
  }

  /**
   * Split traffic for a user
   */
  split(splitId: string, userId: string, context?: Record<string, any>): SplitResult | null {
    const split = this.splits.get(splitId);
    if (!split) {
      this.logger.warn('Traffic split not found', { splitId });
      return null;
    }

    if (!split.enabled) {
      this.logger.debug('Traffic split disabled', { splitId });
      return null;
    }

    // Check for existing session
    if (split.stickySession) {
      const sessionKey = `${userId}:${splitId}`;
      const existingResult = this.sessions.get(sessionKey);
      if (existingResult) {
        this.logger.debug('Using existing session', { splitId, userId, bucketId: existingResult.bucketId });
        return existingResult;
      }
    }

    // Select bucket based on algorithm
    let bucket: TrafficBucket | null = null;

    switch (split.algorithm) {
      case 'consistent-hash':
        bucket = this.selectBucketConsistentHash(split.buckets, userId);
        break;
      case 'weighted-random':
        bucket = this.selectBucketWeightedRandom(split.buckets);
        break;
      case 'round-robin':
        bucket = this.selectBucketRoundRobin(split.id, split.buckets);
        break;
      case 'sticky-session':
        bucket = this.selectBucketConsistentHash(split.buckets, userId);
        break;
      default:
        this.logger.error('Unknown split algorithm', undefined, { algorithm: split.algorithm });
        return null;
    }

    if (!bucket) {
      this.logger.warn('No bucket selected', { splitId, userId });
      return null;
    }

    const result: SplitResult = {
      splitId,
      bucketId: bucket.id,
      bucketName: bucket.name,
      algorithm: split.algorithm,
      userId,
      timestamp: Date.now(),
    };

    // Store session if sticky
    if (split.stickySession) {
      const sessionKey = `${userId}:${splitId}`;
      this.sessions.set(sessionKey, result);
    }

    this.logger.debug('Split traffic', {
      splitId,
      userId,
      bucketId: bucket.id,
      algorithm: split.algorithm,
    });

    this.metrics.increment('traffic_split_total', 1, {
      splitId,
      bucketId: bucket.id,
      algorithm: split.algorithm,
    });

    return result;
  }

  /**
   * Select bucket using consistent hashing
   */
  private selectBucketConsistentHash(buckets: TrafficBucket[], userId: string): TrafficBucket | null {
    const enabledBuckets = buckets.filter(b => b.enabled);
    if (enabledBuckets.length === 0) {
      return null;
    }

    // Use consistent hashing for stable assignment
    const hash = this.hashString(userId);
    const random = (hash % 10000) / 10000; // 0-1

    let cumulative = 0;
    for (const bucket of enabledBuckets) {
      cumulative += bucket.weight;
      if (random < cumulative) {
        return bucket;
      }
    }

    // Fallback to last bucket
    return enabledBuckets[enabledBuckets.length - 1];
  }

  /**
   * Select bucket using weighted random
   */
  private selectBucketWeightedRandom(buckets: TrafficBucket[]): TrafficBucket | null {
    const enabledBuckets = buckets.filter(b => b.enabled);
    if (enabledBuckets.length === 0) {
      return null;
    }

    const random = Math.random();
    let cumulative = 0;

    for (const bucket of enabledBuckets) {
      cumulative += bucket.weight;
      if (random < cumulative) {
        return bucket;
      }
    }

    // Fallback to last bucket
    return enabledBuckets[enabledBuckets.length - 1];
  }

  /**
   * Select bucket using round-robin
   */
  private selectBucketRoundRobin(splitId: string, buckets: TrafficBucket[]): TrafficBucket | null {
    const enabledBuckets = buckets.filter(b => b.enabled);
    if (enabledBuckets.length === 0) {
      return null;
    }

    // Get current counter
    const counter = this.roundRobinCounters.get(splitId) || 0;
    
    // Select bucket
    const index = counter % enabledBuckets.length;
    const bucket = enabledBuckets[index];

    // Increment counter
    this.roundRobinCounters.set(splitId, counter + 1);

    return bucket;
  }

  /**
   * Simple string hash function (FNV-1a)
   */
  private hashString(str: string): number {
    let hash = 2166136261; // FNV offset basis
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash *= 16777619; // FNV prime
      hash = hash >>> 0; // Convert to unsigned 32-bit
    }
    
    return hash;
  }

  /**
   * Clear session for a user
   */
  clearSession(userId: string, splitId?: string): void {
    if (splitId) {
      const sessionKey = `${userId}:${splitId}`;
      this.sessions.delete(sessionKey);
      this.logger.debug('Cleared session', { userId, splitId });
    } else {
      // Clear all sessions for user
      const keysToDelete: string[] = [];
      for (const key of this.sessions.keys()) {
        if (key.startsWith(`${userId}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.sessions.delete(key);
      }
      this.logger.debug('Cleared all sessions for user', { userId, count: keysToDelete.length });
    }
  }

  /**
   * Get bucket distribution statistics
   */
  getBucketDistribution(splitId: string, sampleSize: number = 10000): Record<string, number> {
    const split = this.splits.get(splitId);
    if (!split) {
      throw new Error(`Traffic split not found: ${splitId}`);
    }

    const distribution: Record<string, number> = {};
    
    // Initialize counters
    for (const bucket of split.buckets) {
      distribution[bucket.id] = 0;
    }

    // Simulate traffic
    for (let i = 0; i < sampleSize; i++) {
      const userId = `test-user-${i}`;
      const result = this.split(splitId, userId);
      if (result) {
        distribution[result.bucketId]++;
      }
    }

    // Convert to percentages
    for (const bucketId in distribution) {
      distribution[bucketId] = (distribution[bucketId] / sampleSize) * 100;
    }

    return distribution;
  }

  /**
   * Get traffic split statistics
   */
  getStats(): {
    totalSplits: number;
    enabledSplits: number;
    totalSessions: number;
  } {
    const splits = this.getAllSplits();
    
    return {
      totalSplits: splits.length,
      enabledSplits: splits.filter(s => s.enabled).length,
      totalSessions: this.sessions.size,
    };
  }

  /**
   * Cleanup old sessions
   */
  cleanupSessions(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, result] of this.sessions.entries()) {
      if (now - result.timestamp > maxAge) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.sessions.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.logger.info('Cleaned up old sessions', { count: keysToDelete.length });
    }
  }
}

