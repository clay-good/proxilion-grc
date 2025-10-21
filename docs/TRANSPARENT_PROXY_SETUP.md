# Transparent Proxy Setup Guide

This guide explains how to configure Proxilion as a **transparent MITM (Man-in-the-Middle) proxy** that intercepts all AI API traffic without requiring code changes to your applications.

## 🎯 Overview

In transparent proxy mode, Proxilion acts as an invisible security layer between your applications and AI providers. Your applications make normal API calls to OpenAI, Anthropic, or Google AI, but the traffic is automatically routed through Proxilion for security scanning, policy enforcement, and monitoring.

### How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│             │         │              │         │             │
│ Application │────────▶│  Proxilion   │────────▶│  OpenAI     │
│             │         │  (Proxy)     │         │  Anthropic  │
│             │◀────────│              │◀────────│  Google AI  │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ Security Scanning
                              │ Policy Enforcement
                              │ Cost Tracking
                              │ Compliance Monitoring
                              ▼
                        ┌──────────────┐
                        │   Logs &     │
                        │   Analytics  │
                        └──────────────┘
```

## 📋 Prerequisites

- Proxilion deployed and running (see [DEPLOYMENT.md](./DEPLOYMENT.md))
- Network access to modify DNS, hosts file, or routing rules
- SSL/TLS certificates (for HTTPS interception)

## 🚀 Setup Methods

### Method 1: DNS Override (Recommended for Production)

This method redirects all AI API traffic at the DNS level, making it transparent to all applications on your network.

#### Step 1: Deploy Proxilion

Deploy Proxilion to a server with a public IP or domain name:

```bash
# Example: Deploy to your server at proxy.yourcompany.com
# Port 443 for HTTPS traffic
```

#### Step 2: Configure DNS

Add DNS records to redirect AI API domains to your Proxilion instance:

**Option A: Internal DNS Server (Corporate Networks)**

Add these A records to your internal DNS:

```
api.openai.com              A    <proxilion-ip>
api.anthropic.com           A    <proxilion-ip>
generativelanguage.googleapis.com  A    <proxilion-ip>
api.cohere.ai               A    <proxilion-ip>
```

**Option B: Public DNS with Split Horizon**

If using public DNS (e.g., Cloudflare, Route53):

```bash
# Example with Cloudflare CLI
cloudflare dns create yourcompany.com --type A --name api.openai.com --content <proxilion-ip>
cloudflare dns create yourcompany.com --type A --name api.anthropic.com --content <proxilion-ip>
```

#### Step 3: Verify DNS Resolution

```bash
# Test DNS resolution
nslookup api.openai.com
# Should return your Proxilion IP

dig api.anthropic.com
# Should return your Proxilion IP
```

#### Step 4: Test API Calls

```bash
# Test OpenAI API through transparent proxy
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# The request will be automatically routed through Proxilion
```

---

### Method 2: /etc/hosts File (Development/Testing)

This method is ideal for local development and testing.

#### Step 1: Edit Hosts File

**Linux/macOS:**
```bash
sudo nano /etc/hosts
```

**Windows:**
```powershell
notepad C:\Windows\System32\drivers\etc\hosts
```

#### Step 2: Add Entries

Add these lines (replace `<proxilion-ip>` with your Proxilion server IP):

```
<proxilion-ip>  api.openai.com
<proxilion-ip>  api.anthropic.com
<proxilion-ip>  generativelanguage.googleapis.com
<proxilion-ip>  api.cohere.ai
```

For local testing:
```
127.0.0.1  api.openai.com
127.0.0.1  api.anthropic.com
127.0.0.1  generativelanguage.googleapis.com
127.0.0.1  api.cohere.ai
```

#### Step 3: Flush DNS Cache

**Linux:**
```bash
sudo systemd-resolve --flush-caches
# or
sudo /etc/init.d/nscd restart
```

**macOS:**
```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

**Windows:**
```powershell
ipconfig /flushdns
```

#### Step 4: Verify

```bash
ping api.openai.com
# Should ping your Proxilion IP
```

---

### Method 3: HTTP Proxy Environment Variables

Configure applications to use Proxilion as an HTTP proxy.

#### Step 1: Set Environment Variables

**Linux/macOS:**
```bash
export HTTP_PROXY=http://proxilion.yourcompany.com:8787
export HTTPS_PROXY=http://proxilion.yourcompany.com:8787
export NO_PROXY=localhost,127.0.0.1
```

**Windows:**
```powershell
$env:HTTP_PROXY="http://proxilion.yourcompany.com:8787"
$env:HTTPS_PROXY="http://proxilion.yourcompany.com:8787"
```

#### Step 2: Configure Application

Most HTTP clients respect these environment variables automatically.

**Python:**
```python
import os
import openai

# Environment variables are automatically used
client = openai.OpenAI(api_key="your-api-key")
```

**Node.js:**
```javascript
// Environment variables are automatically used by most HTTP libraries
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: 'your-api-key' });
```

---

### Method 4: Network-Level Routing (Advanced)

Use iptables or network routing rules to redirect traffic.

#### Using iptables (Linux)

