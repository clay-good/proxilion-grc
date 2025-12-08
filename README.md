# Proxilion GRC

**AI Security Proxy for Enterprise Governance, Risk, and Compliance**

Proxilion GRC is a security proxy that intercepts, inspects, and controls traffic to AI services (ChatGPT, Claude, Gemini, Cohere) to prevent sensitive data exposure and maintain regulatory compliance.

---

## What This Project Does

Proxilion GRC sits between users and AI providers, scanning all requests for sensitive data:

```
User Request --> Proxilion GRC --> AI Provider
                     |
              [Security Scanning]
              - PII Detection
              - Compliance Rules
              - Policy Enforcement
              - Audit Logging
```

**Supported AI Providers:**
- OpenAI (GPT-4, GPT-3.5, ChatGPT)
- Anthropic (Claude 3, Claude 2)
- Google (Gemini, PaLM)
- Cohere (Command, Generate)
- AWS Bedrock
- Azure OpenAI

---

## Deployment Options

| Method | Description |
|--------|-------------|
| **Cloudflare Workers** | Edge deployment at 300+ global locations |
| **Docker** | Single container deployment |
| **Kubernetes** | Scalable cluster deployment with HPA |
| **Self-hosted** | Direct Node.js on Linux servers |

---

## Features

### Security Scanning

**PII Detection (30+ patterns):**
- Credit cards (Visa, Mastercard, Amex, Discover) with Luhn validation
- US Social Security Numbers with area/group/serial validation
- Bank routing numbers with checksum validation
- IBAN, SWIFT codes
- Email addresses, phone numbers
- Medicare IDs, NPI, DEA numbers
- Driver's licenses, passports, tax IDs

**Compliance Standards (23+):**
- US Federal: HIPAA, PCI-DSS, SOX, GLBA, FERPA, COPPA
- US State: CCPA/CPRA, VCDPA, CPA, CTDPA, UCPA
- International: GDPR, PIPEDA, LGPD, PDPA
- Industry: SOC2, ISO 27001, NIST

### Policy Engine

- Priority-based rule evaluation
- Actions: BLOCK, ALLOW, MODIFY, ALERT, LOG, QUEUE, REDIRECT
- Configurable threat levels: NONE, LOW, MEDIUM, HIGH, CRITICAL
- Default policies included

### Enterprise Integration

- SIEM: Splunk, QRadar, ArcSight, Sentinel, Elastic
- Event formats: CEF, LEEF, JSON, Syslog
- Webhook management
- API Key and JWT authentication

### Performance

- LRU/LFU/FIFO caching (configurable)
- Request deduplication
- Rate limiting (token bucket, sliding window, fixed window, leaky bucket algorithms)
- Connection pooling
- Streaming SSE support with real-time PII redaction

### Observability

- Prometheus metrics endpoint
- OpenTelemetry tracing
- Grafana dashboards (pre-built)
- Real-time WebSocket monitoring

### Additional Features

- Multi-tenancy with isolated security contexts
- Cost tracking per user/tenant/provider/model
- Budget limits with threshold alerts
- ML-based anomaly detection (Isolation Forest, Autoencoder)
- GraphQL API gateway
- Workflow orchestration
- Prompt version management

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/proxilion/proxilion.git
cd proxilion
npm install

# Build
npm run build

# Run tests
npm test

# Start server
npm start

