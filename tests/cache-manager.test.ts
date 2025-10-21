/**
 * Cache Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheManager } from '../src/cache/cache-manager.js';
import { UnifiedAIRequest, ProxilionResponse, AIServiceProvider } from '../src/types/index.js';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      maxSize: 1024 * 1024, // 1MB
      maxEntries: 100,
      defaultTTL: 5000, // 5 seconds
      evictionPolicy: 'LRU',
    });
  });

  afterEach(() => {
    cacheManager.stop();
  });

  const createTestRequest = (content: string, temperature: number = 0): UnifiedAIRequest => ({
    provider: AIServiceProvider.OPENAI,
    model: 'gpt-4',
    messages: [{ role: 'user', content }],
    parameters: { temperature },
    streaming: false,
    metadata: {
      requestId: 'test-request',
      timestamp: Date.now(),
    },
  });

  const createTestResponse = (content: string): ProxilionResponse => ({
    status: 200,
    body: JSON.stringify({ choices: [{ message: { content } }] }),
    headers: {},
  });

  it('should cache and retrieve responses', async () => {
    const request = createTestRequest('Hello');
    const response = createTestResponse('Hi there!');

    await cacheManager.set(request, response);
    const cached = await cacheManager.get(request);

    expect(cached).toEqual(response);
  });

  it('should return null for cache miss', async () => {
    const request = createTestRequest('Hello');
    const cached = await cacheManager.get(request);

    expect(cached).toBeNull();
  });

  it('should not cache streaming requests', async () => {
    const request = createTestRequest('Hello');
    request.streaming = true;
    const response = createTestResponse('Hi there!');

    await cacheManager.set(request, response);
    const cached = await cacheManager.get(request);

    expect(cached).toBeNull();
  });

  it('should not cache high temperature requests', async () => {
    const request = createTestRequest('Hello', 0.8);
    const response = createTestResponse('Hi there!');

    await cacheManager.set(request, response);
    const cached = await cacheManager.get(request);

    expect(cached).toBeNull();
  });

  it('should expire cached entries after TTL', async () => {
    const request = createTestRequest('Hello');
    const response = createTestResponse('Hi there!');

    await cacheManager.set(request, response, 100); // 100ms TTL

    // Should be cached immediately
    let cached = await cacheManager.get(request);
    expect(cached).toEqual(response);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be expired
    cached = await cacheManager.get(request);
    expect(cached).toBeNull();
  });

  it('should track cache statistics', async () => {
    const request1 = createTestRequest('Hello');
    const request2 = createTestRequest('World');
    const response1 = createTestResponse('Hi!');
    const response2 = createTestResponse('Hello!');

    // Set two entries
    await cacheManager.set(request1, response1);
    await cacheManager.set(request2, response2);

    // One hit
    await cacheManager.get(request1);

    // One miss
    await cacheManager.get(createTestRequest('Unknown'));

    const stats = cacheManager.getStats();

    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.currentEntries).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should evict entries when max entries reached', async () => {
    const smallCache = new CacheManager({
      maxSize: 1024 * 1024,
      maxEntries: 3,
      defaultTTL: 60000,
      evictionPolicy: 'LRU',
    });

    // Add 4 entries (should evict 1)
    for (let i = 0; i < 4; i++) {
      const request = createTestRequest(`Message ${i}`);
      const response = createTestResponse(`Response ${i}`);
      await smallCache.set(request, response);
    }

    const stats = smallCache.getStats();
    expect(stats.currentEntries).toBe(3);
    expect(stats.evictions).toBe(1);

    smallCache.stop();
  });

  it('should evict LRU entry when using LRU policy', async () => {
    const lruCache = new CacheManager({
      maxSize: 1024 * 1024,
      maxEntries: 3,
      defaultTTL: 60000,
      evictionPolicy: 'LRU',
    });

    const request1 = createTestRequest('First');
    const request2 = createTestRequest('Second');
    const request3 = createTestRequest('Third');
    const request4 = createTestRequest('Fourth');

    await lruCache.set(request1, createTestResponse('1'));
    await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
    await lruCache.set(request2, createTestResponse('2'));
    await new Promise(resolve => setTimeout(resolve, 10));
    await lruCache.set(request3, createTestResponse('3'));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Access request1 to make it recently used
    await lruCache.get(request1);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Add fourth entry (should evict request2, the LRU)
    await lruCache.set(request4, createTestResponse('4'));

    // request1 should still be cached (was accessed recently)
    expect(await lruCache.get(request1)).not.toBeNull();

    // request2 should be evicted (least recently used)
    expect(await lruCache.get(request2)).toBeNull();

    // request3 and request4 should be cached
    expect(await lruCache.get(request3)).not.toBeNull();
    expect(await lruCache.get(request4)).not.toBeNull();

    lruCache.stop();
  });

  it('should clear all cache entries', async () => {
    const request1 = createTestRequest('Hello');
    const request2 = createTestRequest('World');

    await cacheManager.set(request1, createTestResponse('Hi!'));
    await cacheManager.set(request2, createTestResponse('Hello!'));

    expect(cacheManager.getStats().currentEntries).toBe(2);

    cacheManager.clear();

    expect(cacheManager.getStats().currentEntries).toBe(0);
    expect(await cacheManager.get(request1)).toBeNull();
    expect(await cacheManager.get(request2)).toBeNull();
  });

  it('should generate same key for identical requests', async () => {
    const request1 = createTestRequest('Hello');
    const request2 = createTestRequest('Hello');

    await cacheManager.set(request1, createTestResponse('Hi!'));

    // Should get cached response for identical request
    const cached = await cacheManager.get(request2);
    expect(cached).not.toBeNull();
  });

  it('should generate different keys for different requests', async () => {
    const request1 = createTestRequest('Hello');
    const request2 = createTestRequest('World');

    await cacheManager.set(request1, createTestResponse('Hi!'));

    // Should not get cached response for different request
    const cached = await cacheManager.get(request2);
    expect(cached).toBeNull();
  });

  it('should respect cache disabled flag', async () => {
    const request = createTestRequest('Hello');
    request.metadata.cacheDisabled = true;
    const response = createTestResponse('Hi!');

    await cacheManager.set(request, response);
    const cached = await cacheManager.get(request);

    expect(cached).toBeNull();
  });

  it('should handle large responses', async () => {
    const largeContent = 'x'.repeat(100000); // 100KB
    const request = createTestRequest('Large request');
    const response = createTestResponse(largeContent);

    await cacheManager.set(request, response);
    const cached = await cacheManager.get(request);

    expect(cached).toEqual(response);
    expect(cacheManager.getStats().currentSize).toBeGreaterThan(100000);
  });
});

