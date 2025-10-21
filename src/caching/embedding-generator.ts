/**
 * Embedding Generator
 * 
 * Generates embeddings for semantic caching.
 * In production, this would use a real embedding model (OpenAI, Cohere, etc.)
 * For now, we use a simple hash-based approach for testing.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface EmbeddingConfig {
  dimensions: number;
  provider?: 'simple' | 'openai' | 'cohere'; // Future: support real embedding APIs
  model?: string;
}

export class EmbeddingGenerator {
  private config: EmbeddingConfig;
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Generate embedding for text
   */
  async generate(text: string): Promise<number[]> {
    const startTime = Date.now();

    try {
      let embedding: number[];

      if (this.config.provider === 'simple' || !this.config.provider) {
        embedding = this.generateSimpleEmbedding(text);
      } else {
        // Future: Call real embedding API
        throw new Error(`Embedding provider not implemented: ${this.config.provider}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('embedding_generation_duration_ms', duration);
      this.metrics.increment('embedding_generation_total', 1, {
        provider: this.config.provider || 'simple',
      });

      return embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding', error instanceof Error ? error : undefined);
      this.metrics.increment('embedding_generation_failed_total');
      throw error;
    }
  }

  /**
   * Generate simple embedding based on text features
   * This is a placeholder for testing - in production use real embeddings
   */
  private generateSimpleEmbedding(text: string): number[] {
    const embedding = new Array(this.config.dimensions).fill(0);

    // Normalize text
    const normalized = text.toLowerCase().trim();

    // Feature 1: Character frequency
    const charFreq = new Map<string, number>();
    for (const char of normalized) {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }

    // Feature 2: Word frequency
    const words = normalized.split(/\s+/);
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // Feature 3: N-grams
    const bigrams = new Set<string>();
    for (let i = 0; i < normalized.length - 1; i++) {
      bigrams.add(normalized.substring(i, i + 2));
    }

    // Populate embedding vector with features
    let idx = 0;

    // Add character frequency features
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 ';
    for (const char of chars) {
      if (idx >= this.config.dimensions) break;
      embedding[idx++] = (charFreq.get(char) || 0) / normalized.length;
    }

    // Add length features
    if (idx < this.config.dimensions) {
      embedding[idx++] = Math.min(normalized.length / 1000, 1); // Normalized length
    }

    if (idx < this.config.dimensions) {
      embedding[idx++] = Math.min(words.length / 100, 1); // Normalized word count
    }

    // Add bigram features (sample)
    const commonBigrams = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd'];
    for (const bigram of commonBigrams) {
      if (idx >= this.config.dimensions) break;
      embedding[idx++] = bigrams.has(bigram) ? 1 : 0;
    }

    // Fill remaining dimensions with hash-based values
    while (idx < this.config.dimensions) {
      const hash = this.simpleHash(normalized + idx.toString());
      embedding[idx++] = (hash % 1000) / 1000;
    }

    // Normalize the embedding vector
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Batch generate embeddings
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generate(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.config.dimensions;
  }
}

/**
 * Cache Warmer
 * 
 * Pre-populates semantic cache with common prompts
 */
export interface CacheWarmingConfig {
  commonPrompts: string[];
  enabled: boolean;
}

export class CacheWarmer {
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Warm cache with common prompts
   */
  async warm(
    prompts: string[],
    embeddingGenerator: EmbeddingGenerator,
    cacheCallback: (prompt: string, embedding: number[]) => Promise<void>
  ): Promise<void> {
    this.logger.info('Starting cache warming', { promptCount: prompts.length });

    let warmed = 0;
    let failed = 0;

    for (const prompt of prompts) {
      try {
        const embedding = await embeddingGenerator.generate(prompt);
        await cacheCallback(prompt, embedding);
        warmed++;
      } catch (error) {
        this.logger.error('Failed to warm cache for prompt', error instanceof Error ? error : undefined, { prompt: prompt.substring(0, 50) });
        failed++;
      }
    }

    this.metrics.increment('cache_warming_completed_total', 1, {
      warmed: warmed.toString(),
      failed: failed.toString(),
    });

    this.logger.info('Cache warming completed', { warmed, failed });
  }

  /**
   * Get common prompts for a domain
   */
  getCommonPrompts(domain: 'general' | 'code' | 'writing' | 'analysis'): string[] {
    const prompts: Record<string, string[]> = {
      general: [
        'What is the weather like today?',
        'Tell me a joke',
        'Explain quantum computing',
        'What is artificial intelligence?',
        'How do I learn programming?',
      ],
      code: [
        'Write a function to sort an array',
        'Explain how async/await works',
        'What is a closure in JavaScript?',
        'How do I connect to a database?',
        'Write a REST API endpoint',
      ],
      writing: [
        'Write a professional email',
        'Summarize this article',
        'Proofread this text',
        'Write a blog post introduction',
        'Create a product description',
      ],
      analysis: [
        'Analyze this data',
        'What are the trends?',
        'Summarize the key findings',
        'Compare these options',
        'What are the pros and cons?',
      ],
    };

    return prompts[domain] || prompts.general;
  }
}

