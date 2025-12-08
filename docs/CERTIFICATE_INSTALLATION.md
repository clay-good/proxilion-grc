# Certificate Installation Guide

This guide covers installation of the Proxilion GRC CA certificate on various platforms and applications.

---

## Overview

Proxilion GRC operates as a TLS-intercepting proxy (MITM). For this to work, clients must trust the Proxilion CA certificate. This guide covers installation on all major platforms.

**Warning:** Installing a CA certificate allows the certificate holder to intercept all HTTPS traffic. Only install certificates from trusted sources.

---

## Generating the CA Certificate

### Using Proxilion Certificate Manager

```bash
# Generate CA certificate (if not already done)
npm run generate-certs

# Output location:
# - CA Certificate: certs/proxilion-ca.crt
# - CA Private Key: certs/proxilion-ca.key (keep secure!)
```

### Manual Generation with OpenSSL

```bash
# Generate private key
openssl genrsa -out proxilion-ca.key 4096

# Generate CA certificate (valid for 10 years)
openssl req -x509 -new -nodes \
  -key proxilion-ca.key \
  -sha256 -days 3650 \
  -out proxilion-ca.crt \
  -subj "/CN=Proxilion GRC CA/O=Your Organization/C=US"

# Verify certificate
openssl x509 -in proxilion-ca.crt -text -noout
```

---

## Windows Installation

### Method 1: GUI (Per-User)

1. Double-click `proxilion-ca.crt`
2. Click "Install Certificate"
3. Select "Current User" or "Local Machine"
4. Choose "Place all certificates in the following store"
5. Click "Browse" and select "Trusted Root Certification Authorities"
6. Click "Next" then "Finish"
7. Confirm the security warning

### Method 2: Command Line (System-Wide)

```powershell
# Run as Administrator
certutil -addstore -f "ROOT" proxilion-ca.crt
```

### Method 3: Group Policy (Enterprise)

1. Copy certificate to a network share
2. Open Group Policy Management
3. Create/edit a GPO linked to target OUs
4. Navigate to: Computer Configuration > Policies > Windows Settings > Security Settings > Public Key Policies > Trusted Root Certification Authorities
5. Right-click > Import > Select the certificate
6. Force GPO update: `gpupdate /force`

### Verification

```powershell
# List trusted root CAs
certutil -store ROOT | findstr "Proxilion"
```

---

## macOS Installation

### Method 1: GUI (Per-User)

1. Double-click `proxilion-ca.crt`
2. Keychain Access opens automatically
3. Select "login" or "System" keychain
4. Click "Add"
5. Find the certificate in Keychain Access
6. Double-click it > Trust > "Always Trust"

### Method 2: Command Line

```bash
# Add to system keychain (requires sudo)
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain proxilion-ca.crt

# Add to user keychain
security add-trusted-cert -d -r trustRoot \
  -k ~/Library/Keychains/login.keychain-db proxilion-ca.crt
```

### Method 3: Configuration Profile (MDM)

Create a `.mobileconfig` profile:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>proxilion-ca.crt</string>
            <key>PayloadContent</key>
            <data>
                <!-- Base64 encoded certificate content -->
            </data>
            <key>PayloadDisplayName</key>
            <string>Proxilion GRC CA</string>
            <key>PayloadIdentifier</key>
            <string>com.proxilion.ca</string>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadUUID</key>
            <string>YOUR-UUID-HERE</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Proxilion GRC Certificate</string>
    <key>PayloadIdentifier</key>
    <string>com.proxilion.profile</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>YOUR-PROFILE-UUID</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
```

### Verification

```bash
# Check if certificate is trusted
security find-certificate -c "Proxilion" -a
```

---

## Linux Installation

### Ubuntu/Debian

```bash
# Copy certificate to trusted store
sudo cp proxilion-ca.crt /usr/local/share/ca-certificates/proxilion-ca.crt

# Update certificate store
sudo update-ca-certificates

# Verify
ls /etc/ssl/certs | grep -i proxilion
```

### RHEL/CentOS/Fedora

```bash
# Copy certificate
sudo cp proxilion-ca.crt /etc/pki/ca-trust/source/anchors/

# Update trust store
sudo update-ca-trust extract

# Verify
trust list | grep -i proxilion
```

### Arch Linux

```bash
# Copy certificate
sudo cp proxilion-ca.crt /etc/ca-certificates/trust-source/anchors/

