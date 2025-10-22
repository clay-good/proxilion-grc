# Proxilion Documentation

Complete technical documentation for Proxilion AI Security & Compliance Platform.

---

## 🚀 Getting Started

**New to Proxilion?** Start here:

1. **[Main README](../README.md)** - Overview, features, and quick start
2. **[Setup Guide](../SETUP.md)** - Complete deployment instructions (Cloudflare Workers, self-hosted, Docker, DNS, MDM, certificates)
3. **[Architecture Guide](ARCHITECTURE.md)** - Understand how Proxilion works

---

## 📚 Core Documentation

### Deployment & Configuration

| Document | Description |
|----------|-------------|
| **[Setup Guide](../SETUP.md)** | Complete deployment guide for all platforms and configurations |
| **[Architecture](ARCHITECTURE.md)** | System architecture, components, and design decisions |
| **[Performance Optimization](PERFORMANCE_OPTIMIZATION.md)** | Tuning, caching, benchmarks, and best practices |
| **[Observability](OBSERVABILITY.md)** | Prometheus metrics, OpenTelemetry tracing, Grafana dashboards |

### Advanced Features

| Document | Description |
|----------|-------------|
| **[Advanced Features](ADVANCED_FEATURES.md)** | Cost tracking, analytics, multi-tenancy, custom scanners |
| **[GraphQL API](GRAPHQL_API.md)** | Complete API documentation with examples |
| **[Anomaly Detection](ANOMALY_DETECTION.md)** | ML-based anomaly detection for security threats |
| **[Response Scanning](RESPONSE_SCANNING.md)** | Scan and redact sensitive data in AI responses |
| **[Streaming Support](STREAMING.md)** | Real-time streaming response handling |
| **[Validation](VALIDATION.md)** | Request/response validation with JSON Schema |

### Enterprise Integration

| Document | Description |
|----------|-------------|
| **[Enterprise Integration](ENTERPRISE_INTEGRATION.md)** | SIEM forwarding, webhooks, authentication, alerting |
| **[User Identity & Analytics](USER_IDENTITY_AND_ANALYTICS.md)** | User tracking, behavioral analytics, training recommendations |
| **[Self-Service Pattern Management](SELF_SERVICE_PATTERN_MANAGEMENT.md)** | Customize PII patterns without code changes |

### Performance & Monitoring

| Document | Description |
|----------|-------------|
| **[Performance](PERFORMANCE.md)** | Caching, rate limiting, request deduplication |
| **[Performance Optimization](PERFORMANCE_OPTIMIZATION.md)** | Detailed tuning guide and benchmarks |
| **[Observability](OBSERVABILITY.md)** | Metrics, tracing, and monitoring setup |

---

## 🎯 Quick Links by Use Case

### "I want to deploy Proxilion"
→ Start with **[Setup Guide](../SETUP.md)**

### "I want to understand how it works"
→ Read **[Architecture Guide](ARCHITECTURE.md)**

### "I want to customize PII detection"
→ See **[Self-Service Pattern Management](SELF_SERVICE_PATTERN_MANAGEMENT.md)**

### "I want to integrate with my SIEM"
→ See **[Enterprise Integration](ENTERPRISE_INTEGRATION.md)**

### "I want to use the API"
→ See **[GraphQL API](GRAPHQL_API.md)**

### "I want to optimize performance"
→ See **[Performance Optimization](PERFORMANCE_OPTIMIZATION.md)**

### "I want to detect anomalies"
→ See **[Anomaly Detection](ANOMALY_DETECTION.md)**

### "I want to scan AI responses"
→ See **[Response Scanning](RESPONSE_SCANNING.md)**

---

## 📖 Documentation Structure

```
proxilion/
├── README.md                          # Main overview and quick start
├── SETUP.md                           # Complete deployment guide ⭐ START HERE
├── docs/
│   ├── README.md                      # This file
│   ├── ARCHITECTURE.md                # System architecture
│   ├── ADVANCED_FEATURES.md           # Advanced capabilities
│   ├── PERFORMANCE_OPTIMIZATION.md    # Performance tuning
│   ├── GRAPHQL_API.md                 # API documentation
│   ├── ANOMALY_DETECTION.md           # ML-based security
│   ├── RESPONSE_SCANNING.md           # Response content scanning
│   ├── STREAMING.md                   # Streaming support
│   ├── VALIDATION.md                  # Request/response validation
│   ├── ENTERPRISE_INTEGRATION.md      # SIEM, webhooks, auth
│   ├── USER_IDENTITY_AND_ANALYTICS.md # User tracking & analytics
│   ├── SELF_SERVICE_PATTERN_MANAGEMENT.md # Pattern customization
│   ├── OBSERVABILITY.md               # Metrics & monitoring
│   └── PERFORMANCE.md                 # Performance features
└── marketing_website/
    └── index.html                     # Visual overview & setup
```

---

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/proxilion/proxilion/issues)
- **Discussions:** [GitHub Discussions](https://github.com/proxilion/proxilion/discussions)
- **Security:** security@proxilion.dev

---

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

---

## 📝 License

MIT License - see [LICENSE](../LICENSE) for details.

