# MDM Configuration Guide for Mobile Devices

## Overview

This guide explains how to configure Mobile Device Management (MDM) systems to enforce Proxilion proxy settings on iOS and Android devices, ensuring all AI traffic is routed through Proxilion for security and compliance.

## Supported MDM Platforms

- ✅ Microsoft Intune
- ✅ Jamf Pro (Apple)
- ✅ VMware Workspace ONE
- ✅ MobileIron / Ivanti
- ✅ Google Workspace (Android)
- ✅ Cisco Meraki Systems Manager
- ✅ IBM MaaS360

## iOS Configuration

### Step 1: Create Configuration Profile

Create a `.mobileconfig` file with proxy and certificate settings:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <!-- Proxy Configuration -->
        <dict>
            <key>PayloadType</key>
            <string>com.apple.proxy.http.global</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.company.proxilion.proxy</string>
            <key>PayloadUUID</key>
            <string>GENERATE-UUID-HERE</string>
            <key>PayloadDisplayName</key>
            <string>Proxilion Security Proxy</string>
            <key>PayloadDescription</key>
            <string>Routes AI traffic through Proxilion for security</string>
            
            <key>ProxyType</key>
            <string>Manual</string>
            <key>HTTPEnable</key>
            <integer>1</integer>
            <key>HTTPProxy</key>
            <string>proxilion.company.com</string>
            <key>HTTPPort</key>
            <integer>8787</integer>
            <key>HTTPSEnable</key>
            <integer>1</integer>
            <key>HTTPSProxy</key>
            <string>proxilion.company.com</string>
            <key>HTTPSPort</key>
            <integer>8787</integer>
            
            <!-- Bypass internal domains -->
            <key>ProxyBypassDomains</key>
            <array>
                <string>*.company.com</string>
                <string>localhost</string>
                <string>127.0.0.1</string>
            </array>
        </dict>
        
        <!-- CA Certificate -->
        <dict>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.company.proxilion.cert</string>
            <key>PayloadUUID</key>
            <string>GENERATE-UUID-HERE</string>
            <key>PayloadDisplayName</key>
            <string>Proxilion Root CA</string>
            <key>PayloadDescription</key>
            <string>Trusted certificate for Proxilion MITM inspection</string>
            <key>PayloadCertificateFileName</key>
            <string>proxilion-ca.crt</string>
            <key>PayloadContent</key>
            <data>
            <!-- Base64-encoded CA certificate goes here -->
            MIIDXTCCAkWgAwIBAgIJAKL...
            </data>
        </dict>
    </array>
    
    <key>PayloadDisplayName</key>
    <string>Proxilion Security Configuration</string>
    <key>PayloadIdentifier</key>
    <string>com.company.proxilion</string>
    <key>PayloadRemovalDisallowed</key>
    <true/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>GENERATE-UUID-HERE</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
```

### Step 2: Deploy via MDM

#### Microsoft Intune

1. Go to **Devices** > **Configuration profiles** > **Create profile**
2. Platform: **iOS/iPadOS**
3. Profile type: **Custom**
4. Upload the `.mobileconfig` file
5. Assign to device groups
6. Deploy

#### Jamf Pro

1. Go to **Configuration Profiles** > **New**
2. **General**: Name the profile "Proxilion Security"
3. **Network** > **Global HTTP Proxy**:
   - Proxy Server: `proxilion.company.com`
   - Port: `8787`
   - Bypass domains: `*.company.com, localhost`
4. **Certificates**: Upload Proxilion CA certificate
5. **Scope**: Assign to all devices or specific groups
6. Save and deploy

#### VMware Workspace ONE

1. Go to **Resources** > **Profiles & Baselines** > **Profiles**
2. **Add** > **Add Profile** > **iOS**
3. **Proxy**:
   - Type: Manual
   - Server: `proxilion.company.com`
   - Port: `8787`
4. **Credentials** > **Certificates**: Upload CA cert
5. **Assignment**: Assign to organization group
6. Publish

### Step 3: Verify iOS Configuration

```bash
# On iOS device:
# 1. Go to Settings > General > VPN & Device Management
# 2. Verify "Proxilion Security Configuration" is installed
# 3. Go to Settings > General > About > Certificate Trust Settings
# 4. Verify "Proxilion Root CA" is trusted

