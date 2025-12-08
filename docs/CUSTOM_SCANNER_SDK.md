# Custom Scanner SDK

This guide covers building custom security scanners for Proxilion GRC using the Custom Scanner SDK.

---

## Overview

The Custom Scanner SDK provides a framework for creating custom security scanners that integrate with Proxilion GRC's security pipeline. Custom scanners can detect organization-specific sensitive data, custom compliance rules, or business-specific patterns.

**Use Cases:**
- Organization-specific PII patterns (employee IDs, internal codes)
- Industry-specific compliance rules
- Custom content filtering
- Business logic validation
- Integration with external classification systems

---

## Architecture

```
Proxilion GRC Pipeline
    |
    v
[Built-in Scanners]     [Custom Scanners]
- PII Scanner           - Your Scanner 1
- Compliance Scanner    - Your Scanner 2
- DLP Scanner          - Your Scanner N
    |                       |
    v                       v
[Scanner Engine] <--- CustomScannerBuilder
    |
    v
[Policy Engine]
```

Custom scanners are registered with the Scanner Engine and participate in the same pipeline as built-in scanners. Results are combined and fed into the Policy Engine.

---

## Quick Start

### Basic Pattern-Based Scanner

```typescript
import { CustomScannerBuilder, PatternConfig, ThreatLevel } from '@proxilion/sdk';

const employeeIdScanner = new CustomScannerBuilder({
  name: 'Employee ID Scanner',
  description: 'Detects employee ID patterns',
  version: '1.0.0',
})
  .addPattern({
    pattern: /EMP-\d{6}/g,
    threatLevel: ThreatLevel.HIGH,
    description: 'Employee ID detected',
    category: 'internal-pii',
  })
  .build();

// Register with scanner engine
scannerEngine.register(employeeIdScanner);
```

### Scanner with Custom Logic

```typescript
const customScanner = new CustomScannerBuilder({
  name: 'Business Rules Scanner',
  description: 'Custom business logic validation',
  version: '1.0.0',
})
  .withCustomLogic(async (request, response) => {
    const findings = [];

    // Extract text from request
    const texts = ScannerUtils.extractTextContent(request);

    for (const text of texts) {
      // Custom detection logic
      if (text.includes('PROJECT_CODENAME')) {
        findings.push(ScannerUtils.createFinding({
          type: 'confidential-project',
          severity: ThreatLevel.CRITICAL,
          message: 'Confidential project codename detected',
          evidence: 'PROJECT_CODENAME',
        }));
      }
    }

    return findings;
  })
  .build();
```

---

## SDK Components

### CustomScannerBuilder

The main class for building custom scanners.

```typescript
interface ScannerConfig {
  name: string;          // Scanner display name
  description: string;   // Scanner description
  version: string;       // Semantic version
  enabled?: boolean;     // Enable/disable (default: true)
  timeout?: number;      // Scan timeout in ms (default: 5000)
  priority?: number;     // Execution priority (default: 50)
}

const builder = new CustomScannerBuilder(config);
```

**Methods:**

| Method | Description |
|--------|-------------|
| `addPattern(pattern)` | Add a single pattern to match |
| `addPatterns(patterns[])` | Add multiple patterns |
| `withCustomLogic(fn)` | Add custom scanning logic |
| `build()` | Build the scanner instance |

### PatternConfig

Configuration for pattern-based detection.

```typescript
interface PatternConfig {
  pattern: RegExp;           // Regular expression to match
  threatLevel: ThreatLevel;  // Severity if matched
  description: string;       // Human-readable description
  category?: string;         // Optional category for grouping
}
```

### ThreatLevel

Enumeration of threat severity levels.

```typescript
enum ThreatLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}
```

### Finding

Structure returned when a pattern or logic matches.

```typescript
interface Finding {
  type: string;                    // Finding type/category
  severity: ThreatLevel;           // Threat level
  message: string;                 // Description
  location?: { path: string };     // Where found
  evidence?: string;               // Matched content
  confidence: number;              // 0.0 - 1.0
}
```

---

## ScannerUtils

Utility functions for scanner development.

### extractTextContent

Extract all text content from a request.

```typescript
const texts: string[] = ScannerUtils.extractTextContent(request);
// Returns array of text strings from all messages
```

### extractResponseContent

Extract text from a response.

