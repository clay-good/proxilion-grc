# Proxilion Observability Stack

## Overview

Proxilion includes a comprehensive observability stack with:
- **Prometheus** - Metrics collection and monitoring
- **OpenTelemetry** - Distributed tracing
- **Grafana** - Visualization and dashboards

## Quick Start

### 1. Start Proxilion
```bash
npm start
```

### 2. Access Metrics
```bash
# JSON format (for debugging)
curl http://localhost:8787/metrics

# Prometheus format (for scraping)
curl http://localhost:8787/metrics/prometheus
```

### 3. View Grafana Dashboards
```bash
# Get all dashboards
curl http://localhost:8787/admin/dashboards

# Get specific dashboard
curl http://localhost:8787/admin/dashboards/security
curl http://localhost:8787/admin/dashboards/performance
curl http://localhost:8787/admin/dashboards/cost
curl http://localhost:8787/admin/dashboards/compliance
```

---

## Prometheus Integration

### Configuration

Add Proxilion to your Prometheus scrape config:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'proxilion'
    scrape_interval: 15s
    static_configs:
      - targets: ['proxilion:8787']
    metrics_path: '/metrics/prometheus'
```

### Available Metrics

#### Request Metrics
```
proxilion_requests_total{provider="openai",method="POST"}
proxilion_requests_blocked_total{organization="acme"}
proxilion_requests_allowed_total{provider="anthropic"}
proxilion_request_duration_seconds_bucket{le="0.1"}
proxilion_request_duration_seconds_sum
proxilion_request_duration_seconds_count
```

#### Security Metrics
```
proxilion_threats_detected_total{threat_type="pii",threat_level="HIGH"}
proxilion_violations_total{violation_type="prompt_injection"}
proxilion_pii_detections_total{pii_type="email"}
proxilion_prompt_injection_detections_total
proxilion_toxicity_detections_total
```

#### Cache Metrics
```
proxilion_cache_hits_total
proxilion_cache_misses_total
proxilion_cache_hit_ratio
proxilion_semantic_cache_hits_total
proxilion_semantic_cache_similarity
```

#### Cost Metrics
```
proxilion_cost_total_dollars{provider="openai"}
proxilion_cost_per_request_dollars_bucket{le="0.05"}
proxilion_tokens_total{type="input"}
```

#### Performance Metrics
```
proxilion_latency_seconds{provider="anthropic"}
proxilion_latency_saved_seconds
```

#### Load Balancer Metrics
```
proxilion_loadbalancer_requests_total{backend="openai-1"}
proxilion_loadbalancer_failures_total{backend="openai-2"}
proxilion_loadbalancer_backend_health{backend="openai-1"}
```

#### User Analytics Metrics
```
proxilion_users_total{organization="acme"}
proxilion_users_needing_training_total{organization="acme"}
proxilion_high_risk_users_total{organization="acme"}
```

#### System Metrics
```
proxilion_errors_total{error_type="network"}
proxilion_connections_active
proxilion_rate_limit_exceeded_total
```

### Example PromQL Queries

#### Request Rate
```promql
# Requests per second by provider
rate(proxilion_requests_total[5m])

# Requests per second by organization
sum(rate(proxilion_requests_total{organization="acme"}[5m]))
```

#### Latency Percentiles
```promql
# p50 latency
histogram_quantile(0.50, rate(proxilion_request_duration_seconds_bucket[5m]))

# p95 latency
histogram_quantile(0.95, rate(proxilion_request_duration_seconds_bucket[5m]))

# p99 latency
histogram_quantile(0.99, rate(proxilion_request_duration_seconds_bucket[5m]))
```

#### Error Rate
```promql
# Error rate (errors per second)
rate(proxilion_errors_total[5m])

