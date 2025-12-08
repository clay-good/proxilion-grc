# Migration Guide

This guide covers migrating from other AI security solutions to Proxilion GRC.

---

## Overview

Proxilion GRC is designed to integrate with or replace existing security solutions. This guide covers common migration scenarios and provides step-by-step instructions.

**Migration Scenarios:**
- Generic HTTP/HTTPS proxy
- Cloud Access Security Broker (CASB)
- Data Loss Prevention (DLP) solutions
- API gateways
- Custom proxy implementations

---

## Pre-Migration Assessment

### Step 1: Document Current State

Before migrating, document your current setup:

1. **Traffic Flow**
   - How is traffic currently routed?
   - What domains are intercepted?
   - What authentication is used?

2. **Security Policies**
   - What data types are blocked/flagged?
   - What are the current threat levels?
   - Who receives alerts?

3. **Integrations**
   - SIEM connections
   - Alerting systems
   - Reporting tools
   - User directories

4. **Performance Baselines**
   - Current latency overhead
   - Request throughput
   - Error rates

### Step 2: Inventory Current Rules

Export and document all current security rules:

```
Rule ID | Description | Action | Priority | Enabled
--------|-------------|--------|----------|--------
001     | Block SSN   | BLOCK  | High     | Yes
002     | Alert PII   | ALERT  | Medium   | Yes
...
```

### Step 3: Gap Analysis

Compare current capabilities with Proxilion GRC:

| Feature | Current Solution | Proxilion GRC | Notes |
|---------|-----------------|---------------|-------|
| PII Detection | Yes (10 types) | Yes (30+ types) | More coverage |
| Compliance | GDPR, HIPAA | 23+ standards | More coverage |
| AI Provider Support | OpenAI only | 6 providers | More coverage |
| SIEM Integration | Splunk | 5 vendors | More options |

---

## Migration from Generic HTTP Proxy

### Current State

Typical generic proxy setup:

```
Clients --> Generic Proxy (Squid, NGINX) --> Internet
              |
              +-- Access logs
              +-- Basic filtering
```

### Migration Steps

1. **Deploy Proxilion GRC alongside existing proxy**

   ```bash
   # Deploy Proxilion
   docker run -d \
     --name proxilion \
     -p 8787:8787 \
     -p 8788:8788 \
     proxilion:latest
   ```

2. **Configure Proxilion for AI domains only**

   Update existing proxy to forward AI traffic to Proxilion:

   ```nginx
   # NGINX configuration
   upstream proxilion {
     server proxilion:8787;
   }

   server {
     listen 8080;

     # Route AI traffic to Proxilion
     location ~ ^/(api\.openai\.com|api\.anthropic\.com) {
       proxy_pass http://proxilion;
     }

     # Other traffic direct
     location / {
       proxy_pass $scheme://$host$request_uri;
     }
   }
   ```

3. **Test parallel operation**

   ```bash
   # Test through Proxilion
   curl -x http://localhost:8787 https://api.openai.com/v1/models
   ```

4. **Migrate traffic gradually**

   - Start with test users/groups
   - Monitor for issues
   - Expand to full organization

5. **Retire generic proxy for AI traffic**

   Once validated, update DNS/routing to bypass old proxy for AI domains.

---

## Migration from CASB Solutions

### Common CASB Features to Map

| CASB Feature | Proxilion GRC Equivalent |
|--------------|-------------------------|
| DLP policies | PII Scanner + Compliance Scanner |
| App visibility | Usage Analytics |
| Threat protection | Response Scanner + DLP Scanner |
| Data governance | Policy Engine |
| Compliance monitoring | Compliance Scanner + Reporting |

### Migration Steps

1. **Export CASB policies**

   Most CASBs support policy export. Export as CSV/JSON.

2. **Map policies to Proxilion format**

   Example mapping:

   CASB Policy:
   ```json
   {
     "name": "Block Credit Cards",
     "condition": "content_matches('credit_card')",
     "action": "block"
   }
   ```

   Proxilion Policy:
   ```json
   {
     "id": "block-credit-cards",
     "name": "Block Credit Cards",
     "enabled": true,
     "priority": 100,
     "conditions": [
       {
         "type": "scanner",
         "scanner": "pii-scanner",
         "pattern": "Credit Card"
       }
     ],
     "actions": [
       { "type": "BLOCK" },
       { "type": "LOG" }
     ]
   }
   ```

