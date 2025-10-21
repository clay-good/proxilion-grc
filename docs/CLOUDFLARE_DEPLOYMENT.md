# Cloudflare Workers Deployment Guide

## Overview

Deploying Proxilion on Cloudflare Workers provides:

- **Global Edge Network**: 300+ locations worldwide
- **Auto-Scaling**: Handles any load automatically
- **High Availability**: 99.99% uptime SLA
- **Low Latency**: <10ms overhead
- **Zero Infrastructure**: No servers to manage
- **Cost-Effective**: Pay per request

## Prerequisites

1. **Cloudflare Account** (Free or paid)
2. **Domain** managed by Cloudflare
3. **Wrangler CLI** installed
4. **Node.js 18+** installed

## Step 1: Install Wrangler CLI

```bash
# Install globally
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## Step 2: Configure Wrangler

Create `wrangler.toml` in project root:

```toml
name = "proxilion"
main = "src/index.ts"
compatibility_date = "2024-01-01"
node_compat = true

# Production environment
[env.production]
name = "proxilion-prod"
vars = { ENVIRONMENT = "production" }

# KV Namespaces for data storage
kv_namespaces = [
  { binding = "POLICIES", id = "YOUR_POLICIES_KV_ID", preview_id = "YOUR_POLICIES_PREVIEW_KV_ID" },
  { binding = "AUDIT_LOG", id = "YOUR_AUDIT_KV_ID", preview_id = "YOUR_AUDIT_PREVIEW_KV_ID" },
  { binding = "CERTIFICATES", id = "YOUR_CERTS_KV_ID", preview_id = "YOUR_CERTS_PREVIEW_KV_ID" },
  { binding = "METRICS", id = "YOUR_METRICS_KV_ID", preview_id = "YOUR_METRICS_PREVIEW_KV_ID" }
]

# Durable Objects for real-time features
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "proxilion-prod"

[[durable_objects.bindings]]
name = "WEBSOCKET_MANAGER"
class_name = "WebSocketManager"
script_name = "proxilion-prod"

# R2 for large file storage (optional)
[[r2_buckets]]
binding = "AUDIT_ARCHIVE"
bucket_name = "proxilion-audit-archive"
preview_bucket_name = "proxilion-audit-archive-preview"

# Analytics Engine for metrics
[[analytics_engine_datasets]]
binding = "ANALYTICS"

# Routes - map your domain
[[routes]]
pattern = "proxilion.company.com/*"
zone_name = "company.com"

[[routes]]
pattern = "chat.openai.com/*"
zone_name = "company.com"

[[routes]]
pattern = "claude.ai/*"
zone_name = "company.com"

[[routes]]
pattern = "gemini.google.com/*"
zone_name = "company.com"
```

## Step 3: Create KV Namespaces

```bash
# Create production KV namespaces
wrangler kv:namespace create "POLICIES" --env production
wrangler kv:namespace create "AUDIT_LOG" --env production
wrangler kv:namespace create "CERTIFICATES" --env production
wrangler kv:namespace create "METRICS" --env production

# Create preview KV namespaces (for testing)
wrangler kv:namespace create "POLICIES" --preview --env production
wrangler kv:namespace create "AUDIT_LOG" --preview --env production
wrangler kv:namespace create "CERTIFICATES" --preview --env production
wrangler kv:namespace create "METRICS" --preview --env production

# Copy the IDs output by these commands into wrangler.toml
```

## Step 4: Create R2 Bucket (Optional)

```bash
# For long-term audit log storage
wrangler r2 bucket create proxilion-audit-archive
wrangler r2 bucket create proxilion-audit-archive-preview
```

## Step 5: Set Environment Variables

```bash
# Set secrets (encrypted environment variables)
wrangler secret put ADMIN_API_KEY --env production
# Enter your admin API key when prompted

wrangler secret put OPENAI_API_KEY --env production
# Enter your OpenAI API key

wrangler secret put ANTHROPIC_API_KEY --env production
# Enter your Anthropic API key

wrangler secret put GOOGLE_API_KEY --env production
# Enter your Google API key

wrangler secret put SIEM_WEBHOOK_URL --env production
# Enter your SIEM webhook URL (optional)
```

## Step 6: Build and Deploy

```bash
# Build the project
npm run build

# Deploy to Cloudflare Workers
wrangler deploy --env production

# Output will show:
# ✨ Successfully published your script to
#    https://proxilion-prod.your-subdomain.workers.dev
```

## Step 7: Configure Custom Domain

### Option A: Via Cloudflare Dashboard

1. Go to **Workers & Pages** > **proxilion-prod**
2. Click **Triggers** tab
3. Click **Add Custom Domain**
4. Enter: `proxilion.company.com`
5. Click **Add Custom Domain**

### Option B: Via Wrangler

```bash
wrangler domains add proxilion.company.com --env production
```

## Step 8: Configure DNS for AI Domains

In your Cloudflare DNS settings:

```
# Add A records pointing to your Proxilion worker
chat.openai.com         A   192.0.2.1   (Proxied ☁️)
claude.ai               A   192.0.2.1   (Proxied ☁️)
gemini.google.com       A   192.0.2.1   (Proxied ☁️)

# The actual IP doesn't matter when proxied through Cloudflare
# Cloudflare will route to your worker based on the routes in wrangler.toml
```

## Step 9: Upload CA Certificate

```bash
# Generate CA certificate (if not already done)
npm run generate-ca

# Upload to KV
wrangler kv:key put --binding=CERTIFICATES "ca-cert" --path=./certs/ca.crt --env production
wrangler kv:key put --binding=CERTIFICATES "ca-key" --path=./certs/ca.key --env production
```

## Step 10: Initialize Policies

```bash
# Upload default policies
node scripts/upload-default-policies.js --env production
```

## Step 11: Verify Deployment

```bash
# Test health endpoint
curl https://proxilion.company.com/health

