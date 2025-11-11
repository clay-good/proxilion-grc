/**
 * Cache Manager
 * 
 * Implements intelligent caching for AI requests with:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Memory-aware limits
 * - Cache key generation
 * - Hit/miss tracking
 */

import { UnifiedAIRequest, ProxilionResponse } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { generateCacheKey } from '../utils/hash.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface CacheEntry {
  key: string;
  value: ProxilionResponse | Buffer; // Can be compressed
  timestamp: number;
  ttl: number;
  size: number;
  hits: number;
  lastAccessed: number;
  compressed: boolean;
}

interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in milliseconds
  enableCompression: boolean;
  evictionPolicy: 'LRU' | 'LFU' | 'FIFO';
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  currentEntries: number;
  hitRate: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry>;
  private config: CacheConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB default
      maxEntries: config.maxEntries || 10000,
      defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minutes
      enableCompression: config.enableCompression ?? false,
      evictionPolicy: config.evictionPolicy || 'LRU',
    };

    this.cache = new Map();
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      currentEntries: 0,
      hitRate: 0,
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Generate cache key from request
   */
  private generateKey(request: UnifiedAIRequest): string {
    return generateCacheKey(request);
  }

  /**
   * Estimate size of cache entry in bytes
   */
  private estimateSize(response: ProxilionResponse): number {
    const str = JSON.stringify(response);
    return str.length * 2; // Approximate UTF-16 encoding
  }

  /**
   * Check if request is cacheable
   */
  private isCacheable(request: UnifiedAIRequest): boolean {
    // Don't cache streaming requests
    if (request.streaming) {
      return false;
    }

    // Don't cache requests with high temperature (non-deterministic)
    if (request.parameters.temperature && request.parameters.temperature > 0.3) {
      return false;
    }

    // Don't cache if explicitly disabled
    if (request.metadata.cacheDisabled) {
      return false;
    }

    return true;
  }

  /**
   * Get cached response
   */
  async get(request: UnifiedAIRequest): Promise<ProxilionResponse | null> {
    if (!this.isCacheable(request)) {
      return null;
    }

    const key = this.generateKey(request);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.metrics.increment('cache_miss_total');
      this.updateHitRate();
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.currentSize -= entry.size;
      this.stats.currentEntries--;
      this.stats.misses++;
      this.metrics.increment('cache_miss_total');
      this.metrics.increment('cache_expiration_total');
      this.updateHitRate();
      return null;
    }

    // Update access time and hit count
    entry.lastAccessed = now;
    entry.hits++;

    this.stats.hits++;
    this.metrics.increment('cache_hit_total');
    this.updateHitRate();

    this.logger.debug('Cache hit', { key, hits: entry.hits });

    // Decompress if needed
    if (entry.compressed && Buffer.isBuffer(entry.value)) {
      const decompressed = await gunzipAsync(entry.value);
      return JSON.parse(decompressed.toString('utf-8'));
    }

    return entry.value as ProxilionResponse;
  }

  /**
   * Store response in cache
   */
  async set(
    request: UnifiedAIRequest,
    response: ProxilionResponse,
    ttl?: number
  ): Promise<void> {
    if (!this.isCacheable(request)) {
      return;
    }

    const key = this.generateKey(request);
    const now = Date.now();

    // Compress if enabled
    let value: ProxilionResponse | Buffer = response;
    let compressed = false;
    let size = this.estimateSize(response);

    if (this.config.enableCompression) {
      const json = JSON.stringify(response);
      const buffer = Buffer.from(json, 'utf-8');

      // Only compress if size is significant (> 1KB)
      if (buffer.length > 1024) {
        const compressedBuffer = await gzipAsync(buffer);

        // Only use compression if it actually reduces size
        if (compressedBuffer.length < buffer.length) {
          value = compressedBuffer;
          compressed = true;
          size = compressedBuffer.length;
          this.metrics.increment('cache_compression_total');
          this.logger.debug('Cache entry compressed', {
            key,
            originalSize: buffer.length,
            compressedSize: size,
            ratio: (size / buffer.length).toFixed(2),
          });
        }
      }
    }

    // Check if we need to evict entries
    await this.evictIfNeeded(size);

    const entry: CacheEntry = {
      key,
      value,
      timestamp: now,
      ttl: ttl || this.config.defaultTTL,
      size,
      hits: 0,
      lastAccessed: now,
      compressed,
    };

    this.cache.set(key, entry);
    this.stats.currentSize += size;
    this.stats.currentEntries++;

    this.metrics.gauge('cache_size_bytes', this.stats.currentSize);
    this.metrics.gauge('cache_entries_total', this.stats.currentEntries);

    this.logger.debug('Cache set', { key, size, ttl: entry.ttl, compressed });
  }

  /**
   * Evict entries if needed
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    // Check if we need to evict based on size
    while (
      this.stats.currentSize + newEntrySize > this.config.maxSize ||
      this.stats.currentEntries >= this.config.maxEntries
    ) {
      const evicted = await this.evictOne();
      if (!evicted) {
        break; // No more entries to evict
      }
    }
  }

  /**
   * Evict one entry based on policy
   */
  private async evictOne(): Promise<boolean> {
    if (this.cache.size === 0) {
      return false;
    }

    let keyToEvict: string | null = null;

    switch (this.config.evictionPolicy) {
      case 'LRU': {
        // Evict least recently used
        let oldestTime = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.lastAccessed < oldestTime) {
            oldestTime = entry.lastAccessed;
            keyToEvict = key;
          }
        }
        break;
      }

      case 'LFU': {
        // Evict least frequently used
        let lowestHits = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.hits < lowestHits) {
            lowestHits = entry.hits;
            keyToEvict = key;
          }
        }
        break;
      }

      case 'FIFO': {
        // Evict first in (oldest timestamp)
        let oldestTime = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            keyToEvict = key;
          }
        }
        break;
      }
    }

    if (keyToEvict) {
      const entry = this.cache.get(keyToEvict)!;
      this.cache.delete(keyToEvict);
      this.stats.currentSize -= entry.size;
      this.stats.currentEntries--;
      this.stats.evictions++;
      this.metrics.increment('cache_eviction_total');
      this.logger.debug('Cache eviction', { key: keyToEvict, policy: this.config.evictionPolicy });
      return true;
    }

    return false;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.currentSize = 0;
    this.stats.currentEntries = 0;
    this.logger.info('Cache cleared');
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.stats.currentSize -= entry.size;
        this.stats.currentEntries--;
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Cache cleanup', { removed });
      this.metrics.gauge('cache_size_bytes', this.stats.currentSize);
      this.metrics.gauge('cache_entries_total', this.stats.currentEntries);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    this.metrics.gauge('cache_hit_rate', this.stats.hitRate);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Stop the cache manager and cleanup resources
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.logger.info('Cache manager stopped');
  }
}