3. **Import policies via API**

   ```bash
   curl -X POST http://localhost:8788/api/policies \
     -H "Content-Type: application/json" \
     -d @converted-policies.json
   ```

4. **Configure SIEM forwarding**

   Point SIEM integration to same endpoint as CASB:

   ```bash
   curl -X POST http://localhost:8788/api/integrations/siem \
     -H "Content-Type: application/json" \
     -d '{
       "vendor": "SPLUNK",
       "endpoint": "https://splunk.example.com:8088/services/collector",
       "token": "your-hec-token"
     }'
   ```

5. **Parallel run period**

   Run both solutions for 2-4 weeks:
   - Compare detection rates
   - Verify alert parity
   - Check false positive rates

---

## Migration from DLP Solutions

### DLP Features to Map

| DLP Feature | Proxilion GRC Equivalent |
|-------------|-------------------------|
| Content inspection | PII Scanner, DLP Scanner |
| Policy enforcement | Policy Engine |
| Incident management | Audit Logs + SIEM |
| Endpoint agents | Not applicable (proxy-based) |
| Email scanning | Not applicable (AI-focused) |

### Migration Steps

1. **Identify AI-related DLP rules**

   Filter DLP rules that apply to AI services:
   - Rules targeting api.openai.com
   - Rules for AI-related content
   - Generic PII rules

2. **Convert DLP patterns to Proxilion format**

   DLP Pattern:
   ```
   Name: SSN Detection
   Pattern: \d{3}-\d{2}-\d{4}
   Action: Block
   Severity: High
   ```

   Proxilion Pattern (already built-in):
   ```typescript
   // SSN detection is built into pii-scanner
   // Configure via /api/scanners/pii-scanner/patterns
   ```

3. **Add custom patterns not in Proxilion**

   ```bash
   curl -X POST http://localhost:8788/api/patterns \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Custom DLP Pattern",
       "pattern": "YOUR_CUSTOM_REGEX",
       "severity": "HIGH",
       "category": "custom-dlp"
     }'
   ```

4. **Configure response scanning**

   DLP often scans responses too:

   ```bash
   # Enable response scanning
   curl -X PATCH http://localhost:8788/api/scanners/response-scanner \
     -H "Content-Type: application/json" \
     -d '{"enabled": true}'
   ```

---

## Migration from API Gateways

### API Gateway Features to Map

| API Gateway Feature | Proxilion GRC Equivalent |
|--------------------|-------------------------|
| Rate limiting | Rate Limiter |
| Authentication | Auth Integration |
| Request validation | Validation Scanner |
| Logging | Audit Logs |
| Transformations | Limited (not primary focus) |

### Migration Steps

1. **Deploy Proxilion behind API Gateway**

   ```
   Clients --> API Gateway --> Proxilion GRC --> AI Providers
   ```

2. **Move AI-specific logic to Proxilion**

   API Gateway handles:
   - Authentication
   - General rate limiting
   - Routing

   Proxilion handles:
   - AI security scanning
   - AI-specific rate limiting
   - AI provider management

3. **Configure pass-through authentication**

   ```bash
   # Configure Proxilion to accept pre-authenticated requests
   export AUTH_METHOD=HEADER_PASSTHROUGH
   export AUTH_HEADER=X-Authenticated-User
   ```

---

## Policy Migration Templates

### Converting Common Policy Types

#### Block All PII

Generic:
```
IF content contains PII THEN block
```

Proxilion:
```json
{
  "id": "block-all-pii",
  "name": "Block All PII",
  "enabled": true,
  "priority": 100,
  "conditions": [
    { "type": "threat_level", "level": "MEDIUM", "operator": "gte" }
  ],
  "actions": [
    { "type": "BLOCK" }
  ]
}
```

#### Alert on Sensitive Topics

Generic:
```
IF content mentions sensitive_topics THEN alert
```

