# High Availability Deployment Guide

This guide covers deploying Proxilion GRC in a highly available configuration for enterprise environments.

---

## Overview

Proxilion GRC is designed to be stateless, making horizontal scaling straightforward. This guide covers multi-instance deployments for high availability and fault tolerance.

**HA Goals:**
- No single point of failure
- Automatic failover
- Zero-downtime deployments
- Horizontal scalability

---

## Architecture

### Single Region HA

```
                    Load Balancer
                    (Layer 4/7)
                         |
         +---------------+---------------+
         |               |               |
    Proxilion-1     Proxilion-2     Proxilion-3
         |               |               |
         +---------------+---------------+
                         |
              Shared Services (Optional)
              - Redis (rate limiting)
              - PostgreSQL (analytics)
              - Prometheus (metrics)
```

### Multi-Region HA

```
           Global Load Balancer (GeoDNS/Anycast)
                         |
         +---------------+---------------+
         |                               |
    Region A                        Region B
    Load Balancer                   Load Balancer
         |                               |
    +----+----+                     +----+----+
    |    |    |                     |    |    |
   P-1  P-2  P-3                   P-1  P-2  P-3
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.21+
- kubectl configured
- Helm 3.x (optional but recommended)
- Container registry access

### Basic HA Deployment

The provided Kubernetes manifests include HA features:

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

### Deployment Configuration

File: `k8s/deployment.yaml`

Key HA features in the existing manifests:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: proxilion
spec:
  replicas: 3  # Minimum 3 for HA
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    spec:
      affinity:
        # Spread across availability zones
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: proxilion
            topologyKey: topology.kubernetes.io/zone
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: proxilion
              topologyKey: kubernetes.io/hostname
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: proxilion-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: proxilion
  minReplicas: 3
  maxReplicas: 20
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
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

### Pod Disruption Budget

Ensure minimum availability during maintenance:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: proxilion-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: proxilion
```

### Service Configuration

```yaml
apiVersion: v1
kind: Service
metadata:
  name: proxilion
spec:
  type: ClusterIP
  selector:
    app: proxilion
  ports:
  - name: proxy
    port: 8787
    targetPort: 8787
  - name: admin
    port: 8788
    targetPort: 8788
  sessionAffinity: None  # Stateless, no session affinity needed
```

---

## Docker Swarm Deployment

### Create Swarm Cluster

```bash
# Initialize swarm on manager node
docker swarm init

# Join worker nodes
docker swarm join --token <token> <manager-ip>:2377
```

### Deploy Stack

```yaml
# docker-compose.ha.yml
version: '3.8'
services:
  proxilion:
    image: proxilion:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      rollback_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      placement:
        constraints:
          - node.role == worker
        preferences:
          - spread: node.labels.zone
    ports:
      - target: 8787
        published: 8787
        mode: host
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8787/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    networks:
      - proxilion-net

networks:
  proxilion-net:
    driver: overlay
    attachable: true
```

Deploy:
```bash
docker stack deploy -c docker-compose.ha.yml proxilion
```

---

## Load Balancer Configuration

### NGINX (Layer 7)

```nginx
upstream proxilion_backend {
    least_conn;
    server proxilion-1:8787 weight=1 max_fails=3 fail_timeout=30s;
    server proxilion-2:8787 weight=1 max_fails=3 fail_timeout=30s;
    server proxilion-3:8787 weight=1 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name proxy.example.com;

    ssl_certificate /etc/ssl/proxy.crt;
    ssl_certificate_key /etc/ssl/proxy.key;

    location / {
        proxy_pass http://proxilion_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://proxilion_backend/health;
        proxy_connect_timeout 2s;
        proxy_read_timeout 2s;
    }
}
```

### HAProxy (Layer 4/7)

```haproxy
global
    maxconn 50000
    log stdout format raw local0

defaults
    mode http
    timeout connect 5s
    timeout client 60s
    timeout server 60s
    option httplog
    option dontlognull
    option http-server-close
    option forwardfor

frontend proxilion_front
    bind *:443 ssl crt /etc/ssl/proxy.pem
    default_backend proxilion_back

backend proxilion_back
    balance leastconn
    option httpchk GET /health
    http-check expect status 200
    server proxilion-1 10.0.0.51:8787 check inter 5s fall 3 rise 2
    server proxilion-2 10.0.0.52:8787 check inter 5s fall 3 rise 2
    server proxilion-3 10.0.0.53:8787 check inter 5s fall 3 rise 2
```