# Update trust store
sudo trust extract-compat
```

---

## iOS Installation

### Method 1: Direct Download

1. Host the certificate on a web server
2. Navigate to the URL on iOS device
3. Tap "Allow" to download the profile
4. Go to Settings > General > VPN & Device Management
5. Tap the downloaded profile > Install
6. Enter device passcode
7. Go to Settings > General > About > Certificate Trust Settings
8. Enable full trust for Proxilion CA

### Method 2: MDM Deployment

See [MDM Configuration Guide](MDM_CONFIGURATION.md) for deploying via:
- Microsoft Intune
- Jamf Pro
- VMware Workspace ONE

### Method 3: Email

1. Email the certificate as attachment
2. Open email on iOS device
3. Tap certificate attachment
4. Follow installation prompts

### Important: Enable Full Trust

After installation, you must enable full trust:

1. Settings > General > About > Certificate Trust Settings
2. Toggle ON for "Proxilion GRC CA"

---

## Android Installation

### Method 1: Direct Download

1. Transfer certificate to device
2. Go to Settings > Security > Encryption & credentials
3. Tap "Install a certificate" > "CA certificate"
4. Select the certificate file
5. Confirm installation

### Method 2: Via Settings

1. Go to Settings > Security > Advanced > Encryption & credentials
2. Tap "Install from storage"
3. Select the certificate file
4. Name the certificate and tap OK

### Android 11+ Limitations

Starting with Android 11, user-installed CA certificates are NOT trusted by apps by default. Options:

1. **Work Profile** - Install via MDM in work profile
2. **Network Security Config** - App developers must opt-in
3. **Root/Magisk** - Install as system certificate (not recommended)

### Verification

Settings > Security > Encryption & credentials > Trusted credentials > User tab

---

## Browser-Specific Installation

### Firefox (All Platforms)

Firefox uses its own certificate store:

1. Open Firefox > Settings > Privacy & Security
2. Scroll to "Certificates" section
3. Click "View Certificates"
4. Go to "Authorities" tab
5. Click "Import"
6. Select the certificate file
7. Check "Trust this CA to identify websites"
8. Click OK

Command line (profiles.ini location varies):
```bash
# Find Firefox profile
cd ~/.mozilla/firefox/*.default-release

# Import certificate using certutil
certutil -A -n "Proxilion GRC CA" -t "C,," -i /path/to/proxilion-ca.crt -d sql:.
```

### Chrome (All Platforms)

Chrome uses the system certificate store on all platforms except Linux, where it may use its own NSS database:

```bash
# Linux Chrome NSS database
certutil -A -n "Proxilion GRC CA" -t "C,," \
  -i proxilion-ca.crt \
  -d sql:$HOME/.pki/nssdb
```

### Safari

Safari uses the macOS/iOS system keychain. Follow the macOS or iOS instructions above.

### Edge

Edge uses the Windows system certificate store. Follow the Windows instructions above.

---

## Application-Specific Installation

### Node.js

```bash
# Environment variable
export NODE_EXTRA_CA_CERTS=/path/to/proxilion-ca.crt
node your-app.js

# Or in code
const https = require('https');
const fs = require('fs');

const ca = fs.readFileSync('/path/to/proxilion-ca.crt');
https.globalAgent.options.ca = ca;
```

### Python (requests)

```python
import requests

# Per-request
response = requests.get('https://api.openai.com',
                       verify='/path/to/proxilion-ca.crt')

# Global
import os
os.environ['REQUESTS_CA_BUNDLE'] = '/path/to/proxilion-ca.crt'
```

### Python (httpx)

```python
import httpx

client = httpx.Client(verify='/path/to/proxilion-ca.crt')
```

### Java

```bash
# Add to Java keystore
keytool -importcert -alias proxilion \
  -file proxilion-ca.crt \
  -keystore $JAVA_HOME/lib/security/cacerts \
  -storepass changeit
```

### Go

```go
import (
    "crypto/tls"
    "crypto/x509"
    "io/ioutil"
    "net/http"
)

caCert, _ := ioutil.ReadFile("/path/to/proxilion-ca.crt")
caCertPool := x509.NewCertPool()
caCertPool.AppendCertsFromPEM(caCert)

client := &http.Client{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{
            RootCAs: caCertPool,
        },
    },
}
```

### curl

```bash
curl --cacert /path/to/proxilion-ca.crt https://api.openai.com
```

### wget

```bash
wget --ca-certificate=/path/to/proxilion-ca.crt https://api.openai.com
```

---

## Certificate Renewal

Certificates have expiration dates. Plan for renewal:

### Check Expiration

```bash
openssl x509 -in proxilion-ca.crt -noout -enddate
```

### Renewal Process

1. Generate new CA certificate before expiration
2. Deploy new certificate to all systems
3. Keep old certificate until all systems updated
4. Remove old certificate after transition period

### Automated Monitoring

Add to monitoring system:

```bash
# Alert if certificate expires within 30 days
EXPIRY=$(openssl x509 -in proxilion-ca.crt -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

if [ $DAYS_LEFT -lt 30 ]; then
    echo "WARNING: Certificate expires in $DAYS_LEFT days"
fi
```

---

## Troubleshooting

### Certificate Not Trusted

**Symptom:** SSL errors even after installation

**Solutions:**
1. Verify certificate is in correct store (system vs user)
2. Restart browser/application after installation
3. Check certificate chain is complete
4. Verify certificate is not expired

### "Certificate is not trusted" in Browser

**Solutions:**
1. Firefox: Check Firefox's own certificate store
2. Chrome Linux: Check NSS database
3. Clear browser cache and restart
4. Verify no proxy/VPN interfering

### Application Ignores System Certificates

**Solutions:**
1. Check if application has its own certificate store
2. Set environment variables (NODE_EXTRA_CA_CERTS, etc.)
3. Configure application directly
4. Some applications require recompilation

### Mobile Certificate Not Working

**Solutions:**
1. iOS: Ensure full trust is enabled in Certificate Trust Settings
2. Android 11+: User certificates not trusted by default
3. Check MDM profile is applied correctly
4. Verify certificate format (PEM vs DER)

---

## Security Best Practices

1. **Protect Private Key** - CA private key should be stored securely, never distributed
2. **Short Validity** - Consider shorter validity periods (1-2 years) for easier rotation
3. **Separate CAs** - Use different CAs for different environments (dev/staging/prod)
4. **Audit** - Log certificate usage and access
5. **Key Length** - Use at least 4096-bit RSA or P-384 ECDSA
6. **Revocation** - Have a plan for certificate revocation if compromised

---

## Next Steps

- [DNS Configuration Guide](DNS_CONFIGURATION.md)
- [MDM Configuration Guide](MDM_CONFIGURATION.md)
- [Setup Guide](SETUP.md)
