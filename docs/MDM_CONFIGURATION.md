# MDM Configuration Guide

This guide covers Mobile Device Management (MDM) configuration for deploying Proxilion GRC to mobile devices.

---

## Overview

Proxilion GRC can be deployed to iOS and Android devices through MDM platforms to enforce proxy configuration and certificate trust. This ensures all AI traffic from mobile devices is routed through Proxilion for security scanning.

**Supported MDM Platforms:**
- Microsoft Intune
- Jamf Pro
- VMware Workspace ONE
- MobileIron

---

## Architecture

```
Mobile Device (iOS/Android)
    |
    | (MDM-enforced proxy config)
    v
Proxilion GRC Proxy
    |
    | (Security scanning)
    v
AI Provider (OpenAI, Anthropic, Google)
```

**Requirements:**
1. MDM enrollment of target devices
2. Proxilion GRC proxy accessible from mobile network
3. CA certificate distributed to devices
4. Proxy configuration profile deployed

---

## Microsoft Intune Configuration

### Step 1: Create Configuration Profile

1. Navigate to Microsoft Endpoint Manager admin center
2. Go to Devices > Configuration profiles > Create profile
3. Select platform: iOS/iPadOS or Android
4. Profile type: Device restrictions or Custom

### Step 2: Wi-Fi Proxy Settings (iOS)

Create a Wi-Fi configuration profile with proxy settings:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.wifi.managed</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.proxilion.wifi.proxy</string>
            <key>PayloadUUID</key>
            <string>YOUR-UUID-HERE</string>
            <key>PayloadDisplayName</key>
            <string>Proxilion Proxy Configuration</string>
            <key>ProxyType</key>
            <string>Manual</string>
            <key>ProxyServer</key>
            <string>proxy.yourcompany.com</string>
            <key>ProxyServerPort</key>
            <integer>8787</integer>
        </dict>
    </array>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadIdentifier</key>
    <string>com.proxilion.profile</string>
    <key>PayloadUUID</key>
    <string>YOUR-PROFILE-UUID</string>
    <key>PayloadDisplayName</key>
    <string>Proxilion GRC</string>
</dict>
</plist>
```

### Step 3: Certificate Deployment

1. Export Proxilion CA certificate in .cer format
2. In Intune, go to Devices > Configuration profiles > Create profile
3. Select Trusted certificate profile type
4. Upload the CA certificate
5. Assign to target device groups

### Step 4: Android Enterprise Configuration

For Android devices, create a Managed Google Play app configuration:

```json
{
  "proxy_host": "proxy.yourcompany.com",
  "proxy_port": 8787,
  "proxy_bypass": "localhost,127.0.0.1,*.internal.company.com"
}
```

---

## Jamf Pro Configuration

### Step 1: Create Configuration Profile

1. Navigate to Computers/Devices > Configuration Profiles
2. Click New and select target platform
3. Add Network payload for proxy settings

### Step 2: Network Payload Settings

Configure the Network payload:

- **Proxy Type:** Manual
- **Proxy Server:** proxy.yourcompany.com
- **Proxy Port:** 8787
- **Proxy Username/Password:** (if authentication required)

### Step 3: Certificate Payload

1. Add Certificate payload to the profile
2. Upload Proxilion CA certificate
3. Set certificate name and description
4. Enable "Allow all apps to access this certificate"

### Step 4: Scope and Deployment

1. Define scope (target computers/devices)
2. Set distribution method (Automatic or Self Service)
3. Deploy the profile

---

## VMware Workspace ONE Configuration

### Step 1: Create Profile

1. Navigate to Devices > Profiles & Resources > Profiles
2. Click Add > Add Profile
3. Select platform (iOS or Android)

### Step 2: Wi-Fi Profile with Proxy (iOS)

Add Wi-Fi payload:

- **Service Set Identifier (SSID):** Your corporate Wi-Fi
- **Proxy Setup:** Manual
- **Proxy Server URL:** proxy.yourcompany.com
- **Proxy Server Port:** 8787

### Step 3: Credentials Profile

Add Credentials payload for CA certificate:

1. Upload Proxilion CA certificate
2. Set credential type to Certificate
3. Configure certificate store location

### Step 4: Assignment

1. Create smart group for target devices
2. Assign profile to smart group
3. Set deployment schedule

---

## Certificate Trust Configuration

### iOS Certificate Trust

After deploying the certificate, users may need to enable full trust:

1. Settings > General > About > Certificate Trust Settings
2. Enable full trust for Proxilion CA certificate

This can be automated via MDM by setting the certificate as a trusted root.

### Android Certificate Trust

For Android 7.0+, user-installed certificates are not trusted by default for apps. Options:

1. **Network Security Config** - Apps must explicitly trust user certificates
2. **System CA Store** - Requires device administrator or root access
3. **Work Profile** - Certificates installed in work profile are trusted by work apps

For managed devices, deploy the certificate as a system-level trusted CA.

---

## Network Requirements

### Firewall Rules

Allow the following traffic from mobile devices:

| Source | Destination | Port | Protocol |
|--------|-------------|------|----------|
| Mobile devices | Proxilion proxy | 8787 | TCP |
| Mobile devices | Proxilion admin | 8788 | TCP |
| Proxilion proxy | AI providers | 443 | TCP |

### DNS Configuration

Ensure mobile devices can resolve:
- Proxilion proxy hostname
- AI provider domains (for health checks)

---

## Troubleshooting

### Certificate Not Trusted

**Symptom:** SSL errors when accessing AI services

**Solutions:**
1. Verify certificate is installed: Settings > Security > Trusted credentials
2. Check certificate is deployed to correct store (System vs User)
3. Verify certificate chain is complete
4. Check certificate expiration date

### Proxy Not Working

**Symptom:** AI services inaccessible or bypassing proxy

**Solutions:**
1. Verify proxy settings in MDM profile
2. Check proxy server is reachable from mobile network
3. Verify no VPN is overriding proxy settings
4. Check MDM profile is applied: Settings > General > Profiles

### Apps Bypassing Proxy

**Symptom:** Some apps connect directly to AI services

**Solutions:**
1. Some apps ignore system proxy settings
2. Use VPN-based proxy forcing
3. Block direct access to AI providers at network level
4. Use Cloudflare WARP with Proxilion integration

---

## Limitations

1. **No Automatic MDM Integration** - Proxilion does not have native MDM API integration. All configuration is done through MDM profiles.

2. **Certificate Pinning** - Apps with certificate pinning will fail. No workaround without app modification.

3. **User Override** - Users with device administrator access can remove profiles. Use supervised mode (iOS) or device owner mode (Android) to prevent this.

4. **Network Switching** - Proxy settings may not persist across all network types. Test thoroughly.

5. **Per-App VPN** - Some MDM features like per-app VPN may conflict with proxy configuration.

---

## Security Considerations

1. **Proxy Authentication** - Consider enabling authentication to prevent unauthorized use
2. **Certificate Storage** - CA private key should never be on mobile devices
3. **Profile Encryption** - Enable profile encryption in MDM
4. **Audit Logging** - Enable MDM audit logging for compliance

---

## Next Steps

- [Certificate Installation Guide](CERTIFICATE_INSTALLATION.md)
- [DNS Configuration Guide](DNS_CONFIGURATION.md)
- [Setup Guide](SETUP.md)
