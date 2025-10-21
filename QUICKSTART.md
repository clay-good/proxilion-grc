# Proxilion Quick Start Guide

Get Proxilion running in **5 minutes** with this step-by-step guide.

---

## 📋 Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js 18+** installed ([Download](https://nodejs.org/))
- ✅ **npm** or **pnpm** package manager
- ✅ **Git** installed
- ✅ **10 minutes** of your time

---

## 🚀 Option 1: Local Development (Fastest)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/proxilion/proxilion.git
cd proxilion

# Install dependencies
npm install

# Build the project
npm run build
```

**Expected output:**
```
✅ Build successful
✅ dist/index.js created (1.6MB)
✅ 0 TypeScript errors
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings (optional for testing)
nano .env
```

**Minimal configuration for testing:**
```bash
PORT=8787
NODE_ENV=development
LOG_LEVEL=info
ENABLE_ADMIN_AUTH=false  # Disable auth for testing
```

### Step 3: Start Proxilion

```bash
# Start the server
npm start
```

**Expected output:**
```
🚀 Proxilion starting...
✅ Server listening on port 8787
✅ Health check: http://localhost:8787/health
✅ Admin UI: http://localhost:8787/admin
```

### Step 4: Verify It's Working

```bash
# Check health
curl http://localhost:8787/health

# Expected response:
{
  "status": "healthy",
  "checks": {
    "memory": "healthy",
    "openai": "healthy"
  }
}
```

### Step 5: Test PII Detection

```bash
# Send a test request with SSN
curl -X POST http://localhost:8787/proxy/https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "My SSN is 123-45-6789"}
    ]
  }'

# Expected response:
{
  "error": "Request blocked by security policy",
  "reason": "Detected US Social Security Number (SSN)",
  "correlationId": "abc-123-def-456"
}
```

**✅ Success!** Proxilion is blocking sensitive data.

---

## ☁️ Option 2: Cloudflare Workers (Production)

### Step 1: Install Wrangler

```bash
# Install Wrangler CLI globally
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Step 2: Configure Wrangler

Edit `wrangler.toml`:

```toml
name = "proxilion"
main = "src/index.ts"
compatibility_date = "2024-01-01"
node_compat = true

[env.production]
name = "proxilion-production"
vars = { ENVIRONMENT = "production" }
```

### Step 3: Deploy

```bash
# Deploy to Cloudflare Workers
npm run deploy:production
```

**Expected output:**
```
✅ Built successfully
✅ Deployed to Cloudflare Workers
🌍 URL: https://proxilion-production.your-subdomain.workers.dev
```

### Step 4: Test Production Deployment

```bash
# Check health
curl https://proxilion-production.your-subdomain.workers.dev/health

# Expected response:
{
  "status": "healthy",
  "environment": "production"
}
```

---

## 🎨 Access the Web Dashboard

### Local Development

```bash
# Build and start the UI
cd ui
npm install
npm run dev
```

Open browser: **http://localhost:3000**

### Pages Available

- **Dashboard** (`/dashboard`) - Real-time metrics
- **Security** (`/security`) - Configure PII patterns
- **Policies** (`/policies`) - Manage security policies
- **Monitor** (`/monitor`) - Live request monitoring
- **Certificates** (`/certificates`) - CA certificate management

---

## 🔧 Common Configuration Tasks

### Enable/Disable PII Patterns

```bash
# Disable email detection
curl -X PATCH http://localhost:8787/api/security/pii-patterns/Email%20Address \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Add Custom Pattern

```bash
# Add employee ID pattern
curl -X POST http://localhost:8787/api/security/pii-patterns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Employee ID",
    "pattern": "EMP-\\d{6}",
    "category": "identity",
    "severity": "HIGH",
    "enabled": true
  }'
```

### View Performance Metrics

```bash
# Get optimization metrics
curl http://localhost:8787/api/performance/metrics

