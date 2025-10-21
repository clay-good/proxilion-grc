# Certificate Installation Guide

This guide provides detailed instructions for installing the Proxilion Root CA certificate on various platforms and browsers.

## Overview

Proxilion uses a Man-in-the-Middle (MITM) proxy to inspect HTTPS traffic to AI providers. To avoid certificate warnings, the Proxilion Root CA certificate must be installed and trusted on all client devices.

## Download CA Certificate

The CA certificate can be downloaded from:
- **Admin Dashboard**: http://proxilion-server:8788/certificates
- **Direct Download**: http://proxilion-server:8788/api/certificates/ca/download

Available formats:
- **PEM** (.pem): For Linux, macOS, and most applications
- **DER** (.der): For Windows and some enterprise tools

## Installation by Platform

### Windows

#### Method 1: Certificate Manager (GUI)

1. Download the certificate in **DER format**
2. Double-click the downloaded `.der` file
3. Click "Install Certificate"
4. Select "Local Machine" (requires admin rights)
5. Click "Next"
6. Select "Place all certificates in the following store"
7. Click "Browse" and select "Trusted Root Certification Authorities"
8. Click "Next" then "Finish"
9. Click "Yes" on the security warning

#### Method 2: PowerShell (Automated)

Run PowerShell as Administrator:

```powershell
# Download certificate
Invoke-WebRequest -Uri "http://proxilion-server:8788/api/certificates/ca/download?format=der" -OutFile "proxilion-ca.der"

# Install certificate
Import-Certificate -FilePath "proxilion-ca.der" -CertStoreLocation Cert:\LocalMachine\Root

# Verify installation
Get-ChildItem -Path Cert:\LocalMachine\Root | Where-Object {$_.Subject -like "*Proxilion*"}
```

#### Method 3: Group Policy (Enterprise)

For domain-joined machines:

1. Open Group Policy Management Console
2. Create or edit a GPO
3. Navigate to: Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies → Trusted Root Certification Authorities
4. Right-click → Import
5. Select the Proxilion CA certificate
6. Apply GPO to target OUs
7. Run `gpupdate /force` on client machines

### macOS

#### Method 1: Keychain Access (GUI)

1. Download the certificate in **PEM format**
2. Double-click the downloaded `.pem` file
3. Keychain Access will open
4. Select "System" keychain
5. Enter admin password
6. Find "Proxilion Root CA" in the list
7. Double-click the certificate
8. Expand "Trust" section
9. Set "When using this certificate" to "Always Trust"
10. Close window and enter password again

#### Method 2: Command Line

```bash
# Download certificate
curl -o proxilion-ca.pem http://proxilion-server:8788/api/certificates/ca/download?format=pem

# Install to system keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain proxilion-ca.pem

# Verify installation
security find-certificate -c "Proxilion Root CA" /Library/Keychains/System.keychain
```

#### Method 3: MDM (Enterprise)

For managed Macs using Jamf, Intune, or other MDM:

1. Create a configuration profile
2. Add certificate payload
3. Upload Proxilion CA certificate
4. Set trust settings to "Always Trust"
5. Deploy to target devices

### Linux

#### Ubuntu/Debian

```bash
# Download certificate
curl -o proxilion-ca.pem http://proxilion-server:8788/api/certificates/ca/download?format=pem

# Copy to system certificates
sudo cp proxilion-ca.pem /usr/local/share/ca-certificates/proxilion-ca.crt

# Update certificate store
sudo update-ca-certificates

# Verify installation
ls -la /etc/ssl/certs/ | grep proxilion
```

#### RHEL/CentOS/Fedora

```bash
# Download certificate
curl -o proxilion-ca.pem http://proxilion-server:8788/api/certificates/ca/download?format=pem

# Copy to system certificates
sudo cp proxilion-ca.pem /etc/pki/ca-trust/source/anchors/

# Update certificate store
sudo update-ca-trust

# Verify installation
trust list | grep Proxilion
```

#### Arch Linux

```bash
# Download certificate
curl -o proxilion-ca.pem http://proxilion-server:8788/api/certificates/ca/download?format=pem

# Copy to system certificates
sudo cp proxilion-ca.pem /etc/ca-certificates/trust-source/anchors/

# Update certificate store
sudo trust extract-compat

# Verify installation
trust list | grep Proxilion
```

### iOS

#### Manual Installation

1. Email the certificate to the user or host it on a web server
2. Open the certificate on the iOS device
3. Tap "Install" (may require passcode)
4. Go to Settings → General → About → Certificate Trust Settings
5. Enable full trust for "Proxilion Root CA"

#### MDM Deployment

Using Apple Business Manager or MDM:

1. Create a configuration profile
2. Add certificate payload
3. Upload Proxilion CA certificate
4. Deploy to target devices

### Android

#### Manual Installation

1. Download the certificate to the device
2. Go to Settings → Security → Encryption & credentials
3. Tap "Install a certificate"
4. Select "CA certificate"
5. Tap "Install anyway" on the warning
6. Browse to the downloaded certificate
7. Enter device PIN/password
8. Certificate is installed

#### MDM Deployment

Using Android Enterprise or MDM:

1. Create a configuration profile
2. Add trusted CA certificate
3. Upload Proxilion CA certificate
4. Deploy to target devices

## Browser-Specific Configuration

### Chrome/Edge