# Error percentage
rate(proxilion_errors_total[5m]) / rate(proxilion_requests_total[5m]) * 100
```

#### Cache Hit Ratio
```promql
# Cache hit ratio
proxilion_cache_hits_total / (proxilion_cache_hits_total + proxilion_cache_misses_total)
```

#### Cost Tracking
```promql
# Total cost in last 24 hours
increase(proxilion_cost_total_dollars[24h])

# Cost by provider
sum by (provider) (increase(proxilion_cost_total_dollars[24h]))

# Cost per request
rate(proxilion_cost_total_dollars[5m]) / rate(proxilion_requests_total[5m])
```

---

## OpenTelemetry Integration

### Configuration

Set environment variables:

```bash
# Jaeger
export OTEL_EXPORTER_TYPE=jaeger
export OTEL_EXPORTER_ENDPOINT=http://jaeger:14268/api/traces
export OTEL_SAMPLING_RATE=1.0

# Zipkin
export OTEL_EXPORTER_TYPE=zipkin
export OTEL_EXPORTER_ENDPOINT=http://zipkin:9411/api/v2/spans

# OTLP (OpenTelemetry Protocol)
export OTEL_EXPORTER_TYPE=otlp
export OTEL_EXPORTER_ENDPOINT=http://otel-collector:4318/v1/traces

# Console (for debugging)
export OTEL_EXPORTER_TYPE=console
```

### Trace Structure

Each request creates a trace with the following spans:

```
proxy.request (SERVER)
├─ identity.extract (INTERNAL)
├─ security.scan (INTERNAL)
│  ├─ pii.scan (INTERNAL)
│  ├─ injection.scan (INTERNAL)
│  └─ toxicity.scan (INTERNAL)
├─ policy.evaluate (INTERNAL)
├─ cache.lookup (INTERNAL)
├─ ai.request (CLIENT)
└─ response.process (INTERNAL)
```

### Span Attributes

Each span includes attributes:

```
http.method: POST
http.url: https://api.openai.com/v1/chat/completions
http.status_code: 200
correlation.id: 550e8400-e29b-41d4-a716-446655440000
target.url: https://api.openai.com/v1/chat/completions
request.duration_ms: 1234
request.tokens.input: 100
request.tokens.output: 50
response.modified: false
policy.action: ALLOW
threat.level: LOW
error: false
```

### Span Events

Spans can include events:

```
request.blocked
  reason: "PII detected in prompt"
  
cache.miss
  key: "hash:abc123"
  
db.query
  query: "SELECT * FROM users WHERE id = ?"
```

### Context Propagation

Proxilion automatically propagates trace context using W3C Trace Context:

```
traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
```

This allows distributed tracing across multiple services.

---

## Grafana Integration

### Setup

1. **Add Prometheus Data Source**:
```json
{
  "name": "Prometheus",
  "type": "prometheus",
  "url": "http://prometheus:9090",
  "access": "proxy",
  "isDefault": true
}
```

2. **Add Jaeger Data Source**:
```json
{
  "name": "Jaeger",
  "type": "jaeger",
  "url": "http://jaeger:16686",
  "access": "proxy"
}
```

3. **Import Dashboards**:
```bash
# Get dashboard JSON
curl http://localhost:8787/admin/dashboards/security > security-dashboard.json

