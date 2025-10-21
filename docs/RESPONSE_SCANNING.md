# Response Content Scanning and Redaction

## Overview

Proxilion's Response Scanning system provides comprehensive protection by scanning AI responses for sensitive data, harmful content, and policy violations **before** returning them to users. This critical security layer prevents data leakage, ensures compliance, and protects users from harmful AI-generated content.

## Features

### ✅ Response Scanner
- **PII Detection**: SSN, email, phone, credit cards, IP addresses, passports
- **Credential Detection**: API keys, AWS keys, private keys, passwords, tokens, JWTs
- **Harmful Content Detection**: Violence, hate speech, self-harm, illegal activities, exploitation
- **Malicious Code Detection**: SQL injection, XSS, command injection, path traversal
- **Prompt Leakage Detection**: System prompts, instructions exposure
- **Automatic Redaction**: Mask, remove, or replace sensitive content
- **Threat Level Assessment**: NONE, LOW, MEDIUM, HIGH, CRITICAL

### ✅ Response Filter
- **Threat-Based Blocking**: Block responses based on threat level
- **Content Moderation**: Clean up formatting and control characters
- **Length Limits**: Enforce maximum response length
- **Keyword Filtering**: Block specific keywords or phrases
- **Disclaimer Injection**: Add required disclaimers to responses
- **Configurable Actions**: Allow, modify, or block responses

### ✅ Response Audit Logger
- **Complete Audit Trail**: Log all scanning and filtering activities
- **Compliance Tracking**: Track redactions for regulatory compliance
- **Query Capabilities**: Search audit logs by user, time, threat level
- **Statistics**: Aggregate metrics on findings and redactions
- **Export**: Export audit logs for external analysis

## Quick Start

### 1. Initialize Response Scanner

```typescript
import { ResponseScanner } from './response/response-scanner.js';

const scanner = new ResponseScanner({
  enablePiiDetection: true,
  enableCredentialDetection: true,
  enableHarmfulContentDetection: true,
  enableMaliciousCodeDetection: true,
  enablePromptLeakageDetection: true,
  autoRedact: true,
  redactionStrategy: 'mask', // 'mask', 'remove', or 'replace'
  redactionPlaceholder: '[REDACTED]',
  logFindings: true,
  collectMetrics: true,
});
```

### 2. Scan AI Response

```typescript
// Scan response from AI provider
const scanResult = await scanner.scanResponse(aiResponse);

console.log('Safe:', scanResult.safe);
console.log('Threat Level:', scanResult.threatLevel);
console.log('Findings:', scanResult.findings.length);
console.log('Redactions:', scanResult.metadata.redactionsCount);

// Use redacted response if available
const safeResponse = scanResult.redactedResponse || aiResponse;
```

### 3. Apply Response Filter

```typescript
import { ResponseFilter } from './response/response-filter.js';

const filter = new ResponseFilter({
  blockOnCritical: true,
  blockOnHigh: false,
  warnOnMedium: true,
  maxContentLength: 10000,
  blockedKeywords: ['confidential', 'internal'],
  requiredDisclaimer: 'AI-generated content. Verify before use.',
  enableContentModeration: true,
  enableLengthLimits: true,
  enableKeywordFiltering: true,
});

const filterResult = await filter.filterResponse(aiResponse, scanResult);

if (filterResult.blocked) {
  console.log('Response blocked:', filterResult.reason);
  return filterResult.response; // Returns blocked message
}

if (filterResult.modified) {
  console.log('Response modified. Filters:', filterResult.appliedFilters);
}

return filterResult.response;
```

### 4. Log Audit Entry

