# Proxilion Performance Guide

This guide covers performance optimization features, best practices, and tuning recommendations for Proxilion.

## Table of Contents

1. [Performance Features](#performance-features)
2. [Caching](#caching)
3. [Request Deduplication](#request-deduplication)
4. [Rate Limiting](#rate-limiting)
5. [Response Processing](#response-processing)
6. [Performance Tuning](#performance-tuning)
7. [Monitoring](#monitoring)
8. [Benchmarks](#benchmarks)

## Performance Features

Proxilion includes several performance optimization features:

- **Intelligent Caching**: LRU/LFU/FIFO cache with TTL support
- **Request Deduplication**: Prevents duplicate concurrent requests
- **Rate Limiting**: Multiple algorithms (Token Bucket, Sliding Window, Fixed Window, Leaky Bucket)
- **Connection Pooling**: Reuses connections to AI services
- **Circuit Breakers**: Prevents cascade failures
- **Parallel Scanning**: Runs security scanners concurrently
- **Streaming Support**: Handles large responses efficiently

## Caching

### Overview

The cache manager stores AI service responses to reduce latency and costs.

### Configuration

```typescript
const cacheManager = new CacheManager({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxEntries: 10000,           // Maximum number of entries
  defaultTTL: 5 * 60 * 1000,   // 5 minutes
  evictionPolicy: 'LRU',       // LRU, LFU, or FIFO
});
```

### Caching Rules

Requests are cached if:
- ✅ Not streaming
- ✅ Temperature ≤ 0.3 (deterministic)
- ✅ Cache not explicitly disabled
- ✅ Response status is 200

### Cache Key Generation

Cache keys are generated from:
- Provider (OpenAI, Anthropic, etc.)
- Model name
- Messages
- Parameters (temperature, maxTokens, topP, topK)
- Tools/functions

### Eviction Policies

#### LRU (Least Recently Used)
Evicts entries that haven't been accessed recently.

**Best for**: General-purpose caching

```typescript
evictionPolicy: 'LRU'
```

#### LFU (Least Frequently Used)
Evicts entries with the lowest access count.

**Best for**: Workloads with hot/cold data patterns

```typescript
evictionPolicy: 'LFU'
```

#### FIFO (First In, First Out)
Evicts oldest entries first.

**Best for**: Time-sensitive data

```typescript
evictionPolicy: 'FIFO'
```

### Cache Statistics

```typescript
const stats = cacheManager.getStats();
console.log({
  hits: stats.hits,
  misses: stats.misses,
  hitRate: stats.hitRate,
  currentEntries: stats.currentEntries,
  currentSize: stats.currentSize,
  evictions: stats.evictions,
});
```

### Cache Management

```typescript
// Clear all cache
cacheManager.clear();

// Stop cleanup interval
cacheManager.stop();
```

## Request Deduplication

### Overview

Request deduplication prevents multiple identical concurrent requests from hitting AI services.

### How It Works

1. First request starts execution
2. Subsequent identical requests wait for the first
3. All requests receive the same response
4. Reduces load on AI services by N-1 requests

### Configuration

```typescript
const deduplicator = new RequestDeduplicator(30000); // 30 second timeout
```

### Usage

```typescript
const response = await deduplicator.execute(unifiedRequest, async () => {
  return await requestHandler.handleRequest(proxilionRequest);
});
```

### Benefits

- **Reduced Costs**: Fewer API calls to AI services
- **Lower Latency**: Waiting requests get instant response
- **Better Resource Usage**: Less CPU/memory/network

### Metrics

```typescript
const pendingCount = deduplicator.getPendingCount();
```

## Rate Limiting

### Overview

Rate limiting controls request rates per user/application/IP.

### Algorithms

#### Token Bucket (Recommended)

Allows bursts while maintaining average rate.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  maxRequests: 100,      // Average rate
  windowMs: 60000,       // 1 minute
  burstSize: 150,        // Allow bursts up to 150
});
```

**Best for**: Most use cases, allows natural traffic bursts

#### Sliding Window

Precise rate limiting with sliding time window.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  maxRequests: 100,
  windowMs: 60000,
});
```

**Best for**: Strict rate limiting requirements

#### Fixed Window

Simple rate limiting with fixed time windows.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'fixed-window',
  maxRequests: 100,
  windowMs: 60000,
});
```

**Best for**: Simple use cases, lowest overhead

#### Leaky Bucket

Queue-based rate limiting with constant output rate.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'leaky-bucket',
  maxRequests: 100,
  windowMs: 60000,
});
```

**Best for**: Smoothing traffic spikes

### Usage

```typescript
const result = await rateLimiter.checkLimit('user:123');

if (!result.allowed) {
  return {
    error: 'Rate limit exceeded',
    retryAfter: result.retryAfter,
    resetAt: result.resetAt,
  };
}
```

### Rate Limit Keys

Common key patterns:
- `user:{userId}` - Per user
- `app:{appId}` - Per application
- `ip:{ipAddress}` - Per IP address
- `tenant:{tenantId}` - Per tenant (multi-tenancy)

### Management

```typescript
// Reset specific key
rateLimiter.reset('user:123');

// Clear all limits
rateLimiter.clear();

// Cleanup old entries
rateLimiter.cleanup();
```

## Response Processing

### Overview

Response processor scans and transforms AI service responses.

### Features

- **PII Redaction**: Automatically redacts PII in responses
- **Content Filtering**: Filters inappropriate content
- **Response Validation**: Validates response structure

### Configuration

```typescript
const responseProcessor = new ResponseProcessor({
  enablePIIRedaction: true,
  enableContentFiltering: true,
  enableValidation: true,
  redactionPlaceholder: '[REDACTED]',
});
```

### Usage

```typescript
const processed = await responseProcessor.process(response);

console.log({
  modified: processed.modified,
  redactions: processed.redactions,
  scanResults: processed.scanResults,
});
```

### Streaming Support

```typescript
const processedChunk = await responseProcessor.processStreamChunk(chunk);
```

## Performance Tuning

### Latency Optimization

**Target**: < 100ms overhead

1. **Enable Parallel Scanning**
```typescript
const scannerOrchestrator = new ScannerOrchestrator({
  enableParallelScanning: true,
  scanTimeout: 10000,
});
```

2. **Optimize Cache Size**
```typescript
// Larger cache = better hit rate but more memory
maxSize: 200 * 1024 * 1024, // 200MB
maxEntries: 20000,
```

3. **Tune Connection Pool**
```typescript
const connectionPool = new ConnectionPool({
  maxConnections: 200,  // Increase for high throughput
  maxIdleTime: 30000,   // Reduce for faster cleanup
});
```

### Throughput Optimization

**Target**: 1,000+ req/s per instance

1. **Increase Circuit Breaker Thresholds**
```typescript
failureThreshold: 10,  // Allow more failures before opening
timeout: 30000,        // Shorter timeout for faster recovery
```

2. **Optimize Scanner Timeouts**
```typescript
scanTimeout: 5000,  // Reduce for faster failures
```

3. **Use Token Bucket Rate Limiting**
```typescript
algorithm: 'token-bucket',  // Lowest overhead
```

### Memory Optimization

**Target**: < 128MB (Cloudflare Workers limit)

1. **Limit Cache Size**
```typescript
maxSize: 50 * 1024 * 1024,  // 50MB
maxEntries: 5000,
```

2. **Enable Aggressive Cleanup**
```typescript
// Cleanup runs every minute by default
// For memory-constrained environments, run more frequently
```

3. **Use Streaming for Large Responses**
```typescript
streaming: true,  // Don't buffer entire response
```

## Monitoring

### Key Metrics

```typescript
// Cache performance
cache_hit_rate
cache_hit_total
cache_miss_total
cache_eviction_total
cache_size_bytes
cache_entries_total

// Deduplication
request_deduplicated_total
deduplicated_request_saved_total
pending_deduplicated_requests

// Rate limiting
rate_limit_allowed_total
rate_limit_rejected_total

// Response processing
response_processing_duration_ms
response_pii_redacted_total
```

### Health Checks

```typescript
const health = await healthChecker.checkHealth();

console.log({
  status: health.status,
  memoryUsage: health.metrics.memoryUsage,
  requestRate: health.metrics.requestRate,
  errorRate: health.metrics.errorRate,
});
```

## Benchmarks

### Latency Breakdown

Typical request latency (p50):
- Network: 10-20ms
- Parsing: 5-10ms
- Scanning: 50-70ms
- Policy: 5-10ms
- Overhead: 10-20ms
- **Total**: 80-130ms

### Cache Performance

With 80% cache hit rate:
- Cached requests: 10-20ms
- Uncached requests: 80-130ms
- **Average**: 24-46ms

### Deduplication Savings

For 10 concurrent identical requests:
- Without dedup: 10 API calls
- With dedup: 1 API call
- **Savings**: 90%

### Rate Limiting Overhead

- Token Bucket: < 1ms
- Sliding Window: < 2ms
- Fixed Window: < 1ms
- Leaky Bucket: < 2ms

## Best Practices

1. **Enable Caching** for deterministic requests (low temperature)
2. **Use Deduplication** for high-traffic applications
3. **Implement Rate Limiting** per user/application
4. **Monitor Cache Hit Rate** and adjust size accordingly
5. **Use Parallel Scanning** for better latency
6. **Enable Response Processing** for PII protection
7. **Set Appropriate Timeouts** based on your SLA
8. **Monitor Memory Usage** especially on edge platforms
9. **Use Health Checks** for proactive monitoring
10. **Tune Based on Metrics** - measure, optimize, repeat

