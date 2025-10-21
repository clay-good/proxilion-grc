# Enterprise Integration Guide

This guide covers Proxilion's enterprise integration capabilities, including SIEM forwarding, webhooks, authentication, and alerting.

## Table of Contents

- [SIEM Integration](#siem-integration)
- [Webhook Integration](#webhook-integration)
- [Authentication](#authentication)
- [Alerting](#alerting)
- [Additional AI Providers](#additional-ai-providers)

---

## SIEM Integration

Proxilion can forward security events to SIEM systems in multiple formats.

### Supported SIEM Systems

- **Splunk** - JSON format
- **IBM QRadar** - CEF or LEEF format
- **ArcSight** - CEF format
- **Microsoft Sentinel** - JSON format
- **Elastic Security** - JSON format
- **Generic** - Syslog format

### Configuration

Set environment variables:

```bash
SIEM_ENABLED=true
SIEM_VENDOR=SPLUNK
SIEM_FORMAT=JSON
SIEM_ENDPOINT=https://splunk.example.com:8088/services/collector
SIEM_API_KEY=your-hec-token
```

### Supported Formats

#### 1. CEF (Common Event Format)

Used by ArcSight, QRadar, and other SIEM systems.

```
CEF:0|Proxilion|AI Security Proxy|0.1.0|pii.detected|PII Detected|8|rt=1234567890 src=192.168.1.1 dst=api.openai.com act=scan outcome=BLOCK cat=security cs1Label=ThreatLevel cs1=HIGH
```

#### 2. LEEF (Log Event Extended Format)

Used by IBM QRadar.

```
LEEF:2.0|Proxilion|AI Security Proxy|0.1.0|pii.detected|	devTime=2024-01-01T00:00:00Z	src=192.168.1.1	dst=api.openai.com	sev=8	threatLevel=HIGH
```

#### 3. JSON

Used by Splunk, Elastic, Sentinel.

```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "severity": 8,
  "category": "security",
  "action": "scan",
  "outcome": "BLOCK",
  "source": {
    "ip": "192.168.1.1",
    "user": "user-123"
  },
  "destination": "api.openai.com",
  "threat": {
    "level": "HIGH",
    "score": 8
  },
  "details": {
    "requestId": "req-123",
    "model": "gpt-4",
    "provider": "openai",
    "findings": [...]
  }
}
```

#### 4. Syslog (RFC 5424)

Generic syslog format for any SIEM.

```
<134>1 2024-01-01T00:00:00Z proxilion ai-security-proxy 12345 pii.detected [proxilion@0 requestId="req-123" threatLevel="HIGH"] PII Detected - BLOCK
```

### API Endpoints

```bash
# Get SIEM configuration
GET /admin/siem/config

# Get queue size
GET /admin/siem/queue

# Flush queue immediately
POST /admin/siem/flush
```

### Batching and Performance

- **Batch Size**: 100 events (configurable)
- **Batch Interval**: 10 seconds (configurable)
- **Retry Attempts**: 3 (configurable)
- **Retry Delay**: Exponential backoff

---

## Webhook Integration

Proxilion supports custom webhooks for real-time event notifications.

### Webhook Configuration

Register a webhook via API:

```bash
POST /admin/webhooks
Content-Type: application/json

{
  "id": "webhook-1",
  "name": "Security Alerts",
  "url": "https://your-app.com/webhooks/proxilion",
  "secret": "your-webhook-secret",
  "events": ["pii.detected", "injection.detected"],
  "enabled": true,
  "retryAttempts": 3,
  "retryDelay": 1000,
  "timeout": 5000,
  "rateLimit": {
    "maxRequests": 100,
    "windowMs": 60000
  }
}
```

### Event Patterns

- **Specific events**: `["pii.detected", "injection.detected"]`
- **Wildcard**: `["*"]` - all events
- **Pattern matching**: `["pii.*"]` - all PII-related events

### Webhook Payload

```json
{
  "id": "delivery-123",
  "timestamp": "2024-01-01T00:00:00Z",
  "event": "pii.detected",
  "data": {
    "requestId": "req-123",
    "userId": "user-123",
    "sourceIp": "192.168.1.1",
    "provider": "openai",
    "model": "gpt-4",
    "action": "scan",
    "decision": "BLOCK",
    "threatLevel": "HIGH",
    "findings": [
      {
        "type": "pii",
        "severity": "high",
        "message": "Credit card detected",
        "evidence": "4111-****-****-1111"
      }
    ]
  }
}
```

### Webhook Security

All webhooks include an HMAC-SHA256 signature:

```
X-Proxilion-Signature: sha256=abc123...
```

Verify the signature:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### Webhook Management API

```bash
# List all webhooks
GET /admin/webhooks

# Get specific webhook
GET /admin/webhooks/:id

# Update webhook
PUT /admin/webhooks/:id
Content-Type: application/json
{
  "enabled": false
}

# Delete webhook
DELETE /admin/webhooks/:id

# Test webhook
POST /admin/webhooks/:id/test
```

### Retry Logic

- **Exponential backoff**: 1s, 2s, 4s, 8s...
- **Max retries**: Configurable (default: 3)
- **Timeout**: Configurable (default: 5s)

---

## Authentication

Proxilion supports multiple authentication methods.

### Supported Methods

#### 1. API Key

```bash
# Header-based
Authorization: Bearer your-api-key

# Or custom header
X-API-Key: your-api-key
```

Configuration:

```bash
AUTH_METHOD=API_KEY
API_KEYS=key1,key2,key3
```

#### 2. JWT (JSON Web Token)

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Configuration:

```bash
AUTH_METHOD=JWT
JWT_SECRET=your-jwt-secret
JWT_ISSUER=your-issuer
```

JWT Payload:

```json
{
  "sub": "user-123",
  "iss": "your-issuer",
  "exp": 1234567890,
  "roles": ["user", "admin"],
  "permissions": ["ai:request", "ai:admin"],
  "tenant": "tenant-123"
}
```

#### 3. OAuth 2.0

```bash
Authorization: Bearer oauth-access-token
```

Configuration:

```bash
AUTH_METHOD=OAUTH
OAUTH_ENDPOINT=https://oauth-provider.com/introspect
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```

#### 4. Basic Auth

```bash
Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
```

Configuration:

```bash
AUTH_METHOD=BASIC
```

#### 5. Custom

Implement custom authentication logic:

```typescript
const authProvider = new AuthProvider({
  method: 'CUSTOM',
  customHeaderName: 'X-Custom-Auth',
  customValidator: async (value: string) => {
    // Your custom validation logic
    return await validateToken(value);
  },
});
```

### Authentication Context

After successful authentication, the context includes:

```typescript
{
  authenticated: true,
  method: 'JWT',
  userId: 'user-123',
  tenantId: 'tenant-123',
  roles: ['user', 'admin'],
  permissions: ['ai:request', 'ai:admin'],
  metadata: { ... }
}
```

---

## Alerting

Proxilion can send real-time alerts to multiple channels.

### Supported Channels

- **Slack**
- **PagerDuty**
- **Microsoft Teams**
- **Email** (SMTP)
- **Custom Webhooks**

### Configuration

```bash
ALERTS_ENABLED=true
ALERT_MIN_THREAT_LEVEL=MEDIUM
```

### Slack Integration

```typescript
alertManager.config.channels.push({
  type: 'SLACK',
  enabled: true,
  config: {
    webhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
  },
});
```

### PagerDuty Integration

```typescript
alertManager.config.channels.push({
  type: 'PAGERDUTY',
  enabled: true,
  config: {
    integrationKey: 'your-pagerduty-integration-key',
  },
});
```

### Microsoft Teams Integration

```typescript
alertManager.config.channels.push({
  type: 'TEAMS',
  enabled: true,
  config: {
    webhookUrl: 'https://outlook.office.com/webhook/YOUR/WEBHOOK/URL',
  },
});
```

### Alert Throttling

Prevent alert fatigue:

```typescript
{
  throttle: {
    enabled: true,
    windowMs: 60000,  // 1 minute
    maxAlerts: 10     // Max 10 alerts per minute per event type
  }
}
```

### Alert Aggregation

Combine multiple alerts:

```typescript
{
  aggregation: {
    enabled: true,
    windowMs: 30000  // Aggregate alerts over 30 seconds
  }
}
```

---

## Additional AI Providers

Proxilion now supports additional AI providers beyond OpenAI and Anthropic.

### Google Vertex AI

**Supported Models**:
- Gemini Pro
- Gemini Pro Vision
- Gemini 1.5 Pro (1M context)
- PaLM 2

**Endpoint Format**:
```
/proxy/aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent
```

**Example**:
```bash
curl -X POST http://localhost:8787/proxy/aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-pro:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "Hello!"}]
    }]
  }'
```

### Cohere

**Supported Models**:
- Command
- Command Light
- Command R
- Command R+

**Endpoints**:
- `/v1/chat` - Chat completion
- `/v1/generate` - Text generation

**Example**:
```bash
curl -X POST http://localhost:8787/proxy/api.cohere.ai/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "model": "command-r-plus"
  }'
```

---

## Best Practices

### SIEM Integration

1. **Use batching** to reduce network overhead
2. **Monitor queue size** to detect issues
3. **Set appropriate retry limits** to avoid overwhelming SIEM
4. **Use the correct format** for your SIEM system

### Webhooks

1. **Verify signatures** to ensure authenticity
2. **Implement idempotency** to handle retries
3. **Use rate limiting** to prevent abuse
4. **Monitor webhook health** and disable failing webhooks

### Authentication

1. **Use JWT** for stateless authentication
2. **Rotate API keys** regularly
3. **Implement least privilege** with roles and permissions
4. **Cache authentication results** to reduce overhead

### Alerting

1. **Set appropriate threat levels** to avoid alert fatigue
2. **Use throttling** to limit duplicate alerts
3. **Enable aggregation** for high-volume environments
4. **Test alert channels** regularly

---

## Troubleshooting

### SIEM Events Not Forwarding

1. Check `SIEM_ENABLED=true`
2. Verify endpoint URL and API key
3. Check queue size: `GET /admin/siem/queue`
4. Review logs for errors

### Webhooks Not Triggering

1. Verify webhook is enabled
2. Check event pattern matches
3. Test webhook: `POST /admin/webhooks/:id/test`
4. Review rate limit settings

### Authentication Failures

1. Verify auth method configuration
2. Check API key/JWT format
3. Review token expiration
4. Check logs for specific errors

### Alerts Not Sending

1. Verify `ALERTS_ENABLED=true`
2. Check minimum threat level
3. Verify channel configuration
4. Test alert channels manually

---

## Support

For enterprise support and custom integrations, contact: support@proxilion.dev