```typescript
import { ResponseAuditLogger } from './response/response-audit-logger.js';

const auditLogger = new ResponseAuditLogger({
  maxLogSize: 10000,
  retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
});

auditLogger.logAudit(aiResponse, scanResult, filterResult, {
  correlationId: 'req-123',
  userId: 'user-456',
  provider: 'openai',
  model: 'gpt-4',
});

// Query audit logs
const recentBlocked = auditLogger.queryAuditLog({
  blocked: true,
  limit: 10,
});

// Get statistics
const stats = auditLogger.getStatistics();
console.log('Total responses:', stats.totalResponses);
console.log('Blocked:', stats.blockedResponses);
console.log('Redactions:', stats.redactionsCount);
```

## Detection Examples

### PII Detection

```typescript
// Input: "Your SSN is 123-45-6789"
// Finding: { type: 'pii', severity: 'HIGH', value: '123-45-6789' }
// Redacted: "Your SSN is [REDACTED]"

// Input: "Email me at john@example.com"
// Finding: { type: 'pii', severity: 'HIGH', value: 'john@example.com' }
// Redacted: "Email me at [REDACTED]"

// Input: "Call (555) 123-4567"
// Finding: { type: 'pii', severity: 'HIGH', value: '(555) 123-4567' }
// Redacted: "Call [REDACTED]"
```

### Credential Detection

```typescript
// Input: "API key: sk_test_1234567890abcdefghijklmnopqrstuvwxyz"
// Finding: { type: 'credentials', severity: 'CRITICAL' }
// Redacted: "API key: [REDACTED]"

// Input: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
// Finding: { type: 'credentials', severity: 'CRITICAL' }
// Redacted: "AWS_ACCESS_KEY_ID=[REDACTED]"

// Input: "-----BEGIN RSA PRIVATE KEY-----"
// Finding: { type: 'credentials', severity: 'CRITICAL' }
// Redacted: "[REDACTED]"
```

### Harmful Content Detection

```typescript
// Input: "You should kill people who disagree"
// Finding: { type: 'harmful_content', severity: 'CRITICAL' }
// Action: BLOCKED

// Input: "Consider suicide if depressed"
// Finding: { type: 'harmful_content', severity: 'CRITICAL' }
// Action: BLOCKED

// Input: "How to make a bomb"
// Finding: { type: 'harmful_content', severity: 'CRITICAL' }
// Action: BLOCKED
```

## Scan Result Structure

```typescript
interface ResponseScanResult {
  safe: boolean;                    // Overall safety assessment
  threatLevel: ThreatLevel;         // NONE, LOW, MEDIUM, HIGH, CRITICAL
  findings: ResponseFinding[];      // All detected issues
  redactedResponse?: UnifiedAIResponse;  // Redacted version
  originalContent?: string;         // Original content (for audit)
  metadata: {
    scannedAt: number;
    duration: number;
    findingsCount: number;
    redactionsCount: number;
  };
}

interface ResponseFinding {
  type: ResponseFindingType;        // pii, credentials, harmful_content, etc.
  severity: ThreatLevel;            // Threat level for this finding
  field: string;                    // Field where found
  value: string;                    // Detected value
  redacted: boolean;                // Whether it was redacted
  position: {
    start: number;
    end: number;
  };
  reason: string;                   // Human-readable reason
}
```

## Filter Result Structure

```typescript
interface FilterResult {
  allowed: boolean;                 // Whether response is allowed
  modified: boolean;                // Whether response was modified
  blocked: boolean;                 // Whether response was blocked
  response: UnifiedAIResponse;      // Final response (blocked or modified)
  reason?: string;                  // Reason for blocking
  appliedFilters: string[];         // List of applied filters
  metadata: {
    filteredAt: number;
    duration: number;
  };
}
```

## Configuration Options

### Response Scanner Config

```typescript
{
  enablePiiDetection: true,              // Detect PII
  enableCredentialDetection: true,       // Detect credentials
  enableHarmfulContentDetection: true,   // Detect harmful content
  enablePolicyViolation: true,           // Check policy violations
  enableDataLeakageDetection: true,      // Detect data leakage
  enableMaliciousCodeDetection: true,    // Detect malicious code
  enablePromptLeakageDetection: true,    // Detect prompt leakage
  autoRedact: true,                      // Automatically redact findings
  redactionStrategy: 'mask',             // 'mask', 'remove', 'replace'
  redactionPlaceholder: '[REDACTED]',    // Placeholder text
  logFindings: true,                     // Log findings
  collectMetrics: true                   // Collect metrics
}
```

