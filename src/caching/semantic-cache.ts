/**
 * Semantic Cache
 * 
 * Advanced caching with embedding-based similarity matching.
 * Enables intelligent cache hits for semantically similar prompts.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface SemanticCacheConfig {
  similarityThreshold: number; // 0-1, higher = more strict matching
  maxCacheSize: number;
  ttl: number; // Time to live in milliseconds
  embeddingDimensions: number; // Embedding vector size
  enableCacheWarming?: boolean;
}

export interface CacheEntry {
  id: string;
  prompt: string;
  embedding: number[];
  response: any;
  metadata: {
    model: string;
    provider: string;
    userId?: string;
    organizationId?: string;
    temperature?: number;
    maxTokens?: number;
  };
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

export interface CacheHit {
  found: boolean;
  entry?: CacheEntry;
  similarity?: number;
  latencySaved: number; // Estimated latency saved in ms
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  averageSimilarity: number;
  totalLatencySaved: number; // Total latency saved in ms
  cacheSize: number;
  oldestEntry: number;
  newestEntry: number;
}

export class SemanticCache {
  private cache: Map<string, CacheEntry>;
  private config: SemanticCacheConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private stats: {
    hits: number;
    misses: number;
    totalSimilarity: number;
    similarityCount: number;
    totalLatencySaved: number;
  };

  constructor(config: SemanticCacheConfig) {
    this.cache = new Map();
    this.config = config;
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.stats = {
      hits: 0,
      misses: 0,
      totalSimilarity: 0,
      similarityCount: 0,
      totalLatencySaved: 0,
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get cached response for a prompt
   */
  async get(
    prompt: string,
    embedding: number[],
    metadata: {
      model: string;
      provider: string;
      userId?: string;
      organizationId?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<CacheHit> {
    const startTime = Date.now();

    try {
      // Find most similar entry
      let bestMatch: CacheEntry | undefined;
      let bestSimilarity = 0;

      for (const entry of this.cache.values()) {
        // Check if entry is expired
        if (Date.now() > entry.expiresAt) {
          continue;
        }

        // Check if metadata matches
        if (!this.metadataMatches(entry.metadata, metadata)) {
          continue;
        }

        // Calculate similarity
        const similarity = this.cosineSimilarity(embedding, entry.embedding);

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      // Check if similarity meets threshold
      if (bestMatch && bestSimilarity >= this.config.similarityThreshold) {
        // Cache hit!
        bestMatch.hits++;
        bestMatch.lastAccessedAt = Date.now();

        this.stats.hits++;
        this.stats.totalSimilarity += bestSimilarity;
        this.stats.similarityCount++;

        // Estimate latency saved (typical LLM API call: 500-2000ms)
        const latencySaved = 1000;
        this.stats.totalLatencySaved += latencySaved;

        const duration = Date.now() - startTime;
        this.metrics.histogram('semantic_cache_lookup_duration_ms', duration);
        this.metrics.increment('semantic_cache_hit_total', 1, {
          model: metadata.model,
          provider: metadata.provider,
        });
        this.metrics.histogram('semantic_cache_similarity', bestSimilarity);

        this.logger.info('Semantic cache hit', {
          entryId: bestMatch.id,
          similarity: bestSimilarity,
          hits: bestMatch.hits,
          latencySaved,
        });

        return {
          found: true,
          entry: bestMatch,
          similarity: bestSimilarity,
          latencySaved,
        };
      }

      // Cache miss
      this.stats.misses++;

      const duration = Date.now() - startTime;
      this.metrics.histogram('semantic_cache_lookup_duration_ms', duration);
      this.metrics.increment('semantic_cache_miss_total', 1, {
        model: metadata.model,
        provider: metadata.provider,
      });

      this.logger.debug('Semantic cache miss', {
        prompt: prompt.substring(0, 100),
        bestSimilarity,
      });

      return {
        found: false,
        latencySaved: 0,
      };
    } catch (error) {
      this.logger.error('Semantic cache lookup failed', error instanceof Error ? error : undefined);
      this.metrics.increment('semantic_cache_error_total');

      return {
        found: false,
        latencySaved: 0,
      };
    }
  }

  /**
   * Store response in cache
   */
  async set(
    prompt: string,
    embedding: number[],
    response: any,
    metadata: {
      model: string;
      provider: string;
      userId?: string;
      organizationId?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<void> {
    try {
      // Check cache size limit BEFORE adding
      while (this.cache.size >= this.config.maxCacheSize) {
        this.evictLRU();
      }

      const entry: CacheEntry = {
        id: this.generateId(),
        prompt,
        embedding,
        response,
        metadata,
        hits: 0,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
      };

      this.cache.set(entry.id, entry);

      this.metrics.increment('semantic_cache_set_total', 1, {
        model: metadata.model,
        provider: metadata.provider,
      });

      this.logger.debug('Cached response', {
        entryId: entry.id,
        promptLength: prompt.length,
      });
    } catch (error) {
      this.logger.error('Failed to cache response', error instanceof Error ? error : undefined);
      this.metrics.increment('semantic_cache_error_total');
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Check if metadata matches
   */
  private metadataMatches(
    entryMetadata: CacheEntry['metadata'],
    queryMetadata: CacheEntry['metadata']
  ): boolean {
    // Model and provider must match exactly
    if (entryMetadata.model !== queryMetadata.model) {
      return false;
    }

    if (entryMetadata.provider !== queryMetadata.provider) {
      return false;
    }

    // Temperature must be close (within 0.1)
    if (entryMetadata.temperature !== undefined && queryMetadata.temperature !== undefined) {
      if (Math.abs(entryMetadata.temperature - queryMetadata.temperature) > 0.1) {
        return false;
      }
    }

    // Organization must match if specified
    if (entryMetadata.organizationId && queryMetadata.organizationId) {
      if (entryMetadata.organizationId !== queryMetadata.organizationId) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestEntry: CacheEntry | undefined;
    let oldestTime = Date.now();

    for (const entry of this.cache.values()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestEntry = entry;
      }
    }

    if (oldestEntry) {
      this.cache.delete(oldestEntry.id);
      this.metrics.increment('semantic_cache_eviction_total');
      this.logger.debug('Evicted LRU entry', { entryId: oldestEntry.id });
    }
  }

  /**
   * Start cleanup interval to remove expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.metrics.increment('semantic_cache_cleanup_total', 1, { count: removed.toString() });
      this.logger.debug('Cleaned up expired entries', { removed });
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `cache_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());

    return {
      totalEntries: this.cache.size,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      averageSimilarity: this.stats.similarityCount > 0
        ? this.stats.totalSimilarity / this.stats.similarityCount
        : 0,
      totalLatencySaved: this.stats.totalLatencySaved,
      cacheSize: this.cache.size,
      oldestEntry: entries.length > 0
        ? Math.min(...entries.map(e => e.createdAt))
        : 0,
      newestEntry: entries.length > 0
        ? Math.max(...entries.map(e => e.createdAt))
        : 0,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
    this.metrics.increment('semantic_cache_clear_total');
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