# Test proxy:
# 1. Open Safari
# 2. Navigate to https://chat.openai.com
# 3. Traffic should route through Proxilion
```

## Android Configuration

### Step 1: Create Managed Configuration

Create a JSON configuration for Android Enterprise:

```json
{
  "kind": "androidenterprise#managedConfiguration",
  "productId": "app:com.android.chrome",
  "managedProperty": [
    {
      "key": "ProxyMode",
      "valueBundleArray": [
        {
          "managedProperty": [
            {
              "key": "ProxyServerMode",
              "valueInteger": 2
            },
            {
              "key": "ProxyServer",
              "valueString": "proxilion.company.com:8787"
            },
            {
              "key": "ProxyBypassList",
              "valueString": "*.company.com,localhost,127.0.0.1"
            }
          ]
        }
      ]
    }
  ]
}
```

### Step 2: Deploy via MDM

#### Microsoft Intune (Android Enterprise)

1. Go to **Apps** > **App configuration policies** > **Add** > **Managed devices**
2. Platform: **Android Enterprise**
3. Profile type: **Work Profile Only** or **Fully Managed**
4. Associated app: **Chrome** (or other browsers)
5. Configuration settings:
   ```json
   {
     "ProxyMode": "manual",
     "ProxyServer": "proxilion.company.com:8787",
     "ProxyBypassList": "*.company.com,localhost"
   }
   ```
6. Assign to groups
7. Deploy

#### Google Workspace (Android)

1. Go to **Admin Console** > **Devices** > **Mobile & endpoints**
2. **Settings** > **Network**
3. **Proxy**:
   - Type: Manual
   - Host: `proxilion.company.com`
   - Port: `8787`
   - Bypass: `*.company.com,localhost`
4. **Certificates**: Upload Proxilion CA
5. Apply to organization units

#### VMware Workspace ONE (Android)

1. Go to **Resources** > **Profiles & Baselines** > **Profiles**
2. **Add** > **Add Profile** > **Android**
3. **Wi-Fi**:
   - Proxy: Manual
   - Proxy hostname: `proxilion.company.com`
   - Proxy port: `8787`
4. **Credentials** > **Certificates**: Upload CA cert
5. **Assignment**: Assign to smart groups
6. Publish

### Step 3: Install CA Certificate on Android

#### Via MDM (Recommended)

```xml
<!-- Android Device Policy -->
<managedConfiguration>
  <trustedCaCerts>
    <cert>
      <!-- Base64-encoded CA certificate -->
      MIIDXTCCAkWgAwIBAgIJAKL...
    </cert>
  </trustedCaCerts>
</managedConfiguration>
```

#### Manual Installation (for testing)

```bash
# 1. Transfer proxilion-ca.crt to device
adb push proxilion-ca.crt /sdcard/Download/

# 2. On device:
# Settings > Security > Encryption & credentials > Install a certificate
# > CA certificate > Install anyway
# Select proxilion-ca.crt from Downloads
```

### Step 4: Verify Android Configuration

```bash
# On Android device:
# 1. Go to Settings > Network & internet > Advanced > Private DNS
# 2. Verify proxy is configured
# 3. Go to Settings > Security > Trusted credentials > User
# 4. Verify "Proxilion Root CA" is listed