```typescript
const texts: string[] = ScannerUtils.extractResponseContent(response);
```

### containsKeywords

Check if text contains any keywords.

```typescript
const hasKeyword = ScannerUtils.containsKeywords(
  text,
  ['confidential', 'secret', 'internal'],
  false  // case-insensitive
);
```

### countMatches

Count pattern occurrences.

```typescript
const count = ScannerUtils.countMatches(text, /SSN-\d{9}/g);
```

### createFinding

Create a properly formatted finding.

```typescript
const finding = ScannerUtils.createFinding({
  type: 'custom-pii',
  severity: ThreatLevel.HIGH,
  message: 'Custom PII detected',
  location: 'message[0]',
  evidence: 'matched-text',
  confidence: 0.95,
});
```

---

## PatternLibrary

Pre-built pattern collections for common use cases.

### Available Libraries

| Library | Description |
|---------|-------------|
| `PatternLibrary.SENSITIVE_DATA` | Email, SSN, credit cards |
| `PatternLibrary.SQL_INJECTION` | SQL injection patterns |
| `PatternLibrary.CODE_INJECTION` | Code execution patterns |
| `PatternLibrary.PROFANITY` | Basic profanity detection |

### Using Pattern Libraries

```typescript
const scanner = new CustomScannerBuilder({
  name: 'Combined Scanner',
  description: 'Multiple pattern types',
  version: '1.0.0',
})
  .addPatterns(PatternLibrary.SENSITIVE_DATA)
  .addPatterns(PatternLibrary.SQL_INJECTION)
  .build();
```

### Extending Pattern Libraries

```typescript
const customPatterns: PatternConfig[] = [
  ...PatternLibrary.SENSITIVE_DATA,
  {
    pattern: /ACME-\d{8}/g,
    threatLevel: ThreatLevel.HIGH,
    description: 'ACME Corp customer ID detected',
    category: 'customer-pii',
  },
];
```

---

## Examples

### Example 1: Healthcare PII Scanner

```typescript
const healthcarePIIScanner = new CustomScannerBuilder({
  name: 'Healthcare PII Scanner',
  description: 'HIPAA-relevant identifiers',
  version: '1.0.0',
  priority: 90, // High priority
})
  .addPatterns([
    {
      pattern: /\b[A-Z]{3}\d{2}-\d{2}-\d{4}\b/g, // Medical Record Number
      threatLevel: ThreatLevel.CRITICAL,
      description: 'Medical Record Number (MRN) detected',
      category: 'phi',
    },
    {
      pattern: /\bRx\d{7,10}\b/g, // Prescription number
      threatLevel: ThreatLevel.HIGH,
      description: 'Prescription number detected',
      category: 'phi',
    },
    {
      pattern: /\b(diagnosis|treatment|medication):\s*[^\n]{10,}/gi,
      threatLevel: ThreatLevel.CRITICAL,
      description: 'Medical information detected',
      category: 'phi',
    },
  ])
  .build();
```

### Example 2: Financial Data Scanner

```typescript
const financialScanner = new CustomScannerBuilder({
  name: 'Financial Data Scanner',
  description: 'PCI-DSS relevant data',
  version: '1.0.0',
})
  .addPatterns([
    {
      pattern: /\bACCT[-\s]?\d{10,16}\b/gi,
      threatLevel: ThreatLevel.HIGH,
      description: 'Account number detected',
      category: 'financial',
    },
    {
      pattern: /\b(balance|amount):\s*\$[\d,]+\.?\d{0,2}\b/gi,
      threatLevel: ThreatLevel.MEDIUM,
      description: 'Financial amount detected',
      category: 'financial',
    },
  ])
  .withCustomLogic(async (request) => {
    const findings = [];
    const texts = ScannerUtils.extractTextContent(request);

    for (const text of texts) {
      // Check for combined financial keywords
      const hasAccountNumber = /account\s*number/i.test(text);
      const hasRoutingNumber = /routing\s*number/i.test(text);

      if (hasAccountNumber && hasRoutingNumber) {
        findings.push(ScannerUtils.createFinding({
          type: 'wire-transfer-info',
          severity: ThreatLevel.CRITICAL,
          message: 'Wire transfer information detected',
          confidence: 0.95,
        }));
      }
    }

    return findings;
  })
  .build();
```

