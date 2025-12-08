# Disaster Recovery Guide

This guide covers backup, recovery, and disaster recovery procedures for Proxilion GRC.

---

## Overview

Proxilion GRC is primarily stateless, but certain data must be backed up for complete recovery:

**Critical Data:**
- Configuration files
- TLS certificates and CA keys
- Custom policies
- Custom scanner patterns

**Important Data:**
- Analytics database (if using PostgreSQL)
- Audit logs
- Prometheus metrics history

---

## What to Back Up

### Priority 1: Critical (Must Have)

| Item | Location | Backup Frequency |
|------|----------|------------------|
| CA Private Key | `certs/proxilion-ca.key` | Once (after generation) |
| CA Certificate | `certs/proxilion-ca.crt` | Once (after generation) |
| Configuration | `.env`, `wrangler.toml` | On change |
| Custom Policies | Database or config files | Daily |

### Priority 2: Important (Should Have)

| Item | Location | Backup Frequency |
|------|----------|------------------|
| Analytics Data | PostgreSQL | Daily |
| Audit Logs | Log files or database | Daily |
| Custom Patterns | Configuration | On change |
| Kubernetes Secrets | Kubernetes cluster | Daily |

### Priority 3: Nice to Have

| Item | Location | Backup Frequency |
|------|----------|------------------|
| Prometheus Metrics | Prometheus TSDB | Weekly |
| Grafana Dashboards | Grafana database | Weekly |
| Historical Reports | Generated files | Monthly |

---

## Backup Procedures

### Configuration Backup Script

```bash
#!/bin/bash
# backup-config.sh

BACKUP_DIR="/backup/proxilion/$(date +%Y%m%d_%H%M%S)"
PROXILION_DIR="/opt/proxilion"

mkdir -p "$BACKUP_DIR"

# Backup configuration files
cp "$PROXILION_DIR/.env" "$BACKUP_DIR/"
cp "$PROXILION_DIR/wrangler.toml" "$BACKUP_DIR/"
cp -r "$PROXILION_DIR/config" "$BACKUP_DIR/" 2>/dev/null || true

# Backup certificates (ENCRYPTED)
# WARNING: Store encryption key separately!
tar czf - -C "$PROXILION_DIR" certs | \
  openssl enc -aes-256-cbc -salt -pbkdf2 \
  -pass file:/root/.backup-key \
  -out "$BACKUP_DIR/certs.tar.gz.enc"

# Backup custom policies (if stored as files)
cp -r "$PROXILION_DIR/policies" "$BACKUP_DIR/" 2>/dev/null || true

# Create backup manifest
echo "Backup created: $(date)" > "$BACKUP_DIR/manifest.txt"
echo "Hostname: $(hostname)" >> "$BACKUP_DIR/manifest.txt"
echo "Version: $(cat $PROXILION_DIR/package.json | grep version)" >> "$BACKUP_DIR/manifest.txt"

# Calculate checksums
find "$BACKUP_DIR" -type f -exec sha256sum {} \; > "$BACKUP_DIR/checksums.sha256"

echo "Backup complete: $BACKUP_DIR"
```

### Database Backup (PostgreSQL)

```bash
#!/bin/bash
# backup-database.sh

BACKUP_DIR="/backup/proxilion/db/$(date +%Y%m%d_%H%M%S)"
DB_NAME="proxilion"
DB_USER="proxilion"

mkdir -p "$BACKUP_DIR"

# Full database dump
pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_DIR/proxilion.dump"

# Backup specific tables
pg_dump -U "$DB_USER" -Fc -t policies "$DB_NAME" > "$BACKUP_DIR/policies.dump"
pg_dump -U "$DB_USER" -Fc -t audit_logs "$DB_NAME" > "$BACKUP_DIR/audit_logs.dump"
pg_dump -U "$DB_USER" -Fc -t analytics "$DB_NAME" > "$BACKUP_DIR/analytics.dump"

# Compress
gzip "$BACKUP_DIR"/*.dump

echo "Database backup complete: $BACKUP_DIR"
```

### Kubernetes Backup

```bash
#!/bin/bash
# backup-kubernetes.sh

BACKUP_DIR="/backup/proxilion/k8s/$(date +%Y%m%d_%H%M%S)"
NAMESPACE="proxilion"

mkdir -p "$BACKUP_DIR"

# Backup secrets
kubectl get secrets -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/secrets.yaml"

# Backup configmaps
kubectl get configmaps -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/configmaps.yaml"

# Backup deployments
kubectl get deployments -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/deployments.yaml"

# Backup services
kubectl get services -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/services.yaml"

# Backup ingress
kubectl get ingress -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/ingress.yaml"

# Backup HPA
kubectl get hpa -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/hpa.yaml"

# Backup PDB
kubectl get pdb -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/pdb.yaml"

echo "Kubernetes backup complete: $BACKUP_DIR"
```

