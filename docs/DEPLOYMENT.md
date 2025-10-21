# Proxilion Deployment Guide

This guide covers various deployment options for Proxilion in production environments.

## Table of Contents

1. [Cloudflare Workers](#cloudflare-workers)
2. [Docker](#docker)
3. [Kubernetes](#kubernetes)
4. [AWS Lambda](#aws-lambda)
5. [Self-Hosted](#self-hosted)
6. [Configuration](#configuration)
7. [Monitoring](#monitoring)

## Cloudflare Workers

Cloudflare Workers is the recommended deployment platform for Proxilion, offering global edge deployment with minimal latency.

### Prerequisites

- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- Domain configured in Cloudflare (optional)

### Setup

1. **Login to Cloudflare**:
```bash
wrangler login
```

2. **Configure wrangler.toml**:
```toml
name = "proxilion"
main = "src/index.ts"
compatibility_date = "2024-01-01"
node_compat = true

[env.production]
name = "proxilion-production"
workers_dev = false
route = "proxilion.yourdomain.com/*"

[env.staging]
name = "proxilion-staging"
workers_dev = true
```

3. **Deploy**:
```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Custom Domain

1. Add a route in Cloudflare dashboard
2. Point your domain to Cloudflare
3. Update `wrangler.toml` with your route

### Environment Variables

Set secrets using Wrangler:
```bash
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put LOG_LEVEL --env production
```

### Monitoring

View logs:
```bash
wrangler tail --env production
```

### Limits

- CPU time: 50ms (free), 50ms-30s (paid)
- Memory: 128MB
- Request size: 100MB
- Response size: 100MB

## Docker

Deploy Proxilion using Docker for containerized environments.

### Dockerfile

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY pnpm-lock.yaml ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 8787

CMD ["node", "dist/index.js"]
```

### Build and Run

```bash
# Build image
docker build -t proxilion:latest .

# Run container
docker run -d \
  --name proxilion \
  -p 8787:8787 \
  -e LOG_LEVEL=info \
  -e ENABLE_PII_DETECTION=true \
  proxilion:latest

# View logs
docker logs -f proxilion

# Stop container
docker stop proxilion
```

### Docker Compose

```yaml
version: '3.8'

services:
  proxilion:
    build: .
    ports:
      - "8787:8787"
    environment:
      - LOG_LEVEL=info
      - ENABLE_PII_DETECTION=true
      - ENABLE_PROMPT_INJECTION_DETECTION=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Run with Docker Compose:
```bash
docker-compose up -d
```

## Kubernetes

Deploy Proxilion on Kubernetes for enterprise-grade orchestration.

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proxilion
  namespace: security
spec:
  replicas: 3
  selector:
    matchLabels:
      app: proxilion
  template:
    metadata:
      labels:
        app: proxilion
    spec:
      containers:
      - name: proxilion
        image: proxilion:latest
        ports:
        - containerPort: 8787
        env:
        - name: LOG_LEVEL
          value: "info"
        - name: ENABLE_PII_DETECTION
          value: "true"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: proxilion
  namespace: security
spec:
  selector:
    app: proxilion
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8787
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: proxilion-hpa
  namespace: security
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: proxilion
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace security

# Apply manifests
kubectl apply -f k8s/deployment.yaml

# Check status
kubectl get pods -n security
kubectl get svc -n security

# View logs
kubectl logs -f deployment/proxilion -n security

# Scale manually
kubectl scale deployment proxilion --replicas=5 -n security
```

### Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: proxilion-ingress
  namespace: security
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - proxilion.yourdomain.com
    secretName: proxilion-tls
  rules:
  - host: proxilion.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: proxilion
            port:
              number: 80
```

## AWS Lambda

Deploy Proxilion as a serverless function on AWS Lambda.

### Prerequisites

- AWS account
- AWS CLI configured
- Serverless Framework or SAM CLI

### Using Serverless Framework

```yaml
# serverless.yml
service: proxilion

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  memorySize: 512
  timeout: 30
  environment:
    LOG_LEVEL: info
    ENABLE_PII_DETECTION: true

functions:
  proxy:
    handler: dist/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true

plugins:
  - serverless-offline
```

Deploy:
```bash
serverless deploy --stage production
```

## Self-Hosted

Run Proxilion on your own infrastructure.

### System Requirements

- Node.js 18+ or Bun
- 2GB RAM minimum
- 2 CPU cores minimum
- Linux/macOS/Windows

### Installation

```bash
# Clone repository
git clone https://github.com/proxilion/proxilion.git
cd proxilion

# Install dependencies
pnpm install

# Build
pnpm build

# Run
node dist/index.js
```

### Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name proxilion

# Configure auto-restart
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
pm2 logs proxilion
```

### Systemd Service

```ini
# /etc/systemd/system/proxilion.service
[Unit]
Description=Proxilion AI Security Proxy
After=network.target

[Service]
Type=simple
User=proxilion
WorkingDirectory=/opt/proxilion
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable proxilion
sudo systemctl start proxilion
sudo systemctl status proxilion
```

## Configuration

### Environment Variables

```bash
# Proxy Configuration
PROXY_PORT=8787
PROXY_HOST=0.0.0.0
PROXY_TIMEOUT=30000

# Security
ENABLE_PII_DETECTION=true
ENABLE_PROMPT_INJECTION_DETECTION=true
ENABLE_DLP=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
MASK_SENSITIVE_DATA=true

# Metrics
ENABLE_METRICS=true
METRICS_INTERVAL=60000
```

### Configuration File

Create `config.json`:
```json
{
  "proxy": {
    "port": 8787,
    "timeout": 30000,
    "maxRequestSize": 10485760
  },
  "security": {
    "enablePiiDetection": true,
    "enablePromptInjectionDetection": true,
    "enableDlp": true
  },
  "observability": {
    "logging": {
      "level": "info",
      "maskSensitiveData": true
    },
    "metrics": {
      "enabled": true,
      "interval": 60000
    }
  }
}
```

## Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:8787/health

# Detailed status
curl http://localhost:8787/status

# Metrics
curl http://localhost:8787/metrics
```

### Prometheus Integration

Add Prometheus scrape config:
```yaml
scrape_configs:
  - job_name: 'proxilion'
    static_configs:
      - targets: ['proxilion:8787']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

Import the Proxilion dashboard (coming soon) or create custom dashboards using metrics:
- `request_duration_histogram`
- `request_total_counter`
- `scan_duration_histogram`
- `policy_evaluation_duration_histogram`

### Alerting

Example Prometheus alert rules:
```yaml
groups:
  - name: proxilion
    rules:
      - alert: HighErrorRate
        expr: rate(request_error_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          
      - alert: HighLatency
        expr: histogram_quantile(0.99, request_duration_histogram) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected (p99 > 1s)"
```

## Security Considerations

1. **TLS/HTTPS**: Always use HTTPS in production
2. **API Keys**: Store API keys securely (secrets manager)
3. **Network**: Deploy in private network when possible
4. **Updates**: Keep Proxilion and dependencies updated
5. **Monitoring**: Set up alerts for security events
6. **Backups**: Backup configuration and policies regularly

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce connection pool size
   - Enable streaming for large requests
   - Increase memory limits

2. **High Latency**
   - Enable parallel scanning
   - Reduce scanner timeout
   - Deploy closer to AI services

3. **Connection Errors**
   - Check circuit breaker status
   - Verify network connectivity
   - Review timeout settings

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug node dist/index.js
```

## Support

- Documentation: https://docs.proxilion.dev
- Issues: https://github.com/proxilion/proxilion/issues
- Discord: https://discord.gg/proxilion