Chrome and Edge use the system certificate store, so no additional configuration is needed after installing the certificate at the OS level.

### Firefox

Firefox uses its own certificate store:

1. Open Firefox
2. Go to Settings → Privacy & Security
3. Scroll to "Certificates"
4. Click "View Certificates"
5. Go to "Authorities" tab
6. Click "Import"
7. Select the Proxilion CA certificate
8. Check "Trust this CA to identify websites"
9. Click "OK"

#### Firefox Enterprise Policy

For managed Firefox installations, create `policies.json`:

**Windows**: `C:\Program Files\Mozilla Firefox\distribution\policies.json`
**macOS**: `/Applications/Firefox.app/Contents/Resources/distribution/policies.json`
**Linux**: `/usr/lib/firefox/distribution/policies.json`

```json
{
  "policies": {
    "Certificates": {
      "Install": [
        "/path/to/proxilion-ca.pem"
      ]
    }
  }
}
```

### Safari

Safari uses the macOS system keychain, so no additional configuration is needed after installing the certificate at the OS level.

## Verification

### Test Certificate Installation

Visit a test page through Proxilion:

```bash
curl -v https://chat.openai.com
```

Look for:
```
* Server certificate:
*  subject: CN=chat.openai.com
*  issuer: CN=Proxilion Root CA
*  SSL certificate verify ok.
```

### Browser Test

1. Open browser
2. Navigate to https://chat.openai.com
3. Click the padlock icon in address bar
4. View certificate details
5. Verify issuer is "Proxilion Root CA"
6. No certificate warnings should appear

### Command Line Verification

**Windows**:
```powershell
certutil -store Root | findstr Proxilion
```

**macOS**:
```bash
security find-certificate -c "Proxilion Root CA" -a
```

**Linux**:
```bash
awk -v cmd='openssl x509 -noout -subject' '/BEGIN/{close(cmd)};{print | cmd}' < /etc/ssl/certs/ca-certificates.crt | grep Proxilion
```

## Troubleshooting

### Certificate Warnings Still Appear

1. **Verify certificate is installed**:
   - Check system certificate store
   - Restart browser after installation

2. **Check certificate trust settings**:
   - Ensure certificate is trusted for SSL/TLS
   - Verify trust is set to "Always Trust" (macOS)

3. **Clear browser cache**:
   - Chrome: Settings → Privacy → Clear browsing data
   - Firefox: Settings → Privacy → Clear Data

4. **Check certificate validity**:
   ```bash
   openssl x509 -in proxilion-ca.pem -noout -dates
   ```

### Certificate Not Found

1. **Verify download**:
   - Check file size is not 0 bytes
   - Verify file format (PEM vs DER)

2. **Check file permissions**:
   ```bash
   ls -la proxilion-ca.pem
   ```

3. **Re-download certificate**:
   - Use direct download link
   - Try different format

### Installation Fails

1. **Check admin privileges**:
   - Windows: Run as Administrator
   - macOS/Linux: Use sudo

2. **Verify certificate format**:
   - Windows prefers DER
   - Linux/macOS prefer PEM

3. **Check for existing certificate**:
   - Remove old Proxilion certificates
   - Reinstall fresh certificate

## Automated Deployment

### Ansible Playbook

```yaml
---
- name: Install Proxilion CA Certificate
  hosts: all
  become: yes
  tasks:
    - name: Download CA certificate
      get_url:
        url: http://proxilion-server:8788/api/certificates/ca/download?format=pem
        dest: /tmp/proxilion-ca.pem

    - name: Install on Debian/Ubuntu
      when: ansible_os_family == "Debian"
      block:
        - copy:
            src: /tmp/proxilion-ca.pem
            dest: /usr/local/share/ca-certificates/proxilion-ca.crt
        - command: update-ca-certificates

    - name: Install on RedHat/CentOS
      when: ansible_os_family == "RedHat"
      block:
        - copy:
            src: /tmp/proxilion-ca.pem
            dest: /etc/pki/ca-trust/source/anchors/
        - command: update-ca-trust
```

### PowerShell Script (Windows)

```powershell
# Deploy-ProxilionCert.ps1
$certUrl = "http://proxilion-server:8788/api/certificates/ca/download?format=der"
$certPath = "$env:TEMP\proxilion-ca.der"

# Download certificate
Invoke-WebRequest -Uri $certUrl -OutFile $certPath

# Install certificate
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root

# Cleanup
Remove-Item $certPath

Write-Host "Proxilion CA certificate installed successfully"
```

## Security Considerations

### Certificate Fingerprint Verification

Always verify the certificate fingerprint before installation:

```bash
openssl x509 -in proxilion-ca.pem -noout -fingerprint -sha256
```

Compare with the fingerprint displayed in the Proxilion admin dashboard.

### Certificate Rotation

When rotating certificates:

1. Generate new CA certificate
2. Deploy new certificate to all devices
3. Wait for propagation (24-48 hours)
4. Remove old certificate from devices
5. Update Proxilion configuration

### Monitoring

Monitor certificate installation status:
- Track devices with certificate installed
- Alert on certificate expiration
- Monitor for certificate errors in logs

## Support

For assistance with certificate installation:
- Documentation: https://github.com/proxilion/proxilion
- Issues: https://github.com/proxilion/proxilion/issues
- Enterprise Support: support@proxilion.com