---

## Backup Storage

### Local Storage

```bash
# Create backup directory with proper permissions
sudo mkdir -p /backup/proxilion
sudo chown root:root /backup/proxilion
sudo chmod 700 /backup/proxilion
```

### Cloud Storage (AWS S3)

```bash
#!/bin/bash
# sync-to-s3.sh

BACKUP_DIR="/backup/proxilion"
S3_BUCKET="s3://your-backup-bucket/proxilion"

# Sync to S3 with encryption
aws s3 sync "$BACKUP_DIR" "$S3_BUCKET" \
  --sse AES256 \
  --storage-class STANDARD_IA

# Apply lifecycle policy for retention
aws s3api put-bucket-lifecycle-configuration \
  --bucket your-backup-bucket \
  --lifecycle-configuration file://lifecycle.json
```

lifecycle.json:
```json
{
  "Rules": [
    {
      "ID": "ProxilionBackupRetention",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "proxilion/"
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

### Google Cloud Storage

```bash
#!/bin/bash
# sync-to-gcs.sh

BACKUP_DIR="/backup/proxilion"
GCS_BUCKET="gs://your-backup-bucket/proxilion"

gsutil -m rsync -r "$BACKUP_DIR" "$GCS_BUCKET"
```

### Azure Blob Storage

```bash
#!/bin/bash
# sync-to-azure.sh

BACKUP_DIR="/backup/proxilion"
CONTAINER="proxilion-backups"

azcopy sync "$BACKUP_DIR" "https://yourstorageaccount.blob.core.windows.net/$CONTAINER"
```

---

## Recovery Procedures

### Scenario 1: Single Node Failure

**Impact:** One Proxilion instance unavailable

**Recovery:**
1. Other instances handle traffic (HA)
2. Kubernetes/Swarm automatically restarts failed instance
3. No manual intervention required

**Verification:**
```bash
kubectl get pods -l app=proxilion
curl https://proxy.example.com/health
```

### Scenario 2: Complete Cluster Failure

**Impact:** All Proxilion instances unavailable

**Recovery Steps:**

1. **Deploy New Cluster**
   ```bash
   # Apply Kubernetes manifests
   kubectl apply -f k8s/
   ```

2. **Restore Certificates**
   ```bash
   # Decrypt and restore certificates
   openssl enc -d -aes-256-cbc -pbkdf2 \
     -pass file:/root/.backup-key \
     -in /backup/proxilion/latest/certs.tar.gz.enc | \
     tar xzf - -C /opt/proxilion/

   # Or restore to Kubernetes secret
   kubectl create secret generic proxilion-certs \
     --from-file=ca.crt=/opt/proxilion/certs/proxilion-ca.crt \
     --from-file=ca.key=/opt/proxilion/certs/proxilion-ca.key
   ```

3. **Restore Configuration**
   ```bash
   # Restore config files
   cp /backup/proxilion/latest/.env /opt/proxilion/

   # Or restore to Kubernetes configmap
   kubectl create configmap proxilion-config \
     --from-env-file=/backup/proxilion/latest/.env
   ```

4. **Restore Database (if applicable)**
   ```bash
   # Restore PostgreSQL
   gunzip -c /backup/proxilion/db/latest/proxilion.dump.gz | \
     pg_restore -U proxilion -d proxilion
   ```

5. **Verify Recovery**
   ```bash
   # Check pods are running
   kubectl get pods -l app=proxilion

   # Check health
   curl https://proxy.example.com/health

   # Test proxy functionality
   curl -x https://proxy.example.com:8787 https://api.openai.com/v1/models
   ```

### Scenario 3: Certificate Compromise

**Impact:** CA private key potentially exposed

**Recovery Steps:**

1. **Generate New CA**
   ```bash
   # Generate new CA certificate
   openssl genrsa -out proxilion-ca-new.key 4096
   openssl req -x509 -new -nodes \
     -key proxilion-ca-new.key \
     -sha256 -days 3650 \
     -out proxilion-ca-new.crt \
     -subj "/CN=Proxilion GRC CA v2/O=Your Organization/C=US"
   ```

2. **Deploy New Certificate**
   ```bash
   # Update Proxilion configuration
   cp proxilion-ca-new.key /opt/proxilion/certs/proxilion-ca.key
   cp proxilion-ca-new.crt /opt/proxilion/certs/proxilion-ca.crt

   # Restart Proxilion
   kubectl rollout restart deployment/proxilion
   ```

3. **Distribute to Clients**
   - Update MDM profiles with new certificate
   - Push new certificate via Group Policy
   - Update DNS configuration if needed

4. **Revoke Old Certificate**
   - Remove old certificate from client trust stores
   - Update MDM to remove old certificate

### Scenario 4: Data Center Failure

**Impact:** Entire data center unavailable

**Recovery Steps:**

1. **Activate DR Site**
   ```bash
   # Update DNS to point to DR site
   # Or use GeoDNS/Anycast for automatic failover
   ```

2. **Deploy from Backup**
   ```bash
   # Pull backups from cloud storage
   aws s3 sync s3://your-backup-bucket/proxilion /backup/proxilion

   # Deploy to DR cluster
   kubectl apply -f k8s/

   # Restore configuration and certificates
   ./restore-from-backup.sh
   ```

3. **Verify DR Site**
   ```bash
   curl https://proxy-dr.example.com/health
   ```

---

## Backup Schedule

### Recommended Schedule

| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Configuration | On change + Daily | 90 days |
| Certificates | On change | Forever |
| Database (full) | Daily | 30 days |
| Database (incremental) | Hourly | 7 days |
| Audit Logs | Daily | 1 year |
| Kubernetes Resources | Daily | 30 days |

### Cron Configuration

```cron
# /etc/cron.d/proxilion-backup