### AWS Application Load Balancer

```terraform
resource "aws_lb" "proxilion" {
  name               = "proxilion-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "proxilion" {
  name     = "proxilion-tg"
  port     = 8787
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 10
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "proxilion" {
  load_balancer_arn = aws_lb.proxilion.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.proxilion.arn
  }
}
```

---

## Shared State (Optional)

For features requiring shared state across instances:

### Redis (Rate Limiting)

```yaml
# Redis cluster for shared rate limiting
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command: ["redis-server", "--cluster-enabled", "yes"]
        ports:
        - containerPort: 6379
```

Configure Proxilion to use Redis:
```bash
REDIS_URL=redis://redis:6379
RATE_LIMIT_STORE=redis
```

### PostgreSQL (Analytics)

```yaml
# PostgreSQL for analytics storage
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 3  # Primary + 2 replicas
  selector:
    matchLabels:
      app: postgres
  template:
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: proxilion
```

---

## Health Checks

### Liveness Probe

Determines if the container should be restarted:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8787
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Readiness Probe

Determines if the container should receive traffic:

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 8787
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

---

## Graceful Shutdown

Proxilion handles graceful shutdown:

1. Stop accepting new connections
2. Drain existing requests (up to timeout)
3. Close connections
4. Exit

Kubernetes configuration:

```yaml
spec:
  terminationGracePeriodSeconds: 30
  containers:
  - name: proxilion
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "sleep 5"]
```

---

## Monitoring HA Health

### Key Metrics

Monitor these for HA health:

- `proxilion_http_requests_total` - Request count per instance
- `proxilion_http_request_duration_seconds` - Latency per instance
- `proxilion_health_check_status` - Health check results
- `kube_deployment_status_replicas_available` - Available replicas

### Alerting Rules

```yaml
groups:
- name: proxilion-ha
  rules:
  - alert: ProxilionInstanceDown
    expr: up{job="proxilion"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Proxilion instance down"

  - alert: ProxilionHighLatency
    expr: histogram_quantile(0.95, rate(proxilion_http_request_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Proxilion high latency"

  - alert: ProxilionLowReplicas
    expr: kube_deployment_status_replicas_available{deployment="proxilion"} < 2
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Proxilion below minimum replicas"
```

---

## Failover Testing

### Test Procedures

1. **Instance Failure**
   ```bash
   # Kill one instance
   kubectl delete pod proxilion-0
   # Verify traffic continues
   curl https://proxy.example.com/health
   ```

2. **Zone Failure**
   ```bash
   # Cordon all nodes in one zone
   kubectl cordon -l topology.kubernetes.io/zone=us-east-1a
   # Verify traffic continues
   ```

3. **Rolling Update**
   ```bash
   # Trigger rolling update
   kubectl rollout restart deployment/proxilion
   # Monitor availability
   kubectl rollout status deployment/proxilion
   ```

---

## Limitations

1. **Stateful Features** - Rate limiting counters are per-instance by default. Use Redis for distributed rate limiting.

2. **Session Affinity** - Not required (stateless), but some debugging features may benefit from session affinity.

3. **Certificate Sync** - Each instance needs access to the same CA certificate. Use shared storage or Kubernetes secrets.

4. **Analytics** - Analytics data is per-instance by default. Use PostgreSQL for centralized analytics.

---

## RTO/RPO Targets

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single instance failure | < 30 seconds | 0 (stateless) |
| Availability zone failure | < 60 seconds | 0 (stateless) |
| Region failure | < 5 minutes* | 0 (stateless) |
| Complete cluster failure | < 15 minutes* | Depends on backup |

*Requires multi-region deployment

---

## Next Steps

- [Disaster Recovery Guide](DISASTER_RECOVERY.md)
- [Setup Guide](SETUP.md)
- [Observability Guide](OBSERVABILITY.md)