# Access endpoints
# Proxy: http://localhost:8787
# Admin: http://localhost:8788
# Health: http://localhost:8787/health
# Metrics: http://localhost:8787/metrics
```

### Docker

```bash
docker build -t proxilion:latest .
docker run -p 8787:8787 -p 8788:8788 proxilion:latest
```

### Docker Compose (with Prometheus/Grafana)

```bash
docker-compose up -d
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /status` | Detailed status with component info |
| `GET /metrics` | JSON metrics |
| `GET /metrics/prometheus` | Prometheus format metrics |
| `ALL /proxy/*` | Proxy endpoint for AI requests |
| `ALL /graphql` | GraphQL API gateway |
| `GET /admin/*` | Admin API endpoints |

---

## Configuration

Key environment variables:

```bash
PORT=8787                    # Proxy server port
ADMIN_PORT=8788             # Admin dashboard port
AUTH_METHOD=API_KEY         # API_KEY, JWT, or NONE
API_KEYS=key1,key2          # Comma-separated API keys
SIEM_ENABLED=false          # Enable SIEM forwarding
SIEM_VENDOR=GENERIC         # SPLUNK, QRADAR, ARCSIGHT, SENTINEL, ELASTIC
SIEM_ENDPOINT=              # SIEM endpoint URL
```

See [docs/SETUP.md](docs/SETUP.md) for complete configuration reference.

---

## Documentation

### Getting Started
| Document | Description |
|----------|-------------|
| [Quick Start](docs/QUICKSTART.md) | Fast setup guide |
| [Setup Guide](docs/SETUP.md) | Detailed deployment and configuration |
| [Architecture](docs/ARCHITECTURE.md) | System design and components |

### Security & Scanning
| Document | Description |
|----------|-------------|
| [Security](docs/SECURITY.md) | Security best practices |
| [Custom Scanner SDK](docs/CUSTOM_SCANNER_SDK.md) | Build custom security scanners |
| [Response Scanning](docs/RESPONSE_SCANNING.md) | Scan AI responses for sensitive data |
| [Validation](docs/VALIDATION.md) | Request/response validation |
| [Self-Service Patterns](docs/SELF_SERVICE_PATTERN_MANAGEMENT.md) | Manage detection patterns |

### Deployment & Operations
| Document | Description |
|----------|-------------|
| [High Availability](docs/HIGH_AVAILABILITY.md) | HA deployment guide |
| [Disaster Recovery](docs/DISASTER_RECOVERY.md) | Backup and recovery procedures |
| [Upgrade/Rollback](docs/UPGRADE_ROLLBACK.md) | Version upgrade and rollback |
| [MDM Configuration](docs/MDM_CONFIGURATION.md) | Mobile device management |
| [DNS Configuration](docs/DNS_CONFIGURATION.md) | DNS override for transparent proxy |
| [Certificate Installation](docs/CERTIFICATE_INSTALLATION.md) | Per-platform certificate setup |

### Performance & Monitoring
| Document | Description |
|----------|-------------|
| [Performance](docs/PERFORMANCE.md) | Performance characteristics |
| [Performance Optimization](docs/PERFORMANCE_OPTIMIZATION.md) | Tuning and optimization |
| [Rate Limiting API](docs/RATE_LIMITING.md) | Rate limiting configuration |
| [Observability](docs/OBSERVABILITY.md) | Prometheus, Grafana, OpenTelemetry |
| [Streaming](docs/STREAMING.md) | SSE streaming support |

### Features & Integration
| Document | Description |
|----------|-------------|
| [Advanced Features](docs/ADVANCED_FEATURES.md) | Advanced capabilities |
| [Anomaly Detection](docs/ANOMALY_DETECTION.md) | ML-based anomaly detection |
| [Enterprise Integration](docs/ENTERPRISE_INTEGRATION.md) | SIEM, webhooks, alerting |
| [GraphQL API](docs/GRAPHQL_API.md) | GraphQL API documentation |
| [User Identity & Analytics](docs/USER_IDENTITY_AND_ANALYTICS.md) | User tracking and analytics |
| [Migration Guide](docs/MIGRATION_GUIDE.md) | Migration from other solutions |
| [Release Notes](docs/RELEASE_NOTES.md) | Version history |

---

## Known Limitations and Honest Assessment

### What Works

1. **Core proxy functionality** - Request interception and forwarding works
2. **PII scanning** - 30+ patterns with validation algorithms implemented and tested
3. **Compliance scanning** - 23+ standards with rule sets
4. **Policy engine** - Priority-based evaluation and actions
5. **SIEM integration** - Event forwarding to major vendors
6. **Test coverage** - 874/874 tests passing (100%)
7. **Build system** - TypeScript compilation and bundling works
8. **Rate limiting** - Four algorithms implemented and tested
9. **Certificate rotation** - Automated expiry monitoring, renewal, and rollback
10. **Custom Scanner SDK** - Extensibility for custom security scanners

### What Has Limitations

1. **MITM Certificate Management**
   - CA generation and domain signing implemented
   - Automatic distribution to devices NOT implemented
   - Manual certificate installation required on each client device
   - Certificate rotation automation implemented (see src/certificates/certificate-rotation.ts)
   - MDM configuration guides provided but no direct MDM API integration

2. **Mobile Device Support**
   - Architecture designed but NOT production-tested
   - MDM configuration documentation provided (see docs/MDM_CONFIGURATION.md)
   - Mobile integration tests implemented (60 tests in tests/mobile-integration/)
   - No actual MDM API integration code (configuration guides only)
   - Certificate deployment to mobile devices is manual

3. **DNS Configuration**
   - Requires manual DNS server configuration
   - No built-in DNS management
   - Split-horizon DNS setup is complex and manual
   - Documentation provided (see docs/DNS_CONFIGURATION.md)

4. **Transparent Proxy Mode**
   - Works only when DNS is manually configured to point to proxy
   - Requires TLS certificate trust on all clients
   - Browser users must manually trust the CA certificate

5. **ML Anomaly Detection**
   - Isolation Forest and Autoencoder are implemented
   - Training on synthetic/default data only
   - No production validation of detection accuracy
   - May produce false positives without tuning

6. **Performance Claims**
   - "10,000+ requests/second" - NOT independently validated
   - "99.99% uptime SLA" - No actual SLA exists, this is aspirational
   - Load testing at scale (100k+ connections) not performed

7. **Web UI**
   - Dashboard server implemented
   - UI frontend build exists in `ui/` directory
   - Requires separate build step (`npm run build:ui`)
   - No authentication on admin dashboard by default

8. **High Availability**
   - Kubernetes manifests exist with anti-affinity and HPA
   - HA deployment guide provided (see docs/HIGH_AVAILABILITY.md)
   - DR documentation provided (see docs/DISASTER_RECOVERY.md)
   - Certificate rotation tests implemented (29 tests)
   - No automated DR testing in CI/CD pipeline

### What Is NOT Implemented

1. **Advanced ML** - Deep learning pattern generation not implemented
2. **Blockchain integration** - Not implemented
3. **Federated learning** - Not implemented
4. **GPU acceleration** - Not implemented
5. **Zero-knowledge proof verification** - Not implemented
6. **Automatic certificate distribution** - Not implemented
7. **MDM API integration** - Not implemented (documentation only)
8. **Security audit** - No penetration testing or SOC 2 certification
9. **Email alerting** - Alert manager has Slack, PagerDuty, Teams, webhooks but email is a placeholder
10. **Real embedding providers** - Semantic caching uses simple hash; OpenAI/Cohere embeddings not implemented
11. **Redis distributed rate limiting** - In-memory only; Redis backend documented but not implemented
12. **Database migrations** - No migration system exists despite documentation references
13. **Least-cost load balancing** - Load balancer has the option but falls back to round-robin (no cost data integration)
14. **Cross-provider request transformation** - Only OpenAI-to-Anthropic transformation is fully implemented; other provider transformations (Anthropic-to-OpenAI, Google-to-*, Cohere-to-*) are placeholder stubs that pass requests through unchanged
15. **YAML schema export** - Schema registry only exports JSON; YAML export throws "not yet implemented" error
16. **GraphQL cost-by-user queries** - costsByUser resolver returns empty array; per-user cost tracking not implemented in GraphQL layer
17. **Response content filtering** - filterContent() method in response processor is a pass-through; no ML-based or rule-based content filtering implemented

### Security Considerations

1. **No published penetration test results**
2. **No SOC 2 certification**
3. **Certificate key security depends on file permissions**
4. **No automatic security scanning in CI pipeline**
5. **No vulnerability disclosure policy**
6. **Admin dashboard has no authentication by default**
7. **CORS is permissive by default**

### Testing Limitations

1. **No end-to-end tests with real AI providers** - All tests use mocks
2. **No load testing infrastructure** - Performance claims unvalidated
3. **Mobile tests are unit tests** - No actual device testing
4. **No chaos engineering tests** - Failure modes untested

---

## Architecture

```
src/
  index.ts                 # Main entry point (Hono app)
  scanners/                # PII, compliance, DLP, toxicity scanners
  policy/                  # Policy engine and rule evaluation
  proxy/                   # Connection pool, request handler
  parsers/                 # Provider-specific request parsers
  integrations/            # SIEM, webhooks, auth, alerting
  analytics/               # Usage analytics and reporting
  anomaly/                 # ML-based anomaly detection
  cache/                   # LRU/LFU/FIFO caching
  caching/                 # Request deduplication
  certificates/            # Certificate management and rotation
  cost/                    # Cost tracking and budgets
  graphql/                 # GraphQL server and subscriptions
  streaming/               # SSE stream processing with PII redaction
  tenancy/                 # Multi-tenant isolation
  observability/           # Prometheus, OpenTelemetry, Grafana
  performance/             # Rate limiting (4 algorithms)
  admin/                   # Admin dashboard server
  batch/                   # Batch processing
  config/                  # Configuration management
  experimentation/         # A/B testing support
  health/                  # Health check endpoints
  identity/                # User identity extraction
  loadbalancer/            # Load balancing logic
  ml/                      # Machine learning models
  models/                  # Data models
  monitoring/              # Real-time monitoring
  prompts/                 # Prompt versioning
  queue/                   # Request queuing
  reporting/               # Report generation
  response/                # Response scanning
  routing/                 # Request routing
  sdk/                     # Custom scanner SDK
  transformation/          # Request/response transformation
  types/                   # TypeScript types
  utils/                   # Utilities and logging
  validation/              # Schema validation
  workflows/               # Workflow orchestration
tests/                     # 43 test files, 874 tests
  mobile-integration/      # MDM and mobile tests (60 tests)
docs/                      # 26 documentation files
ui/                        # Next.js admin dashboard
k8s/                       # Kubernetes manifests
deployment/                # Prometheus/Grafana configs
```

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/pii-scanner.test.ts
```

Current status: 874/874 tests passing (100%).

**Test Breakdown:**
- Core tests: 785 tests
- Mobile integration tests: 60 tests (tests/mobile-integration/)
- Certificate rotation tests: 29 tests (tests/certificate-rotation.test.ts)

