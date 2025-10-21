# Advanced Features Guide

This guide covers the advanced features of Proxilion including cost tracking, analytics, multi-tenancy, and custom scanner development.

---

## Table of Contents

1. [Cost Tracking & Budget Management](#cost-tracking--budget-management)
2. [Analytics Engine](#analytics-engine)
3. [Multi-Tenancy](#multi-tenancy)
4. [Custom Scanner SDK](#custom-scanner-sdk)

---

## Cost Tracking & Budget Management

Proxilion includes comprehensive cost tracking for AI API usage with budget limits and alerts.

### Features

- **Per-model pricing** for OpenAI, Anthropic, Google, and Cohere
- **Token-based cost calculation** with separate input/output pricing
- **Budget limits** with configurable periods (hourly, daily, weekly, monthly)
- **Budget alerts** at configurable thresholds
- **Cost aggregation** by user, tenant, provider, and model
- **Historical cost data** with automatic cleanup

### API Endpoints

#### Get Cost Summary

```bash
GET /admin/cost/summary?userId=user123&startTime=1234567890&endTime=1234567999

Response:
{
  "totalCost": 125.50,
  "totalRequests": 1000,
  "totalInputTokens": 500000,
  "totalOutputTokens": 250000,
  "averageCostPerRequest": 0.1255,
  "byProvider": {
    "openai": 75.30,
    "anthropic": 50.20
  },
  "byModel": {
    "gpt-4": 60.00,
    "gpt-3.5-turbo": 15.30,
    "claude-3-sonnet": 50.20
  }
}
```

#### Get Cost Entries

```bash
GET /admin/cost/entries?limit=100

Response:
{
  "entries": [
    {
      "id": "uuid",
      "timestamp": 1234567890,
      "provider": "openai",
      "model": "gpt-4",
      "userId": "user123",
      "tenantId": "tenant456",
      "inputTokens": 1000,
      "outputTokens": 500,
      "inputCost": 0.03,
      "outputCost": 0.03,
      "totalCost": 0.06,
      "requestId": "req-uuid",
      "cached": false
    }
  ]
}
```

#### Add Budget Limit

```bash
POST /admin/cost/budget

Body:
{
  "id": "budget-1",
  "name": "Daily User Budget",
  "scope": "user",
  "scopeId": "user123",
  "limit": 100.00,
  "period": "daily",
  "alertThreshold": 80,
  "enabled": true
}

Response:
{
  "message": "Budget limit added successfully",
  "id": "budget-1"
}
```

#### Get Budget Limits

```bash
GET /admin/cost/budgets

Response:
{
  "budgets": [
    {
      "id": "budget-1",
      "name": "Daily User Budget",
      "scope": "user",
      "scopeId": "user123",
      "limit": 100.00,
      "period": "daily",
      "alertThreshold": 80,
      "enabled": true
    }
  ]
}
```

### Pricing Configuration

Default pricing is included for common models. To add custom pricing:

```typescript
import { CostTracker } from './src/cost/cost-tracker.js';

const costTracker = new CostTracker();

costTracker.addPricing({
  provider: 'openai',
  model: 'gpt-4-custom',
  inputTokenPrice: 25.0,  // Per 1M tokens
  outputTokenPrice: 50.0, // Per 1M tokens
});
```

---

## Analytics Engine

The Analytics Engine provides advanced analytics for usage patterns, security insights, and performance metrics.

### Features

- **Time series data** collection and analysis
- **Anomaly detection** with configurable thresholds
- **Usage metrics** (requests, latency, cache hit rate, error rate)
- **Security insights** (threat detection, PII findings, injection attempts)
- **Cost optimization recommendations**
- **Provider comparison**

### API Endpoints

#### Get Time Series Data

```bash
GET /admin/analytics/usage?metric=request.latency&startTime=1234567890&endTime=1234567999

Response:
{
  "metric": "request.latency",
  "data": [
    {
      "timestamp": 1234567890,
      "value": 125.5,
      "label": "p95"
    }
  ]
}
```

#### Get Anomalies

```bash
GET /admin/analytics/anomalies?limit=10

Response:
{
  "anomalies": [
    {
      "id": "uuid",
      "timestamp": 1234567890,
      "type": "spike",
      "severity": "high",
      "metric": "request.latency",
      "value": 500.0,
      "baseline": 100.0,
      "deviation": 4.5,
      "description": "request.latency spike detected: 500.00 (baseline: 100.00, 4.5σ)"
    }
  ]
}
```

#### Detect Anomalies

```bash
POST /admin/analytics/detect-anomalies?metric=request.cost&threshold=2.5

Response:
{
  "metric": "request.cost",
  "anomalies": [...]
}
```

### Usage in Code

```typescript
import { AnalyticsEngine } from './src/analytics/analytics-engine.js';

const analytics = new AnalyticsEngine();

// Record data points
analytics.recordDataPoint('request.latency', 125.5);
analytics.recordDataPoint('request.cost', 0.05);

// Calculate usage metrics
const metrics = analytics.calculateUsageMetrics({
  requests: [
    { status: 'success', latency: 100, cached: false },
    { status: 'success', latency: 120, cached: true },
  ],
});

// Generate recommendations
const recommendations = analytics.generateRecommendations({
  costByModel: { 'gpt-4': 100, 'gpt-3.5-turbo': 20 },
  cacheHitRate: 45,
  averageTokens: 2500,
  providerDistribution: { openai: 100 },
});
```

---

## Multi-Tenancy

Proxilion supports full multi-tenancy with tenant isolation, per-tenant policies, and quotas.

### Features

- **Tenant isolation** with separate configurations
- **Per-tenant policies** and security settings
- **Per-tenant quotas** (requests, tokens, cost)
- **Per-tenant rate limiting**
- **Usage tracking** per tenant
- **Tenant-specific webhooks**

### API Endpoints

#### Create Tenant

```bash
POST /admin/tenants

Body:
{
  "id": "tenant-123",
  "name": "Acme Corp",
  "config": {
    "enablePIIDetection": true,
    "enableCaching": true,
    "allowedProviders": ["openai", "anthropic"],
    "rateLimit": {
      "enabled": true,
      "maxRequests": 1000,
      "windowMs": 60000
    }
  },
  "quotas": {
    "maxRequestsPerDay": 10000,
    "maxCostPerDay": 500
  }
}

Response:
{
  "message": "Tenant created successfully",
  "tenant": {...}
}
```

#### Get All Tenants

```bash
GET /admin/tenants

Response:
{
  "tenants": [
    {
      "id": "tenant-123",
      "name": "Acme Corp",
      "enabled": true,
      "createdAt": 1234567890,
      "config": {...},
      "quotas": {...}
    }
  ]
}
```

#### Get Tenant Usage

```bash
GET /admin/tenants/tenant-123/usage?period=day

Response:
{
  "tenantId": "tenant-123",
  "usage": [
    {
      "tenantId": "tenant-123",
      "period": "day",
      "requests": 1000,
      "tokens": 500000,
      "cost": 25.50,
      "cacheHits": 800,
      "cacheMisses": 200,
      "blockedRequests": 5,
      "errors": 2,
      "timestamp": 1234567890
    }
  ]
}
```

#### Check Tenant Quotas

```bash
GET /admin/tenants/tenant-123/quotas

Response:
{
  "tenantId": "tenant-123",
  "quotas": [
    {
      "quotaType": "Requests per day",
      "current": 8500,
      "limit": 10000,
      "percentage": 85.0,
      "exceeded": false
    },
    {
      "quotaType": "Cost per day",
      "current": 450.00,
      "limit": 500.00,
      "percentage": 90.0,
      "exceeded": false
    }
  ]
}
```

### Using Tenants in Requests

Include the tenant ID in the request header:

```bash
curl -X POST http://localhost:8787/proxy/api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Tenant-ID: tenant-123" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

---

## Custom Scanner SDK

The Custom Scanner SDK makes it easy to build custom security scanners.

### Features

- **Simple scanner interface** with builder pattern
- **Pattern matching** with regex support
- **Custom logic** with async/await
- **Built-in utilities** for common tasks
- **Pre-built pattern libraries**
- **Request and response scanning**

### Quick Start

```typescript
import { CustomScannerBuilder } from './src/sdk/custom-scanner-sdk.js';

const myScanner = new CustomScannerBuilder({
  name: 'my-scanner',
  description: 'My custom security scanner',
  version: '1.0.0',
  enabled: true,
  timeout: 3000,
  priority: 60,
})
  .addPattern({
    pattern: /SECRET-\d{6}/g,
    threatLevel: 'HIGH',
    description: 'Secret key detected',
    category: 'secrets',
  })
  .build();
```

### Pattern-Based Scanner

```typescript
const scanner = new CustomScannerBuilder({
  name: 'pattern-scanner',
  description: 'Detects patterns',
  version: '1.0.0',
})
  .addPattern({
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    threatLevel: 'MEDIUM',
    description: 'Email address detected',
    category: 'pii',
  })
  .addPattern({
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    threatLevel: 'HIGH',
    description: 'SSN detected',
    category: 'pii',
  })
  .build();
```

### Custom Logic Scanner

```typescript
const scanner = new CustomScannerBuilder({
  name: 'custom-logic-scanner',
  description: 'Uses custom logic',
  version: '1.0.0',
})
  .withCustomLogic(async (request, response) => {
    const findings = [];
    const texts = ScannerUtils.extractTextContent(request);

    for (const text of texts) {
      if (text.length > 10000) {
        findings.push(
          ScannerUtils.createFinding({
            type: 'long_request',
            severity: 'LOW',
            message: 'Request is unusually long',
            evidence: `Length: ${text.length}`,
            confidence: 0.6,
          })
        );
      }
    }

    return findings;
  })
  .build();
```

### Using Pre-built Pattern Libraries

```typescript
import { PatternLibrary } from './src/sdk/custom-scanner-sdk.js';

const scanner = new CustomScannerBuilder({
  name: 'sql-scanner',
  description: 'Detects SQL injection',
  version: '1.0.0',
})
  .addPatterns(PatternLibrary.SQL_INJECTION)
  .addPatterns(PatternLibrary.CODE_INJECTION)
  .build();
```

### Registering Custom Scanners

```typescript
import { ScannerOrchestrator } from './src/scanners/scanner-orchestrator.js';
import { myScanner } from './my-scanners.js';

const orchestrator = new ScannerOrchestrator();
orchestrator.registerScanner(myScanner);
```

### Scanner Utilities

```typescript
import { ScannerUtils } from './src/sdk/custom-scanner-sdk.js';

// Extract text content
const texts = ScannerUtils.extractTextContent(request);

// Check for keywords
const hasKeywords = ScannerUtils.containsKeywords(text, ['password', 'secret']);

// Count matches
const count = ScannerUtils.countMatches(text, /\d{3}-\d{2}-\d{4}/g);

// Create finding
const finding = ScannerUtils.createFinding({
  type: 'custom',
  severity: 'HIGH',
  message: 'Custom finding',
  confidence: 0.9,
});
```

---

## Best Practices

### Cost Management

1. **Set budget limits** for all users and tenants
2. **Monitor cost trends** using analytics
3. **Use caching** to reduce API costs
4. **Choose appropriate models** for each task
5. **Set up alerts** for budget thresholds

### Analytics

1. **Record key metrics** consistently
2. **Run anomaly detection** regularly
3. **Review recommendations** weekly
4. **Track trends** over time
5. **Use insights** to optimize performance

### Multi-Tenancy

1. **Isolate tenant data** completely
2. **Set appropriate quotas** for each tenant
3. **Monitor tenant usage** regularly
4. **Enforce rate limits** per tenant
5. **Provide tenant-specific** configurations

### Custom Scanners

1. **Keep scanners focused** on specific threats
2. **Use appropriate timeouts** to avoid blocking
3. **Set realistic confidence** scores
4. **Test scanners thoroughly** before deployment
5. **Document scanner behavior** clearly

---

## Examples

See the `examples/` directory for complete examples:

- `examples/custom-scanner-example.ts` - Custom scanner examples
- `examples/basic-usage.ts` - Basic usage examples
- `examples/custom-policy.ts` - Custom policy examples

---

## Support

For questions or issues with advanced features:

1. Check the documentation
2. Review the examples
3. Open a GitHub issue
4. Contact support

---

**Built with ❤️ for the open source community**

