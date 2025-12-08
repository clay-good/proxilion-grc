# Rate Limiting API Documentation

This guide covers the rate limiting capabilities of Proxilion GRC, including configuration, algorithms, and API usage.

---

## Overview

Proxilion GRC provides comprehensive rate limiting to protect AI providers from abuse and ensure fair usage across users and tenants. The system supports four different algorithms and hierarchical quotas.

**Key Features:**
- Four rate limiting algorithms
- Per-user and per-tenant quotas
- Automatic cleanup and memory management
- Prometheus metrics integration
- Configurable burst handling

---

## Rate Limiting Algorithms

### Token Bucket (Recommended)

Best for: Allowing bursts while maintaining average rate.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  maxRequests: 100,    // 100 requests per window
  windowMs: 60000,     // 1 minute window
  burstSize: 120,      // Allow bursts up to 120
});
```

**How it works:**
- Tokens are added at a constant rate (`maxRequests / windowMs`)
- Each request consumes one token
- Requests are allowed if tokens are available
- Bursts are allowed up to `burstSize`

**Use cases:**
- API rate limiting with occasional burst traffic
- User-facing endpoints
- Default recommendation for most scenarios

### Sliding Window

Best for: Precise rate limiting without edge-case spikes.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  maxRequests: 100,
  windowMs: 60000,
});
```

**How it works:**
- Tracks exact timestamp of each request
- Counts requests within the sliding time window
- More memory intensive but more accurate

**Use cases:**
- When fixed window boundary issues are unacceptable
- Compliance-driven rate limiting
- When precision is more important than performance

### Fixed Window

Best for: Simple rate limiting with minimal overhead.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'fixed-window',
  maxRequests: 100,
  windowMs: 60000,
});
```

**How it works:**
- Resets counter at fixed intervals
- Simple and memory efficient
- Can allow 2x burst at window boundaries

**Use cases:**
- High-volume endpoints where precision is less critical
- Simple rate limiting requirements
- Maximum performance scenarios

### Leaky Bucket

Best for: Smoothing traffic to a constant rate.

```typescript
const rateLimiter = new RateLimiter({
  algorithm: 'leaky-bucket',
  maxRequests: 100,
  windowMs: 60000,
});
```

**How it works:**
- Requests queue up in a "bucket"
- Bucket "leaks" at a constant rate
- New requests rejected if bucket is full

**Use cases:**
- When downstream services require constant rate
- Traffic shaping
- Queue-based processing

---

## Configuration

### Basic Configuration

```typescript
import { RateLimiter, RateLimitConfig } from './performance/rate-limiter.js';

const config: RateLimitConfig = {
  algorithm: 'token-bucket',
  maxRequests: 100,
  windowMs: 60000,      // 1 minute
  burstSize: 120,       // Optional, defaults to maxRequests
};

const rateLimiter = new RateLimiter(config);
```

### Environment Variables

```bash
# Default rate limiting
RATE_LIMIT_ALGORITHM=token-bucket
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_BURST_SIZE=1200
```

---

## Quota Management

### User Quotas

Set per-user rate limits:

```typescript
import { UserQuota } from './performance/rate-limiter.js';

const userQuota: UserQuota = {
  userId: 'user-123',
  maxRequests: 50,      // 50 requests per window
  windowMs: 60000,      // 1 minute
  burstSize: 60,        // Optional burst allowance
};

rateLimiter.setUserQuota(userQuota);
```

### Tenant Quotas

Set per-tenant (organization) rate limits:

```typescript
import { TenantQuota } from './performance/rate-limiter.js';

const tenantQuota: TenantQuota = {
  tenantId: 'tenant-456',
  maxRequests: 1000,    // 1000 requests per window
  windowMs: 60000,      // 1 minute
  burstSize: 1200,      // Optional burst allowance
};

rateLimiter.setTenantQuota(tenantQuota);
```

### Hierarchical Rate Limiting

Check limits with user and tenant context:

```typescript
const result = await rateLimiter.checkLimitWithContext('api-key', {
  userId: 'user-123',
  tenantId: 'tenant-456',
});

// Result includes which quota was triggered
console.log(result.quotaType); // 'user', 'tenant', or 'global'
```

**Evaluation Order:**
1. User quota (most specific)
2. Tenant quota
3. Global quota (least specific)

---

## API Reference

### RateLimiter Class

#### Constructor

```typescript
new RateLimiter(config: RateLimitConfig)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| algorithm | RateLimitAlgorithm | Yes | Rate limiting algorithm |
| maxRequests | number | Yes | Maximum requests per window |
| windowMs | number | Yes | Time window in milliseconds |
| burstSize | number | No | Maximum burst size (token bucket) |

#### checkLimit(key: string): Promise<RateLimitResult>

Check if a request should be allowed.

```typescript
const result = await rateLimiter.checkLimit('user:123');

if (result.allowed) {
  // Process request
  console.log(`Remaining: ${result.remaining}`);
} else {
  // Rate limited
  console.log(`Retry after: ${result.retryAfter}ms`);
}
```

**RateLimitResult:**

| Field | Type | Description |
|-------|------|-------------|
| allowed | boolean | Whether request is allowed |
| remaining | number | Remaining requests in window |
| resetAt | number | Timestamp when limit resets |
| retryAfter | number | Milliseconds until next request allowed |
| quotaType | string | Which quota was triggered (optional) |

#### checkLimitWithContext(key: string, context: object): Promise<RateLimitResult>

Check limit with user/tenant context for hierarchical rate limiting.

```typescript
const result = await rateLimiter.checkLimitWithContext('endpoint', {
  userId: 'user-123',
  tenantId: 'tenant-456',
});
```

#### setUserQuota(quota: UserQuota): void