# Response:
{
  "totalRequests": 1234,
  "cacheHitRate": 89.5,
  "avgLatencyMs": 6.2,
  "avgScanTimeMs": 2.8
}
```

---

## 📱 Configure Mobile Devices (MDM)

### iOS (via Jamf, Intune, etc.)

1. **Create Configuration Profile** with:
   - Proxy: `proxilion.company.com:8787`
   - CA Certificate: Download from `/api/certificates/ca/download`

2. **Deploy via MDM** to all iOS devices

3. **Verify**: Open ChatGPT app, try sending SSN - should be blocked

### Android (via Google Workspace, Intune, etc.)

1. **Configure Proxy** in Android Enterprise settings
2. **Install CA Certificate** via MDM
3. **Test**: Open Chrome, navigate to chat.openai.com, send SSN

**Full guide**: [docs/MDM_CONFIGURATION.md](docs/MDM_CONFIGURATION.md)

---

## 🌐 Configure DNS (Browser Interception)

### Option 1: Corporate DNS

```bash
# Add DNS records to route AI domains to Proxilion
chat.openai.com    A    YOUR_PROXILION_IP
claude.ai          A    YOUR_PROXILION_IP
gemini.google.com  A    YOUR_PROXILION_IP
```

### Option 2: Hosts File (Testing)

```bash
# Edit /etc/hosts (macOS/Linux) or C:\Windows\System32\drivers\etc\hosts (Windows)
YOUR_PROXILION_IP  chat.openai.com
YOUR_PROXILION_IP  claude.ai
YOUR_PROXILION_IP  gemini.google.com
```

**Full guide**: [docs/DNS_CONFIGURATION.md](docs/DNS_CONFIGURATION.md)

---

## 🔐 Distribute CA Certificate

### Windows (Group Policy)

```powershell
# Import CA certificate to Trusted Root
certutil -addstore -enterprise -f "Root" proxilion-ca.crt
```

### macOS (MDM or Manual)

```bash
# Install CA certificate
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain proxilion-ca.crt
```

### Linux

```bash
# Copy CA certificate
sudo cp proxilion-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

**Full guide**: [docs/CERTIFICATE_INSTALLATION.md](docs/CERTIFICATE_INSTALLATION.md)

---

## 🧪 Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test pii-scanner
```

**Expected output:**
```
✅ 773/785 tests passing (98.5%)
✅ Coverage: 85%+
```

---

## 📊 Monitor Performance

### Real-Time Metrics

```bash
# Get current metrics
curl http://localhost:8787/api/performance/metrics

# Get cache statistics
curl http://localhost:8787/api/performance/cache-stats
```

### Prometheus Metrics

```bash
# Scrape Prometheus metrics
curl http://localhost:8787/metrics/prometheus
```

### Grafana Dashboards

```bash
# Export Grafana dashboards
curl http://localhost:8787/admin/dashboards
```

---

## 🐛 Troubleshooting

### Issue: Port 8787 already in use

```bash
# Change port in .env
PORT=8788

# Or kill existing process
lsof -ti:8787 | xargs kill -9
```

### Issue: Build fails with TypeScript errors

```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Issue: Certificate errors in browser

```bash
# Regenerate CA certificate
rm -rf certs/
npm run build
npm start
# Download new CA from /api/certificates/ca/download
```

### Issue: High latency (>20ms)

```bash
# Check cache hit rate
curl http://localhost:8787/api/performance/cache-stats

# If low (<50%), increase cache size in .env:
MAX_CACHE_SIZE=50000
SCAN_CACHE_TTL=300000
```

---

## 📚 Next Steps

### 1. **Production Deployment**
   - [Cloudflare Workers Guide](docs/CLOUDFLARE_DEPLOYMENT.md)
   - [Self-Hosted Deployment](docs/DEPLOYMENT.md)

### 2. **Configure Security**
   - [Self-Service Pattern Management](docs/SELF_SERVICE_PATTERN_MANAGEMENT.md)
   - [Policy Configuration](docs/ARCHITECTURE.md)

### 3. **Optimize Performance**
   - [Performance Tuning Guide](docs/PERFORMANCE_OPTIMIZATION.md)
   - [Caching Strategies](docs/PERFORMANCE.md)

### 4. **Enterprise Integration**
   - [MDM Configuration](docs/MDM_CONFIGURATION.md)
   - [DNS Setup](docs/DNS_CONFIGURATION.md)
   - [Certificate Distribution](docs/CERTIFICATE_INSTALLATION.md)

### 5. **Advanced Features**
   - [GraphQL API](docs/GRAPHQL_API.md)
   - [Anomaly Detection](docs/ANOMALY_DETECTION.md)
   - [Workflow Orchestration](docs/ADVANCED_FEATURES.md)

---

## 💬 Get Help

- **Documentation**: [docs/](docs/)
- **GitHub Issues**: https://github.com/proxilion/proxilion/issues
- **Community**: https://community.proxilion.dev
- **Email**: support@proxilion.dev

---

## ✅ Quick Checklist

- [ ] Cloned repository
- [ ] Installed dependencies (`npm install`)
- [ ] Built project (`npm run build`)
- [ ] Started server (`npm start`)
- [ ] Verified health check (`curl http://localhost:8787/health`)
- [ ] Tested PII blocking (sent SSN, got 403)
- [ ] Accessed web dashboard (`http://localhost:3000`)
- [ ] Configured environment (`.env`)
- [ ] Read documentation (`docs/`)

**Congratulations! Proxilion is running.** 🎉

---

**Time to complete**: 5-10 minutes  
**Difficulty**: Easy  
**Support**: Available 24/7