# Test proxy:
# 1. Open Chrome
# 2. Navigate to https://chat.openai.com
# 3. Traffic should route through Proxilion
```

## Per-App VPN Configuration (Advanced)

For more granular control, configure per-app VPN to route only specific apps through Proxilion:

### iOS Per-App VPN

```xml
<dict>
    <key>PayloadType</key>
    <string>com.apple.vpn.managed</string>
    <key>VPNType</key>
    <string>VPN</string>
    <key>VPNSubType</key>
    <string>com.proxilion.vpn</string>
    <key>UserDefinedName</key>
    <string>Proxilion Security VPN</string>
    <key>VPN</key>
    <dict>
        <key>RemoteAddress</key>
        <string>proxilion.company.com</string>
        <key>AuthenticationMethod</key>
        <string>Certificate</string>
    </dict>
    <key>OnDemandEnabled</key>
    <integer>1</integer>
    <key>OnDemandRules</key>
    <array>
        <dict>
            <key>Action</key>
            <string>Connect</string>
            <key>URLStringProbe</key>
            <string>https://chat.openai.com</string>
        </dict>
        <dict>
            <key>Action</key>
            <string>Connect</string>
            <key>URLStringProbe</key>
            <string>https://claude.ai</string>
        </dict>
    </array>
    <key>SafariDomains</key>
    <array>
        <string>chat.openai.com</string>
        <string>claude.ai</string>
        <string>gemini.google.com</string>
    </array>
</dict>
```

### Android Per-App VPN

```json
{
  "alwaysOnVpnPackage": {
    "packageName": "com.proxilion.vpn",
    "lockdownEnabled": true
  },
  "vpnConfigDisabled": false,
  "applications": [
    {
      "packageName": "com.android.chrome",
      "installType": "REQUIRED_FOR_SETUP"
    }
  ]
}
```

## Testing & Validation

### Test Proxy Configuration

```bash
# iOS: Use Network Link Conditioner
# 1. Settings > Developer > Network Link Conditioner
# 2. Enable and set profile
# 3. Test AI app access

# Android: Use ADB
adb shell settings get global http_proxy
# Should output: proxilion.company.com:8787
```

### Test Certificate Trust

```bash
# iOS
# Open Safari, navigate to https://chat.openai.com
# Should see valid certificate (no warnings)

# Android
# Open Chrome, navigate to https://chat.openai.com
# Tap lock icon, verify certificate chain includes Proxilion CA
```

### Test PII Blocking

```bash
# On mobile device:
# 1. Open ChatGPT app or website
# 2. Type: "My SSN is 123-45-6789"
# 3. Send message
# 4. Should see: "Request blocked: SSN detected"
```

## Troubleshooting

### iOS Issues

**Issue**: Profile won't install

```bash
# Check profile signature
security cms -D -i proxilion.mobileconfig

# Verify UUID is unique
grep PayloadUUID proxilion.mobileconfig
```

**Issue**: Certificate not trusted

```bash
# Verify certificate is in trust store
Settings > General > About > Certificate Trust Settings
# Enable full trust for Proxilion Root CA
```

### Android Issues

**Issue**: Proxy not working

```bash
# Check proxy settings
adb shell settings get global http_proxy

# Reset proxy
adb shell settings put global http_proxy proxilion.company.com:8787
```

**Issue**: Certificate not trusted

```bash
# Check installed certificates
adb shell ls /data/misc/user/0/cacerts-added/

# Reinstall certificate via MDM
```

## Best Practices

1. **Test Before Deployment**
   - Deploy to pilot group first
   - Verify all apps work correctly
   - Monitor for issues

2. **User Communication**
   - Notify users before deployment
   - Explain security benefits
   - Provide support contact

3. **Monitoring**
   - Track profile installation success rate
   - Monitor proxy connection failures
   - Review blocked requests

4. **Maintenance**
   - Rotate certificates annually
   - Update proxy configuration as needed
   - Keep MDM profiles current

## Support

For MDM-specific issues:
- **Microsoft Intune**: https://docs.microsoft.com/intune
- **Jamf Pro**: https://docs.jamf.com
- **Workspace ONE**: https://docs.vmware.com/en/VMware-Workspace-ONE

For Proxilion support:
- **Email**: support@proxilion.dev
- **Documentation**: https://docs.proxilion.dev
- **Community**: https://community.proxilion.dev

---

**Next Steps**: [Certificate Installation Guide](CERTIFICATE_INSTALLATION.md)