# Expected response:
# {"status":"healthy","version":"1.0.0","timestamp":1234567890}

# Test metrics endpoint
curl -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  https://proxilion.company.com/api/metrics

# Test PII detection
curl -X POST https://proxilion.company.com/api/test \
  -H "Content-Type: application/json" \
  -d '{"text":"My SSN is 123-45-6789"}'

# Expected response:
# {"blocked":true,"reason":"SSN detected","severity":"CRITICAL"}
```

## Step 12: Monitor Deployment

### Cloudflare Dashboard

1. Go to **Workers & Pages** > **proxilion-prod**
2. View **Metrics** tab for:
   - Requests per second
   - CPU time
   - Errors
   - Success rate

### Wrangler CLI

```bash
# View real-time logs
wrangler tail --env production

# View metrics
wrangler metrics --env production
```

### Analytics Engine

```bash
# Query analytics
wrangler analytics query \
  --dataset=ANALYTICS \
  --query="SELECT * FROM ANALYTICS WHERE timestamp > NOW() - INTERVAL '1 hour'" \
  --env production
```

## Advanced Configuration

### Enable Durable Objects

Durable Objects provide stateful, real-time features:

```typescript
// src/durable-objects/rate-limiter.ts
export class RateLimiter {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request) {
    const key = new URL(request.url).searchParams.get('key');
    const count = (await this.state.storage.get(key)) || 0;
    
    if (count > 100) {
      return new Response('Rate limit exceeded', { status: 429 });
    }
    
    await this.state.storage.put(key, count + 1);
    return new Response('OK');
  }
}
```

### Enable WebSocket Support

```typescript
// src/durable-objects/websocket-manager.ts
export class WebSocketManager {
  private sessions: Set<WebSocket> = new Set();

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.sessions.add(server);
    server.accept();

    server.addEventListener('message', (event) => {
      // Broadcast to all connected clients
      this.sessions.forEach((session) => {
        session.send(event.data);
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
```

### Configure Rate Limiting

```toml
# wrangler.toml
[env.production.limits]
cpu_ms = 50  # Max CPU time per request
```

### Configure Caching

```typescript
// Cache responses for performance
const cache = caches.default;
const cacheKey = new Request(url, request);
const cachedResponse = await cache.match(cacheKey);

if (cachedResponse) {
  return cachedResponse;
}

const response = await fetch(request);
await cache.put(cacheKey, response.clone());
return response;
```

## Scaling Considerations

### Automatic Scaling

Cloudflare Workers automatically scale to handle any load:

- **No configuration needed**
- **Instant scaling** (0 to millions of requests)
- **Global distribution** (300+ locations)
- **No cold starts** (<1ms startup time)

### Cost Optimization

```
Free Tier:
- 100,000 requests/day
- 10ms CPU time per request

Paid Plan ($5/month):
- 10 million requests/month included
- $0.50 per additional million requests
- 50ms CPU time per request

Typical costs for 1 million requests/day:
- ~$15/month (very cost-effective)
```

### Performance Optimization

```typescript
// Use KV for frequently accessed data
const policy = await env.POLICIES.get('default', { type: 'json' });

// Use cache API for responses
const cached = await caches.default.match(request);

// Use Durable Objects for stateful operations
const rateLimiter = env.RATE_LIMITER.get(id);
```

## Troubleshooting

### Common Issues

**Issue**: "Error 1101: Worker threw exception"

```bash
# Check logs
wrangler tail --env production

# Common causes:
# - Unhandled promise rejection
# - Exceeded CPU time limit
# - KV namespace not found
```

**Issue**: "Error 1102: Worker exceeded CPU time limit"

```bash
# Optimize code:
# - Use async/await properly
# - Avoid blocking operations
# - Cache frequently accessed data
```

**Issue**: "KV namespace not found"

```bash
# Verify KV namespace IDs in wrangler.toml
wrangler kv:namespace list

# Recreate if needed
wrangler kv:namespace create "POLICIES" --env production
```

## Monitoring & Alerts

### Set Up Alerts

1. Go to **Cloudflare Dashboard** > **Notifications**
2. Create alert for:
   - High error rate (>5%)
   - High CPU usage (>80%)
   - Low success rate (<95%)

### Integrate with External Monitoring

```typescript
// Send metrics to external service
await fetch('https://your-monitoring-service.com/metrics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    service: 'proxilion',
    metric: 'requests',
    value: 1,
    timestamp: Date.now(),
  }),
});
```

## Security Best Practices

1. **Rotate Secrets Regularly**
   ```bash
   wrangler secret put ADMIN_API_KEY --env production
   ```

2. **Use IP Allowlisting** (for admin endpoints)
   ```typescript
   const allowedIPs = ['203.0.113.0/24'];
   if (!allowedIPs.includes(request.headers.get('CF-Connecting-IP'))) {
     return new Response('Forbidden', { status: 403 });
   }
   ```

3. **Enable WAF Rules**
   - Go to **Security** > **WAF**
   - Enable managed rulesets
   - Create custom rules for your worker

4. **Audit Logs**
   ```typescript
   await env.AUDIT_LOG.put(
     `audit-${Date.now()}`,
     JSON.stringify({ action, user, timestamp })
   );
   ```

## Next Steps

- [Configure MDM for Mobile Devices](MDM_CONFIGURATION.md)
- [Distribute CA Certificates](CERTIFICATE_INSTALLATION.md)
- [Set Up Compliance Reporting](COMPLIANCE_REPORTING.md)
- [Integrate with SIEM](SIEM_INTEGRATION.md)

---

**Need Help?** Contact enterprise@proxilion.dev