```bash
# Redirect OpenAI traffic to Proxilion
sudo iptables -t nat -A OUTPUT -p tcp -d api.openai.com --dport 443 \
  -j DNAT --to-destination <proxilion-ip>:443

# Redirect Anthropic traffic
sudo iptables -t nat -A OUTPUT -p tcp -d api.anthropic.com --dport 443 \
  -j DNAT --to-destination <proxilion-ip>:443

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

#### Using pfctl (macOS)

```bash
# Create pf rule file
sudo nano /etc/pf.anchors/proxilion

# Add rules:
rdr pass on en0 inet proto tcp from any to api.openai.com port 443 -> <proxilion-ip> port 443
rdr pass on en0 inet proto tcp from any to api.anthropic.com port 443 -> <proxilion-ip> port 443

# Load rules
sudo pfctl -ef /etc/pf.anchors/proxilion
```

---

## 🔒 SSL/TLS Certificate Setup

For HTTPS interception, Proxilion needs to present valid SSL certificates.

### Option 1: Self-Signed Certificate (Development)

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=*.openai.com" \
  -addext "subjectAltName=DNS:api.openai.com,DNS:api.anthropic.com,DNS:generativelanguage.googleapis.com"

# Install certificate on client machines
# Linux:
sudo cp cert.pem /usr/local/share/ca-certificates/proxilion.crt
sudo update-ca-certificates

# macOS:
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem

# Windows:
certutil -addstore -f "ROOT" cert.pem
```

### Option 2: Let's Encrypt (Production)

```bash
# Use certbot to get certificates for your Proxilion domain
sudo certbot certonly --standalone -d proxy.yourcompany.com

# Configure Proxilion to use these certificates
```

### Option 3: Corporate CA Certificate

If your organization has a corporate CA, generate certificates signed by it:

```bash
# Generate CSR
openssl req -new -newkey rsa:4096 -nodes -keyout proxilion.key -out proxilion.csr \
  -subj "/CN=*.openai.com" \
  -addext "subjectAltName=DNS:api.openai.com,DNS:api.anthropic.com"

# Submit CSR to your corporate CA for signing
# Install signed certificate on Proxilion
```

---

## 🧪 Testing Transparent Proxy

### Test 1: Verify DNS Resolution

```bash
# Should resolve to Proxilion IP
nslookup api.openai.com
```

### Test 2: Test API Call

```bash
# OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-sonnet-20240229","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

### Test 3: Check Proxilion Logs

```bash
# View Proxilion logs to confirm traffic is being intercepted
curl http://proxilion.yourcompany.com:8787/metrics

# Should show request counts increasing
```

### Test 4: Verify Security Scanning

```bash
# Send a request with PII
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "My SSN is 123-45-6789"}]
  }'

# Check Proxilion logs - should show PII detection
```

---

## 📊 Monitoring Transparent Proxy

### Health Check

```bash
curl http://proxilion.yourcompany.com:8787/health
```

### Metrics

```bash
curl http://proxilion.yourcompany.com:8787/metrics
```

### Real-time Monitoring

Connect to Proxilion's real-time monitoring WebSocket:

```javascript
const ws = new WebSocket('ws://proxilion.yourcompany.com:8787/monitor');
ws.onmessage = (event) => {
  console.log('Event:', JSON.parse(event.data));
};
```

---

## 🔧 Troubleshooting

### Issue: SSL Certificate Errors

**Symptom:** Applications fail with SSL certificate verification errors

**Solution:**
1. Ensure Proxilion's SSL certificate is installed on client machines
2. For development, disable SSL verification (not recommended for production)
3. Use a certificate signed by a trusted CA

### Issue: DNS Not Resolving

**Symptom:** DNS still resolves to original AI provider IPs

**Solution:**
1. Flush DNS cache
2. Verify DNS server configuration
3. Check /etc/hosts file syntax
4. Restart DNS service

### Issue: Requests Not Being Intercepted

**Symptom:** Requests bypass Proxilion

**Solution:**
1. Verify DNS resolution: `nslookup api.openai.com`
2. Check network routing: `traceroute api.openai.com`
3. Verify Proxilion is running: `curl http://proxilion:8787/health`
4. Check firewall rules

### Issue: Performance Degradation

**Symptom:** Slow API responses

**Solution:**
1. Check Proxilion resource usage
2. Enable caching in Proxilion
3. Increase Proxilion instance size
4. Deploy Proxilion closer to applications (same region)

---

## 🎯 Best Practices

1. **Use DNS Override for Production** - Most reliable and transparent
2. **Deploy Proxilion in Same Region** - Minimize latency
3. **Enable Caching** - Reduce costs and improve performance
4. **Monitor Metrics** - Track request counts, latency, and errors
5. **Use Valid SSL Certificates** - Avoid certificate errors
6. **Test Thoroughly** - Verify all AI providers work correctly
7. **Have Fallback Plan** - Be able to quickly disable proxy if needed

---

## 🚀 Next Steps

- [Configure Security Policies](./SECURITY_POLICIES.md)
- [Set Up Compliance Monitoring](./COMPLIANCE.md)
- [Enable Cost Tracking](./COST_TRACKING.md)
- [Configure Alerts](./ALERTING.md)

---

**Need Help?** Check out the [FAQ](./FAQ.md) or [open an issue](https://github.com/proxilion/proxilion/issues).