### Example 3: Source Code Scanner

```typescript
const sourceCodeScanner = new CustomScannerBuilder({
  name: 'Source Code Scanner',
  description: 'Detects proprietary code patterns',
  version: '1.0.0',
})
  .addPatterns([
    {
      pattern: /\/\/\s*TODO:\s*[^\n]+/g,
      threatLevel: ThreatLevel.LOW,
      description: 'TODO comment detected',
      category: 'code',
    },
    {
      pattern: /\/\/\s*FIXME:\s*[^\n]+/g,
      threatLevel: ThreatLevel.LOW,
      description: 'FIXME comment detected',
      category: 'code',
    },
    {
      pattern: /Copyright\s+\d{4}\s+[A-Za-z\s]+/gi,
      threatLevel: ThreatLevel.MEDIUM,
      description: 'Copyright notice detected',
      category: 'ip',
    },
    {
      pattern: /class\s+[A-Z][a-zA-Z]+\s*{[\s\S]*?}/g,
      threatLevel: ThreatLevel.MEDIUM,
      description: 'Class definition detected',
      category: 'code',
    },
  ])
  .build();
```

### Example 4: External API Integration

```typescript
const externalClassifierScanner = new CustomScannerBuilder({
  name: 'External Classifier',
  description: 'Integrates with external ML classifier',
  version: '1.0.0',
  timeout: 10000, // Longer timeout for API calls
})
  .withCustomLogic(async (request) => {
    const findings = [];
    const texts = ScannerUtils.extractTextContent(request);

    for (const text of texts) {
      try {
        // Call external classification API
        const response = await fetch('https://classifier.internal/api/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        const result = await response.json();

        if (result.classifications) {
          for (const classification of result.classifications) {
            if (classification.score > 0.8) {
              findings.push(ScannerUtils.createFinding({
                type: classification.category,
                severity: mapScoreToThreatLevel(classification.score),
                message: `External classifier: ${classification.label}`,
                evidence: text.substring(0, 100),
                confidence: classification.score,
              }));
            }
          }
        }
      } catch (error) {
        // Log but don't fail the scan
        console.error('External classifier error:', error);
      }
    }

    return findings;
  })
  .build();

function mapScoreToThreatLevel(score: number): ThreatLevel {
  if (score > 0.95) return ThreatLevel.CRITICAL;
  if (score > 0.85) return ThreatLevel.HIGH;
  if (score > 0.7) return ThreatLevel.MEDIUM;
  return ThreatLevel.LOW;
}
```

---

## Testing Custom Scanners

### Unit Testing

```typescript
import { describe, it, expect } from 'vitest';
import { CustomScannerBuilder, ThreatLevel } from '@proxilion/sdk';

describe('Employee ID Scanner', () => {
  const scanner = new CustomScannerBuilder({
    name: 'Employee ID Scanner',
    description: 'Test scanner',
    version: '1.0.0',
  })
    .addPattern({
      pattern: /EMP-\d{6}/g,
      threatLevel: ThreatLevel.HIGH,
      description: 'Employee ID detected',
    })
    .build();

  it('should detect employee IDs', async () => {
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'My employee ID is EMP-123456' },
      ],
    };

    const result = await scanner.scan(request);

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].severity).toBe(ThreatLevel.HIGH);
  });

  it('should pass when no employee IDs present', async () => {
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello, how are you?' },
      ],
    };

    const result = await scanner.scan(request);

    expect(result.passed).toBe(true);
    expect(result.findings.length).toBe(0);
  });
});
```

### False Positive Testing

```typescript
describe('False Positive Prevention', () => {
  it('should not match similar but invalid patterns', async () => {
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Employee: John Doe' }, // No ID
        { role: 'user', content: 'EMP-12345' }, // Too short
        { role: 'user', content: 'emp-123456' }, // Wrong case
      ],
    };

    const result = await scanner.scan(request);
    expect(result.passed).toBe(true);
  });
});
```

### Performance Testing

```typescript
describe('Performance', () => {
  it('should complete scan within timeout', async () => {
    const largeRequest = {
      provider: 'openai',
      model: 'gpt-4',
      messages: Array(100).fill({
        role: 'user',
        content: 'Lorem ipsum '.repeat(1000),
      }),
    };

    const startTime = Date.now();
    await scanner.scan(largeRequest);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000); // 5 second timeout
  });
});
```

