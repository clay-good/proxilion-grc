/**
 * Hash Utilities
 *
 * Provides optimized, cryptographically-sound hashing functions
 * for cache keys, deduplication, and request identification
 */

import { UnifiedAIRequest } from '../types/index.js';
import { createHash } from 'crypto';

/**
 * Generate a fast, stable hash from a request
 * Uses SHA-256 for better distribution and collision resistance
 */
export function hashRequest(request: UnifiedAIRequest): string {
  const keyData = {
    provider: request.provider,
    model: request.model,
    messages: request.messages,
    parameters: {
      temperature: request.parameters.temperature,
      maxTokens: request.parameters.maxTokens,
      topP: request.parameters.topP,
      topK: request.parameters.topK,
    },
    tools: request.tools,
  };

  return hashObject(keyData);
}

/**
 * Generate cache key from request
 */
export function generateCacheKey(request: UnifiedAIRequest): string {
  const hash = hashRequest(request);
  return `cache:${request.provider}:${request.model}:${hash}`;
}

/**
 * Generate deduplication key from request
 */
export function generateDeduplicationKey(request: UnifiedAIRequest): string {
  const hash = hashRequest(request);
  return `dedup:${request.provider}:${request.model}:${hash}`;
}

/**
 * Hash any object to a stable string
 */
export function hashObject(obj: any): string {
  const str = JSON.stringify(obj);
  return hashString(str);
}

/**
 * Hash a string using SHA-256 (fast and collision-resistant)
 */
export function hashString(str: string): string {
  const hash = createHash('sha256');
  hash.update(str);
  return hash.digest('base64url').substring(0, 16); // Use first 16 chars for compact keys
}

/**
 * Fast hash for non-cryptographic use cases
 * Uses FNV-1a algorithm (better than DJB2)
 */
export function fastHash(str: string): string {
  let hash = 2166136261; // FNV offset basis

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(36);
}