### Response Filter Config

```typescript
{
  blockOnCritical: true,                 // Block CRITICAL threats
  blockOnHigh: false,                    // Block HIGH threats
  warnOnMedium: true,                    // Warn on MEDIUM threats
  maxContentLength: 10000,               // Max response length
  allowedContentTypes: ['text', 'code'], // Allowed content types
  blockedKeywords: ['secret', 'internal'], // Blocked keywords
  requiredDisclaimer: 'AI-generated...',  // Required disclaimer
  enableContentModeration: true,         // Enable moderation
  enableLengthLimits: true,              // Enable length limits
  enableKeywordFiltering: true           // Enable keyword filtering
}
```

## Audit Log Queries

```typescript
// Query by user
const userLogs = auditLogger.queryAuditLog({
  userId: 'user-123',
  limit: 100,
});

// Query by time range
const recentLogs = auditLogger.queryAuditLog({
  startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
  endTime: Date.now(),
});

// Query blocked responses
const blockedLogs = auditLogger.queryAuditLog({
  blocked: true,
  limit: 50,
});

// Query by threat level
const criticalLogs = auditLogger.queryAuditLog({
  threatLevel: 'CRITICAL',
});

// Query by provider
const openaiLogs = auditLogger.queryAuditLog({
  provider: 'openai',
  model: 'gpt-4',
});
```

## Statistics and Reporting

```typescript
const stats = auditLogger.getStatistics({
  startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
});

console.log('Total Responses:', stats.totalResponses);
console.log('Blocked:', stats.blockedResponses);
console.log('Modified:', stats.modifiedResponses);
console.log('Redactions:', stats.redactionsCount);

// Findings by type
console.log('PII:', stats.findingsByType.pii);
console.log('Credentials:', stats.findingsByType.credentials);
console.log('Harmful:', stats.findingsByType.harmful_content);

// Top users with findings
console.log('Top Users:', stats.topUsers);

// Top models with findings
console.log('Top Models:', stats.topModels);
```

## Integration with Proxilion Pipeline

```
AI Provider Response
        ↓
Response Scanner (detect sensitive content)
        ↓
Response Filter (apply policies)
        ↓
Response Audit Logger (log activity)
        ↓
Return to User
```

## Best Practices

1. **Enable All Scanners**: Start with all scanners enabled for maximum protection
2. **Auto-Redact**: Enable automatic redaction to prevent data leakage
3. **Block Critical**: Always block CRITICAL threat level responses
4. **Log Everything**: Enable logging for compliance and forensics
5. **Monitor Statistics**: Regularly review statistics to identify patterns
6. **Tune Filters**: Adjust filters based on your use case and findings
7. **Export Audits**: Regularly export audit logs for external analysis
8. **Test Thoroughly**: Test with various inputs to ensure proper detection

## Performance

- **Scan Speed**: ~5-10ms per response (average)
- **Memory Usage**: ~2KB per scan result
- **Throughput**: 5,000+ scans/second
- **Audit Log**: In-memory with configurable retention

## Compliance

Response scanning helps meet compliance requirements:

- **GDPR**: Prevent PII leakage in AI responses
- **HIPAA**: Detect and redact PHI in responses
- **PCI DSS**: Prevent credit card data in responses
- **SOC 2**: Complete audit trail of all redactions
- **ISO 27001**: Data loss prevention controls

## Next Steps

1. Configure response scanner for your use case
2. Set up response filter policies
3. Enable audit logging
4. Monitor statistics and findings
5. Tune detection patterns based on results
6. Export audit logs for compliance reporting