Proxilion:
```json
{
  "id": "alert-sensitive",
  "name": "Alert Sensitive Topics",
  "enabled": true,
  "priority": 50,
  "conditions": [
    { "type": "scanner", "scanner": "compliance-scanner", "category": "HIPAA" }
  ],
  "actions": [
    { "type": "ALERT" },
    { "type": "LOG" }
  ]
}
```

#### Rate Limit by User

Generic:
```
Limit user to 100 requests per hour
```

Proxilion:
```json
{
  "algorithm": "token-bucket",
  "maxRequests": 100,
  "windowMs": 3600000,
  "burstSize": 120
}
```

---

## Phased Rollout Approach

### Phase 1: Pilot (Week 1-2)

1. Select pilot group (5-10% of users)
2. Deploy Proxilion in parallel with existing solution
3. Route pilot traffic through Proxilion
4. Monitor and compare results

**Success Criteria:**
- No service disruptions
- Detection rates within 10% of baseline
- Latency overhead < 20ms

### Phase 2: Expand (Week 3-4)

1. Expand to 25-50% of users
2. Begin migrating policies from old solution
3. Configure SIEM to receive from both sources
4. Train operations team

**Success Criteria:**
- All critical policies migrated
- Operations team self-sufficient
- No critical incidents

### Phase 3: Full Migration (Week 5-6)

1. Migrate remaining users
2. Complete policy migration
3. Parallel run for validation
4. Document any gaps

**Success Criteria:**
- 100% traffic through Proxilion
- All policies migrated and validated
- Runbook documented

### Phase 4: Cutover (Week 7-8)

1. Disable old solution
2. Update DNS/routing
3. Monitor closely
4. Maintain rollback capability

**Success Criteria:**
- Old solution retired
- No increase in incidents
- Performance targets met

---

## Rollback Plan

### Preparation

1. **Keep old solution running but idle**
   - Maintain configuration
   - Keep certificates valid
   - Preserve policies

2. **Document rollback procedure**

3. **Test rollback process**

### Rollback Steps

1. **Update DNS/routing to bypass Proxilion**

   ```bash
   # Revert DNS changes
   # Update proxy configuration
   # Restart services
   ```

2. **Verify traffic flow**

   ```bash
   # Check traffic is bypassing Proxilion
   curl -v https://api.openai.com/v1/models
   ```

3. **Re-enable old solution policies**

4. **Notify stakeholders**

---

## Validation Checklist

### Functional Validation

- [ ] All AI providers accessible through Proxilion
- [ ] PII detection working correctly
- [ ] Compliance rules enforced
- [ ] Policies executing as expected
- [ ] SIEM receiving events
- [ ] Alerts being generated
- [ ] Dashboard showing metrics

### Performance Validation

- [ ] Latency within acceptable range
- [ ] No timeout errors
- [ ] Throughput meets requirements
- [ ] Error rates within baseline

### Security Validation

- [ ] All previous detections still triggered
- [ ] No false negative increase
- [ ] Response scanning working
- [ ] Audit logs complete

### Operational Validation

- [ ] Runbooks documented
- [ ] Team trained
- [ ] Escalation paths defined
- [ ] Monitoring alerts configured

---

## Common Migration Challenges

### Challenge 1: Policy Syntax Differences

**Problem:** Existing policies don't map cleanly to Proxilion format.

**Solution:** Create intermediate translation layer or manually convert complex policies.

### Challenge 2: Missing Features

**Problem:** Current solution has features Proxilion doesn't support.

**Solution:** Document gaps, implement workarounds, or request features.

### Challenge 3: Integration Differences

**Problem:** SIEM integration expects different event format.

**Solution:** Use transformation in SIEM or configure Proxilion event format.

### Challenge 4: Certificate Distribution

**Problem:** Users need new CA certificate.

**Solution:** Deploy via MDM/Group Policy before cutover.

### Challenge 5: Performance Impact

**Problem:** Higher latency than expected.

**Solution:** Review configuration, enable caching, optimize policies.

---

## Next Steps

- [Setup Guide](SETUP.md)
- [Policy Engine](ARCHITECTURE.md)
- [SIEM Integration](ENTERPRISE_INTEGRATION.md)