Set rate limit quota for a specific user.

```typescript
rateLimiter.setUserQuota({
  userId: 'user-123',
  maxRequests: 50,
  windowMs: 60000,
});
```

#### setTenantQuota(quota: TenantQuota): void

Set rate limit quota for a specific tenant.

```typescript
rateLimiter.setTenantQuota({
  tenantId: 'tenant-456',
  maxRequests: 1000,
  windowMs: 60000,
});
```

#### getUserQuotaUsage(userId: string): object

Get current quota usage for a user.

```typescript
const usage = rateLimiter.getUserQuotaUsage('user-123');
console.log(`Used: ${usage.used}/${usage.quota?.maxRequests}`);
console.log(`Remaining: ${usage.remaining}`);
console.log(`Resets at: ${new Date(usage.resetAt)}`);
```

#### getTenantQuotaUsage(tenantId: string): object

Get current quota usage for a tenant.

```typescript
const usage = rateLimiter.getTenantQuotaUsage('tenant-456');
console.log(`Used: ${usage.used}/${usage.quota?.maxRequests}`);
```

#### reset(key: string): void

Reset rate limit for a specific key.

```typescript
rateLimiter.reset('user:123');
```

#### clear(): void

Clear all rate limit state.

```typescript
rateLimiter.clear();
```

#### stop(): void

Stop the rate limiter and cleanup resources.

```typescript
rateLimiter.stop();
```

---

## HTTP Response Headers

When rate limiting is applied, Proxilion GRC returns standard headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704067200
Retry-After: 30
```

| Header | Description |
|--------|-------------|
| X-RateLimit-Limit | Maximum requests per window |
| X-RateLimit-Remaining | Remaining requests in current window |
| X-RateLimit-Reset | Unix timestamp when limit resets |
| Retry-After | Seconds until request will be allowed (on 429) |

### 429 Too Many Requests Response

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "retryAfter": 30,
  "resetAt": 1704067200,
  "quotaType": "user"
}
```

---

## Prometheus Metrics

Rate limiting exposes the following metrics:

| Metric | Type | Description |
|--------|------|-------------|
| rate_limit_allowed_total | Counter | Total allowed requests |
| rate_limit_rejected_total | Counter | Total rejected requests |
| rate_limit_remaining | Gauge | Remaining requests (by key) |

### Grafana Query Examples

```promql
# Rate limit rejection rate
rate(rate_limit_rejected_total[5m]) /
(rate(rate_limit_allowed_total[5m]) + rate(rate_limit_rejected_total[5m]))

# Total rate limited requests per minute
sum(rate(rate_limit_rejected_total[1m])) * 60
```

---

## Algorithm Comparison

| Algorithm | Memory | Precision | Burst Handling | Best For |
|-----------|--------|-----------|----------------|----------|
| Token Bucket | Low | Good | Excellent | API rate limiting |
| Sliding Window | High | Excellent | Good | Compliance |
| Fixed Window | Lowest | Fair | Poor | High volume |
| Leaky Bucket | Medium | Good | None | Traffic shaping |

### Choosing an Algorithm

1. **Default choice**: Token bucket - best balance of features
2. **Precision needed**: Sliding window - no boundary issues
3. **Maximum performance**: Fixed window - lowest overhead
4. **Constant rate required**: Leaky bucket - smooths traffic

---

## Integration Examples

### Express/Hono Middleware

```typescript
import { RateLimiter } from './performance/rate-limiter.js';

const rateLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  maxRequests: 100,
  windowMs: 60000,
});

app.use(async (c, next) => {
  const key = c.req.header('X-API-Key') || c.req.ip;
  const result = await rateLimiter.checkLimit(key);

  c.header('X-RateLimit-Limit', '100');
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', Math.floor(result.resetAt / 1000).toString());

  if (!result.allowed) {
    c.header('Retry-After', Math.ceil(result.retryAfter! / 1000).toString());
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

  return next();
});
```

### Per-Endpoint Limits

```typescript
// Different limits for different endpoints
const chatLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  maxRequests: 60,
  windowMs: 60000,
});

const completionLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  maxRequests: 20,
  windowMs: 60000,
});

app.post('/v1/chat/completions', async (c) => {
  const result = await chatLimiter.checkLimit(getKey(c));
  // ...
});

app.post('/v1/completions', async (c) => {
  const result = await completionLimiter.checkLimit(getKey(c));
  // ...
});
```

---

## Distributed Rate Limiting

For multi-instance deployments, rate limiting state should be shared. Options:

### Redis Backend (Recommended)

```typescript
// Configure Redis for distributed rate limiting
REDIS_URL=redis://localhost:6379
RATE_LIMIT_STORE=redis
```

### Limitations of In-Memory Rate Limiting

- State is per-instance only
- Requests may exceed limits when distributed across instances
- Suitable for single-instance or when approximate limiting is acceptable

---

## Troubleshooting

### Common Issues

**1. Rate limits not being enforced**
- Check that rate limiter is properly initialized
- Verify key generation is consistent
- Check if cleanup is removing state too aggressively

**2. Memory growing unbounded**
- Automatic cleanup runs every 5 minutes
- Verify cleanup interval is running
- Consider using Redis for distributed deployment

**3. Inconsistent limits across instances**
- Use Redis backend for distributed rate limiting
- Or accept approximate rate limiting

### Debug Logging

Enable debug logging for rate limiter:

```bash
LOG_LEVEL=debug
```

Log output includes:
- Rate limit checks
- Quota enforcement
- Cleanup operations

---

## Next Steps

- [Performance Optimization](PERFORMANCE_OPTIMIZATION.md)
- [Observability Guide](OBSERVABILITY.md)
- [Setup Guide](SETUP.md)
