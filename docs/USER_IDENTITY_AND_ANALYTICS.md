# User Identity & Analytics System

## Overview

Proxilion now includes a comprehensive **User Identity & Analytics System** that enables enterprises to:

- **Track user behavior** across both API and browser-based LLM usage
- **Identify security violations** per user, team, and organization
- **Recommend training** for users with repeated security issues
- **Monitor compliance** at organizational level
- **Manage API keys** with user/team/org mapping

This system is critical for enterprises deploying Proxilion as a transparent MITM proxy where ALL LLM traffic (both API calls and browser sessions) flows through Proxilion.

---

## Architecture

### Components

1. **Identity Extractor** (`src/identity/identity-extractor.ts`)
   - Extracts user identity from multiple sources
   - Supports API keys, JWT tokens, HTTP headers, cookies, SSO headers, IP mapping
   - Priority-based extraction (API key > JWT > Headers > Cookies > IP)

2. **API Key Manager** (`src/identity/api-key-manager.ts`)
   - Maps API keys to users/teams/organizations
   - Tracks usage per key
   - Supports bulk import/export (CSV, JSON)
   - Key expiration and revocation

3. **Browser Session Tracker** (`src/identity/browser-session-tracker.ts`)
   - Tracks browser-based LLM sessions
   - Cookie-based session management
   - SSO integration (Azure AD, Okta, Auth0, SAML, OIDC)
   - Corporate proxy header support

4. **User Analytics** (`src/analytics/user-analytics.ts`)
   - Records security violations per user
   - Identifies users needing training
   - Tracks high-risk users
   - Calculates compliance scores
   - Provides team and organization metrics

---

## Identity Extraction

### Supported Methods

#### 1. API Key Mapping (Highest Priority)
```typescript
// Register API key with user metadata
apiKeyManager.registerKey({
  apiKey: 'sk-proj-abc123...',
  userId: 'user-123',
  email: 'john@company.com',
  username: 'john.doe',
  teamId: 'engineering',
  organizationId: 'acme-corp',
});
```

#### 2. JWT Token Extraction
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Extracts from JWT claims:
- `sub` or `user_id` → userId
- `email` → email
- `preferred_username` → username
- `org_id` → organizationId
- `team_id` → teamId
- `roles` → roles

#### 3. HTTP Header Extraction
```http
X-User-ID: user-123
X-User-Email: john@company.com
X-Organization-ID: acme-corp
X-Team-ID: engineering
```

#### 4. Browser Cookie Extraction
```http
Cookie: session_id=abc123; user_id=user-123; user_email=john@company.com
```

#### 5. SSO Header Extraction
Supports common SSO providers:
- **Azure AD**: `X-MS-Client-Principal-Name`, `X-MS-Client-Principal-ID`
- **Okta**: `X-Okta-User`, `X-Okta-User-ID`
- **Auth0**: `X-Auth0-User`, `X-Auth0-User-ID`
- **SAML**: `X-SAML-User`, `X-SAML-UID`
- **OIDC**: `X-OIDC-User`, `X-OIDC-Sub`
- **Generic**: `X-Authenticated-User`, `X-Remote-User`

#### 6. IP Address Mapping (Lowest Priority)
```typescript
identityExtractor.registerIPMapping('192.168.1.100', 'user-123');
```

---

## API Key Management

### Registering API Keys

#### Single Key Registration
```bash
curl -X POST http://localhost:8787/admin/api-keys/register \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-proj-abc123...",
    "userId": "user-123",
    "email": "john@company.com",
    "username": "john.doe",
    "teamId": "engineering",
    "organizationId": "acme-corp"
  }'
```

#### Bulk Registration
```bash
curl -X POST http://localhost:8787/admin/api-keys/bulk-register \
  -H "Content-Type: application/json" \
  -d '[
    {
      "apiKey": "sk-proj-abc123...",
      "userId": "user-1",
      "organizationId": "acme-corp"
    },
    {
      "apiKey": "sk-proj-def456...",
      "userId": "user-2",
      "organizationId": "acme-corp"
    }
  ]'
```

#### CSV Import
```bash
curl -X POST http://localhost:8787/admin/api-keys/import/csv \
  -H "Content-Type: text/plain" \
  --data-binary @api-keys.csv
```

CSV Format:
```csv
apiKey,userId,email,username,teamId,organizationId
sk-proj-abc123,user-1,user1@company.com,user1,team-1,acme-corp
sk-proj-def456,user-2,user2@company.com,user2,team-2,acme-corp
```

#### JSON Import
```bash
curl -X POST http://localhost:8787/admin/api-keys/import/json \
  -H "Content-Type: application/json" \
  -d @api-keys.json
```

### Querying API Keys

#### Get Keys for User
```bash
curl http://localhost:8787/admin/api-keys/user/user-123
```

#### Get Keys for Organization
```bash
curl http://localhost:8787/admin/api-keys/organization/acme-corp
```

#### Get Keys for Team
```bash
curl http://localhost:8787/admin/api-keys/team/engineering
```

---

## User Analytics

### Dashboard Endpoints

#### Users Needing Training
```bash
curl http://localhost:8787/admin/analytics/users/training-needed
```

Response:
```json
{
  "users": [
    {
      "userId": "user-123",
      "email": "john@company.com",
      "trainingPriority": "critical",
      "trainingTopics": ["PII Handling", "Prompt Injection Prevention"],
      "totalViolations": 15,
      "criticalViolations": 2,
      "highViolations": 5,
      "violationRate": 0.25
    }
  ],
  "total": 1
}
```