# Configuration backup - daily at 1 AM
0 1 * * * root /opt/proxilion/scripts/backup-config.sh

# Database backup - daily at 2 AM
0 2 * * * root /opt/proxilion/scripts/backup-database.sh

# Kubernetes backup - daily at 3 AM
0 3 * * * root /opt/proxilion/scripts/backup-kubernetes.sh

# Sync to cloud - daily at 4 AM
0 4 * * * root /opt/proxilion/scripts/sync-to-s3.sh

# Cleanup old backups - weekly on Sunday at 5 AM
0 5 * * 0 root find /backup/proxilion -mtime +90 -delete
```

---

## DR Testing

### Test Schedule

| Test Type | Frequency |
|-----------|-----------|
| Backup verification | Weekly |
| Single node recovery | Monthly |
| Full cluster recovery | Quarterly |
| DR site failover | Annually |

### Test Procedure

```bash
#!/bin/bash
# dr-test.sh

echo "Starting DR test..."

# 1. Verify backups exist
if [ ! -d "/backup/proxilion/latest" ]; then
  echo "FAIL: No backup found"
  exit 1
fi

# 2. Verify backup integrity
cd /backup/proxilion/latest
sha256sum -c checksums.sha256
if [ $? -ne 0 ]; then
  echo "FAIL: Backup integrity check failed"
  exit 1
fi

# 3. Test certificate decryption
openssl enc -d -aes-256-cbc -pbkdf2 \
  -pass file:/root/.backup-key \
  -in certs.tar.gz.enc | tar tzf - > /dev/null
if [ $? -ne 0 ]; then
  echo "FAIL: Certificate decryption failed"
  exit 1
fi

# 4. Test database restore (to test database)
gunzip -c /backup/proxilion/db/latest/proxilion.dump.gz | \
  pg_restore -U proxilion -d proxilion_test --clean
if [ $? -ne 0 ]; then
  echo "FAIL: Database restore failed"
  exit 1
fi

echo "PASS: DR test completed successfully"
```

---

## Communication Plan

### Incident Communication

During a disaster:

1. **Internal Notification**
   - Alert on-call engineer
   - Notify management
   - Update status page

2. **External Communication**
   - Notify affected customers
   - Provide ETA for recovery
   - Regular status updates

### Contact List

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | PagerDuty | 15 min |
| Platform Lead | Phone | 30 min |
| Security Team | Email | 1 hour |
| Management | Email | 2 hours |

---

## Limitations

1. **Point-in-Time Recovery** - Not supported for stateless proxy data. Only database can be restored to specific point.

2. **Cross-Region Replication** - Must be configured manually. No built-in replication.

3. **Encrypted Backup Keys** - If backup encryption key is lost, backups are unrecoverable.

4. **Audit Log Gaps** - Logs during outage will be lost unless external logging is configured.

---

## Next Steps

- [High Availability Guide](HIGH_AVAILABILITY.md)
- [Setup Guide](SETUP.md)
- [Observability Guide](OBSERVABILITY.md)
