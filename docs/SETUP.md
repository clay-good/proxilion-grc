# Proxilion Setup Guide

Complete guide to deploying and configuring Proxilion for enterprise AI security.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Deployment Options](#deployment-options)
3. [Network Configuration](#network-configuration)
4. [Device Configuration](#device-configuration)
5. [Certificate Installation](#certificate-installation)
6. [Verification & Testing](#verification--testing)

---

## Quick Start

Get Proxilion running in 5 minutes:

```bash
# Clone and install
git clone https://github.com/proxilion/proxilion.git
cd proxilion
npm install

# Build and start
npm run build
npm start

# Access admin dashboard
open http://localhost:8788
```

For production deployment, continue with the sections below.

---

## Deployment Options

### Option 1: Cloudflare Workers (Recommended)

**Best for:** Global enterprises, zero infrastructure, auto-scaling

**Benefits:**
- 🌍 300+ global edge locations
- ⚡ <10ms latency overhead
- 📈 Auto-scaling to millions of requests
- 💰 $15/month for 1M requests/day
- 🔒 99.99% uptime SLA

**Setup:**

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
npm run deploy:cloudflare
```

**Configuration:**

1. **Create KV Namespaces** (for data storage):
```bash
wrangler kv:namespace create "POLICIES"
wrangler kv:namespace create "AUDIT_LOG"
wrangler kv:namespace create "CERTIFICATES"
```

2. **Update wrangler.toml** with KV namespace IDs

3. **Configure Cloudflare Gateway** (for DNS/VPN routing):
   - Go to Cloudflare Zero Trust Dashboard
   - Navigate to Gateway → Policies
   - Create HTTP policy to route AI domains through your Worker
   - Add domains: `chat.openai.com`, `claude.ai`, `gemini.google.com`

4. **Set up Secure Web Gateway:**
   - Enable Gateway proxy in Zero Trust
   - Deploy WARP client to devices OR configure DNS filtering
   - Route traffic through your Proxilion Worker URL

**Cloudflare Gateway Integration:**

```yaml
# Gateway HTTP Policy Example
Name: Route AI Traffic to Proxilion
Action: Allow
Traffic:
  - Destination: chat.openai.com, claude.ai, gemini.google.com
Settings:
  - Override destination: your-worker.workers.dev
  - Preserve host header: Yes
```

**DNS Configuration with Cloudflare:**

```bash
# Add DNS records in Cloudflare Dashboard
chat.openai.com    CNAME  your-worker.workers.dev
claude.ai          CNAME  your-worker.workers.dev
gemini.google.com  CNAME  your-worker.workers.dev
```

---

### Option 2: Self-Hosted (On-Premises)

**Best for:** Regulated industries, air-gapped environments, data sovereignty

**Requirements:**
- Linux server (Ubuntu 20.04+, Debian 11+, RHEL 8+)
- Node.js 18+
- 2GB RAM minimum, 4GB recommended
- Ports 8787 (proxy) and 8788 (admin) available

**Automated Deployment:**

```bash
# Run deployment script (handles everything)
sudo bash scripts/deploy-enterprise.sh
```

The script automatically:
- ✅ Installs dependencies
- ✅ Creates service user and directories
- ✅ Builds the application
- ✅ Generates MITM certificates
- ✅ Configures systemd service
- ✅ Sets up firewall rules
- ✅ Configures log rotation

**Manual Deployment:**

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create service user
sudo useradd -r -s /bin/false proxilion

# Clone and build
git clone https://github.com/proxilion/proxilion.git /opt/proxilion
cd /opt/proxilion
npm install
npm run build

# Generate certificates
npm run generate-certs

# Create systemd service
sudo cp scripts/proxilion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable proxilion
sudo systemctl start proxilion
```

**Service Management:**

```bash
# Start/stop/restart
sudo systemctl start proxilion
sudo systemctl stop proxilion
sudo systemctl restart proxilion

# View status and logs
sudo systemctl status proxilion
sudo journalctl -u proxilion -f
```

---

### Option 3: Docker

```bash
# Build image
docker build -t proxilion:latest .

# Run container
docker run -d \
  --name proxilion \
  -p 8787:8787 \
  -p 8788:8788 \
  -v /opt/proxilion/certs:/app/certs \
  -v /opt/proxilion/data:/app/data \
  -e NODE_ENV=production \
  proxilion:latest
```

---

### Option 4: Kubernetes

```bash
# Deploy with Helm
helm install proxilion ./helm/proxilion \
  --set replicas=3 \
  --set ingress.enabled=true \
  --set ingress.host=proxilion.company.com
```

---

## Network Configuration

### DNS Configuration

Route AI traffic through Proxilion by overriding DNS resolution.

#### Method 1: Internal DNS Server (Recommended)

**BIND Configuration:**

```bind
# Add to zone file
chat.openai.com.        IN  A   192.168.1.100
chatgpt.com.            IN  A   192.168.1.100
claude.ai.              IN  A   192.168.1.100
gemini.google.com.      IN  A   192.168.1.100
bard.google.com.        IN  A   192.168.1.100
```

Replace `192.168.1.100` with your Proxilion server IP.

```bash
# Reload BIND
sudo systemctl reload named
```

**Windows DNS Server:**

1. Open DNS Manager
2. Navigate to forward lookup zone
3. Add A records for each AI domain → Proxilion IP
4. Set TTL to 300 seconds

**dnsmasq Configuration:**

```bash
# Add to /etc/dnsmasq.conf
address=/chat.openai.com/192.168.1.100
address=/chatgpt.com/192.168.1.100
address=/claude.ai/192.168.1.100
address=/gemini.google.com/192.168.1.100

# Restart dnsmasq
sudo systemctl restart dnsmasq
```

#### Method 2: Pi-hole

```bash
# Add to /etc/pihole/custom.list
192.168.1.100 chat.openai.com
192.168.1.100 chatgpt.com
192.168.1.100 claude.ai
192.168.1.100 gemini.google.com

# Restart DNS
pihole restartdns
```

#### Method 3: Cloudflare Gateway (Zero Trust)

1. Go to Cloudflare Zero Trust Dashboard
2. Navigate to Gateway → DNS Policies
3. Create policy: "Route AI Traffic"
4. Add DNS overrides for AI domains → Your Proxilion Worker
5. Deploy WARP client to devices

#### Method 4: VPN-Based Routing

**OpenVPN Configuration:**

```bash
# Add to server.conf
push "route 1.2.3.4 255.255.255.255"  # OpenAI IP
push "route 5.6.7.8 255.255.255.255"  # Anthropic IP

# Or use DNS override
push "dhcp-option DNS 192.168.1.100"  # Your Proxilion DNS
```

**WireGuard Configuration:**

```ini
[Interface]
DNS = 192.168.1.100  # Proxilion DNS server

[Peer]
AllowedIPs = 0.0.0.0/0
```

---

## Device Configuration

### Mobile Devices (iOS & Android)

Deploy proxy configuration via MDM to enforce Proxilion on all mobile devices.

#### Microsoft Intune

1. **Create Configuration Profile:**
   - Go to Devices → Configuration Profiles → Create
   - Platform: iOS/iPadOS or Android
   - Profile type: Device restrictions

2. **Configure Proxy Settings:**
   ```
   Proxy Type: Manual
   Proxy Server: proxilion.company.com
   Proxy Port: 8787
   ```

3. **Deploy Certificate:**
   - Go to Devices → Configuration Profiles → Create
   - Profile type: Trusted certificate
   - Upload Proxilion CA certificate (download from http://proxilion:8788/api/certificates/ca/download)

4. **Assign to Groups:**
   - Select user/device groups
   - Deploy profile

#### Jamf Pro (Apple)

1. **Create Configuration Profile:**
   - Settings → Computer/Device Management → Configuration Profiles
   - New → Network → Global HTTP Proxy

2. **Proxy Settings:**
   ```
   Proxy Server: proxilion.company.com
   Proxy Port: 8787
   Proxy Type: Manual
   ```

3. **Add Certificate:**
   - Certificates → Upload → Select Proxilion CA cert
   - Scope to all devices

4. **Deploy Profile**

#### VMware Workspace ONE

1. Resources & Policies → Profiles → Add Profile
2. Select iOS or Android
3. Add Proxy Payload:
   - Server: proxilion.company.com
   - Port: 8787
4. Add Certificate Payload:
   - Upload Proxilion CA certificate
5. Publish to devices

#### Android Enterprise (Google Workspace)

1. **Create Managed Configuration:**
   ```json
   {
     "proxy": {
       "mode": "manual",
       "host": "proxilion.company.com",
       "port": 8787
     }
   }
   ```

2. **Deploy Certificate:**
   - Security → Credentials → Install from storage
   - Push CA certificate via managed configuration

---

### Desktop/Laptop Devices

#### Windows (Group Policy)

**Proxy Configuration:**

1. Open Group Policy Management
2. Create new GPO: "Proxilion Proxy Settings"
3. Edit GPO:
   - Computer Configuration → Preferences → Control Panel Settings → Internet Settings
   - New → Internet Explorer 10
   - Connections tab → LAN Settings
   - Enable "Use a proxy server"
   - Address: proxilion.company.com:8787
4. Link GPO to OUs

**Certificate Deployment:**

1. Edit same GPO or create new
2. Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies
3. Right-click "Trusted Root Certification Authorities" → Import
4. Select Proxilion CA certificate
5. Apply GPO

**PowerShell Script (Alternative):**

```powershell
# Deploy via login script
$proxy = "proxilion.company.com:8787"
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -Value 1
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyServer -Value $proxy

# Install certificate
$cert = "\\server\share\proxilion-ca.cer"
Import-Certificate -FilePath $cert -CertStoreLocation Cert:\LocalMachine\Root
```

#### macOS

**Proxy Configuration:**

```bash
# Via script
sudo networksetup -setwebproxy "Wi-Fi" proxilion.company.com 8787
sudo networksetup -setsecurewebproxy "Wi-Fi" proxilion.company.com 8787
sudo networksetup -setwebproxystate "Wi-Fi" on
sudo networksetup -setsecurewebproxystate "Wi-Fi" on
```

**Certificate Installation:**

```bash
# Download and install CA certificate
curl -o proxilion-ca.crt http://proxilion:8788/api/certificates/ca/download
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain proxilion-ca.crt
```

#### Linux

**Proxy Configuration:**

```bash
# System-wide proxy (Ubuntu/Debian)
cat >> /etc/environment << EOF
http_proxy="http://proxilion.company.com:8787"
https_proxy="http://proxilion.company.com:8787"
HTTP_PROXY="http://proxilion.company.com:8787"
HTTPS_PROXY="http://proxilion.company.com:8787"
EOF

# For current session
export http_proxy="http://proxilion.company.com:8787"
export https_proxy="http://proxilion.company.com:8787"
```

**Certificate Installation:**

```bash
# Ubuntu/Debian
sudo cp proxilion-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates

# RHEL/CentOS
sudo cp proxilion-ca.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

---

## Certificate Installation

The Proxilion CA certificate must be trusted on all devices to avoid certificate warnings.

### Download Certificate

```bash
# From admin dashboard
http://proxilion-server:8788/certificates

# Direct download (PEM format)
curl -o proxilion-ca.crt http://proxilion-server:8788/api/certificates/ca/download

# DER format (for Windows)
curl -o proxilion-ca.cer http://proxilion-server:8788/api/certificates/ca/download?format=der
```

### Platform-Specific Installation

#### Windows

**GUI Method:**
1. Double-click `proxilion-ca.cer`
2. Click "Install Certificate"
3. Select "Local Machine" (requires admin)
4. Choose "Trusted Root Certification Authorities"
5. Click Finish

**PowerShell Method:**
```powershell
Import-Certificate -FilePath "proxilion-ca.cer" -CertStoreLocation Cert:\LocalMachine\Root
```

#### macOS

**GUI Method:**
1. Double-click `proxilion-ca.crt`
2. Keychain Access opens
3. Select "System" keychain
4. Enter admin password
5. Double-click certificate → Trust → Always Trust

**Command Line:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain proxilion-ca.crt
```

#### iOS

**Via MDM (Recommended):**
- Deploy as trusted certificate profile via Intune/Jamf/Workspace ONE

**Manual Installation:**
1. Email certificate to user or host on web server
2. User taps certificate file
3. Settings → Profile Downloaded → Install
4. Enter passcode
5. Settings → General → About → Certificate Trust Settings
6. Enable trust for Proxilion Root CA

#### Android

**Via MDM (Recommended):**
- Deploy via managed configuration

**Manual Installation:**
1. Download certificate to device
2. Settings → Security → Encryption & credentials
3. Install from storage
4. Select certificate file
5. Name it "Proxilion CA"
6. Select "VPN and apps" or "Wi-Fi"

#### Linux

```bash
# Ubuntu/Debian
sudo cp proxilion-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates

# RHEL/CentOS/Fedora
sudo cp proxilion-ca.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust extract

# Arch Linux
sudo cp proxilion-ca.crt /etc/ca-certificates/trust-source/anchors/
sudo trust extract-compat
```

---

## Verification & Testing

### 1. Verify Proxilion is Running

```bash
# Check service status
sudo systemctl status proxilion

# Check ports are listening
sudo netstat -tlnp | grep -E '8787|8788'

# Test admin dashboard
curl http://localhost:8788/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600
}
```

### 2. Verify DNS Resolution

```bash
# Test DNS override
nslookup chat.openai.com

# Should return your Proxilion server IP
# Expected: 192.168.1.100 (or your server IP)
```

### 3. Verify Certificate Trust

**Windows:**
```powershell
Get-ChildItem -Path Cert:\LocalMachine\Root | Where-Object {$_.Subject -like "*Proxilion*"}
```

**macOS/Linux:**
```bash
security find-certificate -c "Proxilion" -a
```

### 4. Test AI Traffic Interception

```bash
# Test with curl (should be intercepted)
curl -v https://chat.openai.com

# Check Proxilion logs
sudo journalctl -u proxilion -f
```

You should see:
- Certificate presented by Proxilion
- Request logged in Proxilion dashboard

### 5. Test PII Blocking

1. Open browser and navigate to https://chat.openai.com
2. Try to send: "My SSN is 123-45-6789"
3. Request should be blocked
4. Check admin dashboard at http://proxilion:8788/monitor
5. Verify blocked request appears with "SSN detected"

### 6. Test Mobile Device

1. Configure test device with MDM profile
2. Open ChatGPT app or browser
3. Verify traffic routes through Proxilion
4. Check dashboard for mobile device requests

### 7. Monitor Dashboard

Access the admin dashboard:
```
http://proxilion-server:8788
```

Verify:
- ✅ Real-time metrics updating
- ✅ Blocked requests appearing
- ✅ PII detections logged
- ✅ Compliance violations tracked

---

## Troubleshooting

### DNS Not Resolving

```bash
# Clear DNS cache
# Windows
ipconfig /flushdns

# macOS
sudo dscacheutil -flushcache

# Linux
sudo systemd-resolve --flush-caches
```

### Certificate Not Trusted

- Verify certificate is in correct store (Root CA, not Personal)
- Check certificate hasn't expired
- Restart browser after installing certificate
- On mobile, ensure certificate trust is enabled in settings

### Traffic Not Being Intercepted

1. Verify DNS is resolving to Proxilion IP
2. Check firewall allows ports 8787 and 8788
3. Verify Proxilion service is running
4. Check logs for errors: `sudo journalctl -u proxilion -f`

### High Latency

- Enable caching in Proxilion config
- Check network latency to AI providers
- Increase worker threads if CPU-bound
- Consider deploying closer to users (Cloudflare Workers)

---

## Next Steps

1. **Configure Security Policies:** http://proxilion:8788/policies
2. **Customize PII Patterns:** http://proxilion:8788/security
3. **Set Up Alerts:** Configure SIEM integration or webhooks
4. **Review Compliance:** Check compliance dashboard for violations
5. **Train Users:** Educate employees on AI security policies

---

## Support

- **Documentation:** https://github.com/proxilion/proxilion/tree/main/docs
- **Issues:** https://github.com/proxilion/proxilion/issues
- **Discussions:** https://github.com/proxilion/proxilion/discussions

---

## Additional Resources

- **Architecture Guide:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Advanced Features:** [docs/ADVANCED_FEATURES.md](docs/ADVANCED_FEATURES.md)
- **Performance Tuning:** [docs/PERFORMANCE_OPTIMIZATION.md](docs/PERFORMANCE_OPTIMIZATION.md)
- **API Documentation:** [docs/GRAPHQL_API.md](docs/GRAPHQL_API.md)