---

## Registration and Configuration

### Registering with Scanner Engine

```typescript
import { ScannerEngine } from '@proxilion/core';

const engine = new ScannerEngine();

// Register custom scanner
engine.register(myCustomScanner);

// Or register multiple
engine.registerAll([scanner1, scanner2, scanner3]);
```

### Runtime Configuration

```typescript
// Enable/disable at runtime
scanner.enabled = false;

// Adjust priority
scanner.priority = 100; // Higher = runs earlier

// Adjust timeout
scanner.timeout = 10000; // 10 seconds
```

### Hot Reloading

```typescript
// Replace scanner without restart
engine.unregister('my-scanner-id');
engine.register(newVersionScanner);
```

---

## Performance Considerations

### Efficient Pattern Matching

1. **Use non-capturing groups when possible**
   ```typescript
   // Better
   pattern: /(?:EMP|EMPLOYEE)-\d{6}/g

   // Worse (captures unnecessarily)
   pattern: /(EMP|EMPLOYEE)-\d{6}/g
   ```

2. **Anchor patterns when possible**
   ```typescript
   // Better (anchored)
   pattern: /^EMP-\d{6}$/g

   // Worse (scans entire string)
   pattern: /EMP-\d{6}/g
   ```

3. **Avoid catastrophic backtracking**
   ```typescript
   // Dangerous (exponential backtracking)
   pattern: /(a+)+$/

   // Safe
   pattern: /a+$/
   ```

### Caching Strategies

```typescript
const scanner = new CustomScannerBuilder({
  name: 'Cached Scanner',
  description: 'Uses caching',
  version: '1.0.0',
})
  .withCustomLogic(async (request) => {
    const cacheKey = computeCacheKey(request);

    // Check cache
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Expensive operation
    const findings = await expensiveDetection(request);

    // Cache result
    await cache.set(cacheKey, findings, { ttl: 300 });

    return findings;
  })
  .build();
```

### Timeout Handling

```typescript
const scanner = new CustomScannerBuilder({
  name: 'Timeout-Safe Scanner',
  description: 'Handles timeouts gracefully',
  version: '1.0.0',
  timeout: 5000,
})
  .withCustomLogic(async (request) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const result = await fetchWithAbort(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return processResult(result);
    } catch (error) {
      if (error.name === 'AbortError') {
        // Return safe default on timeout
        return [];
      }
      throw error;
    }
  })
  .build();
```

---

## Debugging

### Enable Debug Logging

```typescript
const scanner = new CustomScannerBuilder({
  name: 'Debug Scanner',
  description: 'With debug logging',
  version: '1.0.0',
})
  .withCustomLogic(async (request) => {
    console.debug('Scanner input:', JSON.stringify(request));

    const findings = [];
    // ... detection logic

    console.debug('Scanner output:', JSON.stringify(findings));
    return findings;
  })
  .build();
```

### Metrics Collection

```typescript
import { MetricsCollector } from '@proxilion/core';

const metrics = MetricsCollector.getInstance();

const scanner = new CustomScannerBuilder({
  name: 'Instrumented Scanner',
  description: 'With metrics',
  version: '1.0.0',
})
  .withCustomLogic(async (request) => {
    const startTime = Date.now();
    metrics.increment('custom_scanner_invocations_total');

    try {
      const findings = await detect(request);

      metrics.histogram('custom_scanner_duration_ms', Date.now() - startTime);
      metrics.increment('custom_scanner_findings_total', findings.length);

      return findings;
    } catch (error) {
      metrics.increment('custom_scanner_errors_total');
      throw error;
    }
  })
  .build();
```

---

## Limitations

1. **No State Persistence** - Scanners are stateless. Use external storage for state.

2. **Timeout Enforcement** - Scanners that exceed timeout are terminated. Plan accordingly.

3. **No Direct Database Access** - Use external APIs for database lookups.

4. **Limited to Text** - SDK is optimized for text content. Binary content requires custom handling.

5. **Single-Threaded** - JavaScript execution is single-threaded. CPU-intensive operations block.

---

## Next Steps

- [Setup Guide](SETUP.md)
- [Architecture](ARCHITECTURE.md)
- [Response Scanning](RESPONSE_SCANNING.md)