#### High-Risk Users
```bash
curl http://localhost:8787/admin/analytics/users/high-risk
```

#### User Details
```bash
curl http://localhost:8787/admin/analytics/users/user-123
```

Response includes:
- User metrics (violations, requests, rates)
- Recent violations (last 100)
- Training recommendations

#### Team Metrics
```bash
curl http://localhost:8787/admin/analytics/teams/engineering
```

#### Organization Metrics
```bash
curl http://localhost:8787/admin/analytics/organizations/acme-corp
```

Response includes:
- Compliance score (0-100)
- Total violations by type and threat level
- High-risk users and teams
- Users needing training

---

## Training Recommendations

### Automatic Training Assessment

Proxilion automatically identifies users who need training based on:

1. **Critical Violations**: Any critical violation triggers training
2. **High Violations**: 3+ high-severity violations
3. **Medium Violations**: 10+ medium-severity violations
4. **Violation Rate**: 10%+ of requests blocked

### Training Topics

Recommended topics based on violation types:
- **PII Handling**: 5+ PII violations
- **Prompt Injection Prevention**: 3+ injection attempts
- **Appropriate AI Usage**: 3+ toxicity violations
- **Data Loss Prevention**: 3+ DLP violations
- **Compliance Requirements**: 3+ compliance violations

---

## Browser-Based LLM Traffic

### Supported Platforms

Proxilion now intercepts browser-based LLM traffic from:
- **ChatGPT**: chat.openai.com, chatgpt.com
- **Claude**: claude.ai
- **Gemini**: gemini.google.com, bard.google.com

### DNS Configuration

To route browser traffic through Proxilion, configure DNS to redirect:

```
chat.openai.com → proxilion.company.com
claude.ai → proxilion.company.com
gemini.google.com → proxilion.company.com
```

### Session Tracking

Browser sessions are tracked via:
1. **Proxilion Session Cookie**: `proxilion_session`
2. **SSO Headers**: From corporate proxy/gateway
3. **User Identity Extraction**: From cookies, headers, JWT

---

## Deployment Scenarios

### Scenario 1: API-Only Deployment

Users make API calls with registered API keys:

```python
import openai

openai.api_base = "https://proxilion.company.com/proxy/api.openai.com"
openai.api_key = "sk-proj-abc123..."  # Registered with Proxilion

# Proxilion extracts user identity from API key
response = openai.ChatCompletion.create(...)
```

### Scenario 2: Browser-Only Deployment

Users access LLMs via browser with DNS redirect:

```
User → chat.openai.com (DNS redirects to Proxilion)
     → Proxilion extracts identity from SSO headers
     → Proxilion forwards to real chat.openai.com
     → Response flows back through Proxilion
```

### Scenario 3: Hybrid Deployment

Both API and browser traffic flow through Proxilion:

```
API Traffic:
  SDK → Proxilion (API key extraction) → OpenAI API

Browser Traffic:
  Browser → Proxilion (SSO header extraction) → ChatGPT Web UI
```

---

## Security & Privacy

### Data Handling

- **API Keys**: Only first 16 characters stored as identifier
- **Passwords**: Never stored or logged
- **PII**: Redacted from logs and analytics
- **Session Tokens**: Encrypted and time-limited

### Compliance

- **GDPR**: User data can be exported and deleted
- **HIPAA**: PHI is detected and redacted
- **SOC 2**: Audit logs for all access
- **ISO 27001**: Security controls documented

---

## Metrics & Monitoring

### Key Metrics

- `identity_extraction_success_total{source}`: Successful extractions by source
- `identity_extraction_failed_total`: Failed extractions
- `identity_extraction_duration_ms`: Extraction latency
- `browser_session_created_total{organizationId}`: New sessions
- `api_key_registered_total{organizationId}`: New API keys
- `user_analytics_violation_recorded_total{violationType,threatLevel}`: Violations

### Dashboards

Access analytics dashboards at:
- `/admin/analytics/users/training-needed`
- `/admin/analytics/users/high-risk`
- `/admin/analytics/stats`

---

## Example: Complete Setup

### 1. Register API Keys
```bash
curl -X POST http://localhost:8787/admin/api-keys/import/csv \
  -H "Content-Type: text/plain" \
  --data-binary @company-api-keys.csv
```

### 2. Configure DNS
```
chat.openai.com → proxilion.company.com
claude.ai → proxilion.company.com
```

### 3. Configure SSO Headers
```nginx
# Nginx configuration
proxy_set_header X-User-Email $remote_user;
proxy_set_header X-Organization-ID "acme-corp";
```

### 4. Monitor Analytics
```bash
# Check users needing training
curl http://localhost:8787/admin/analytics/users/training-needed

# Check high-risk users
curl http://localhost:8787/admin/analytics/users/high-risk

# Check organization compliance
curl http://localhost:8787/admin/analytics/organizations/acme-corp
```

---

## Testing

Run identity and analytics tests:
```bash
npm test -- tests/identity-extractor.test.ts
npm test -- tests/api-key-manager.test.ts
npm test -- tests/user-analytics.test.ts
```

Total: **41 new tests** covering all identity and analytics features.

---

## Next Steps

1. **Deploy Proxilion** with DNS configuration
2. **Register API keys** for your organization
3. **Configure SSO headers** from your corporate proxy
4. **Monitor dashboards** for security violations
5. **Train users** based on recommendations
6. **Track compliance** at organizational level

For more information, see:
- [Transparent Proxy Setup](./TRANSPARENT_PROXY_SETUP.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [API Documentation](./API.md)