# Import into Grafana
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d @security-dashboard.json
```

### Available Dashboards

#### 1. Security Monitoring Dashboard
- **Threats detected over time** (graph)
- **Current threat level** (gauge)
- **Blocked requests** (stat)
- **Violations by type** (bar gauge)
- **PII detections** (graph)
- **High-risk users** (table)

#### 2. Performance Metrics Dashboard
- **Request rate** (graph)
- **Request latency** (graph with p50/p95/p99)
- **Cache hit ratio** (gauge)
- **Semantic cache hits** (stat)
- **Latency saved** (stat)
- **Backend health** (bar gauge)
- **Error rate** (graph)

#### 3. Cost Tracking Dashboard
- **Total cost 24h** (stat with USD formatting)
- **Cost by provider** (bar gauge)
- **Cost saved from caching** (stat)
- **Cost over time** (graph)
- **Cost per request** (graph)
- **Token usage** (graph)

#### 4. Compliance Overview Dashboard
- **Compliance score** (gauge with thresholds)
- **Violations by regulation** (bar gauge)
- **Violations over time** (graph)

### Dashboard Variables

All dashboards support template variables:

- **$organization** - Filter by organization
- **$provider** - Filter by AI provider
- **$time_range** - Time range selector

---

## Alerting

### Prometheus Alerts

Create alert rules in Prometheus:

```yaml
# alerts.yml
groups:
  - name: proxilion
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(proxilion_errors_total[5m]) > 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      # High threat level
      - alert: HighThreatLevel
        expr: sum(proxilion_threats_detected_total{threat_level="CRITICAL"}) > 5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Critical threats detected"
          description: "{{ $value }} critical threats in last minute"

      # Low cache hit ratio
      - alert: LowCacheHitRatio
        expr: proxilion_cache_hit_ratio < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low cache hit ratio"
          description: "Cache hit ratio is {{ $value | humanizePercentage }}"

      # High cost
      - alert: HighCost
        expr: increase(proxilion_cost_total_dollars[1h]) > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High AI costs"
          description: "Cost is ${{ $value }} in last hour"

      # Backend unhealthy
      - alert: BackendUnhealthy
        expr: proxilion_loadbalancer_backend_health < 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Backend {{ $labels.backend }} is unhealthy"
          description: "Backend has been unhealthy for 2 minutes"
```

### Grafana Alerts

Create alerts in Grafana dashboards:

1. Edit panel
2. Click "Alert" tab
3. Configure alert rule:
   - **Condition**: `WHEN avg() OF query(A, 5m, now) IS ABOVE 100`
   - **Frequency**: Evaluate every 1m
   - **For**: 5m
4. Add notification channel (email, Slack, PagerDuty)

---

## Best Practices

### 1. Sampling Strategy

For high-traffic environments, use sampling:

```bash
# Trace 10% of requests
export OTEL_SAMPLING_RATE=0.1

# Trace 1% of requests
export OTEL_SAMPLING_RATE=0.01
```

### 2. Metric Cardinality

Avoid high-cardinality labels:

```
# Good (low cardinality)
proxilion_requests_total{provider="openai"}

# Bad (high cardinality)
proxilion_requests_total{user_id="user123"}
```

### 3. Dashboard Organization

Organize dashboards by audience:

- **Engineering**: Performance, errors, traces
- **Operations**: System health, SLAs
- **Security**: Threats, violations, compliance
- **Finance**: Costs, budgets, forecasts

### 4. Alert Fatigue

Avoid alert fatigue:

- Set appropriate thresholds
- Use `for` duration to avoid flapping
- Group related alerts
- Use severity levels (critical, warning, info)

---

## Troubleshooting

### Metrics Not Appearing

1. Check Prometheus scrape config:
```bash
curl http://prometheus:9090/api/v1/targets
```

2. Check Proxilion metrics endpoint:
```bash
curl http://localhost:8787/metrics/prometheus
```

3. Check Prometheus logs:
```bash
docker logs prometheus
```

### Traces Not Appearing

1. Check OpenTelemetry configuration:
```bash
echo $OTEL_EXPORTER_ENDPOINT
echo $OTEL_EXPORTER_TYPE
echo $OTEL_SAMPLING_RATE
```

2. Check Jaeger UI:
```
http://jaeger:16686
```

3. Check Proxilion logs:
```bash
docker logs proxilion | grep -i "otel\|trace"
```

### Dashboards Not Loading

1. Check Grafana data source:
```
Grafana > Configuration > Data Sources > Prometheus
```

2. Test PromQL query:
```
Grafana > Explore > Run query
```

3. Check dashboard JSON:
```bash
curl http://localhost:8787/admin/dashboards/security | jq
```

---

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)

