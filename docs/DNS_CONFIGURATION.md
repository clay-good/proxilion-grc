# DNS Configuration Guide

This guide explains how to configure DNS to route AI chatbot traffic through Proxilion for enterprise security monitoring.

## Overview

Proxilion intercepts browser-based traffic to AI providers by redirecting DNS queries for AI domains to the Proxilion server. This allows transparent MITM (Man-in-the-Middle) inspection without requiring browser configuration.

## Supported AI Providers

Proxilion intercepts traffic to:
- **OpenAI ChatGPT**: `chat.openai.com`, `chatgpt.com`
- **Anthropic Claude**: `claude.ai`
- **Google Gemini**: `gemini.google.com`, `bard.google.com`

## DNS Configuration Methods

### Method 1: Internal DNS Server (Recommended)

Configure your internal DNS server to override AI domain resolution.

#### BIND Configuration

Add to your BIND zone file:

```bind
; Proxilion AI Security Proxy
chat.openai.com.        IN  A   192.168.1.100
chatgpt.com.            IN  A   192.168.1.100
claude.ai.              IN  A   192.168.1.100
gemini.google.com.      IN  A   192.168.1.100
bard.google.com.        IN  A   192.168.1.100
```

Replace `192.168.1.100` with your Proxilion server IP.

Reload BIND:
```bash
sudo systemctl reload named
```

#### Windows DNS Server

1. Open DNS Manager
2. Navigate to your forward lookup zone
3. Right-click and select "New Host (A or AAAA)"
4. Add entries for each AI domain pointing to Proxilion server
5. Set TTL to 300 seconds (5 minutes)

#### dnsmasq Configuration

Add to `/etc/dnsmasq.conf`:

```conf
# Proxilion AI Security Proxy
address=/chat.openai.com/192.168.1.100
address=/chatgpt.com/192.168.1.100
address=/claude.ai/192.168.1.100
address=/gemini.google.com/192.168.1.100
address=/bard.google.com/192.168.1.100
```

Restart dnsmasq:
```bash
sudo systemctl restart dnsmasq
```

### Method 2: Pi-hole

If using Pi-hole for network-wide ad blocking:

1. Navigate to Pi-hole admin interface
2. Go to "Local DNS" → "DNS Records"
3. Add A records for each AI domain:
   - Domain: `chat.openai.com`
   - IP Address: `192.168.1.100`
4. Repeat for all AI domains

### Method 3: Hosts File (Testing Only)

For testing on individual machines, edit the hosts file:

**Linux/macOS**: `/etc/hosts`
**Windows**: `C:\Windows\System32\drivers\etc\hosts`

Add:
```
192.168.1.100  chat.openai.com
192.168.1.100  chatgpt.com
192.168.1.100  claude.ai
192.168.1.100  gemini.google.com
192.168.1.100  bard.google.com
```

**Note**: This method only works for the local machine and requires admin/root privileges.

### Method 4: DHCP DNS Override

Configure your DHCP server to provide Proxilion as the DNS server:

#### ISC DHCP Server

Edit `/etc/dhcp/dhcpd.conf`:

```conf
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.10 192.168.1.200;
    option routers 192.168.1.1;
    option domain-name-servers 192.168.1.100;  # Proxilion DNS
}
```

#### Windows DHCP Server

1. Open DHCP Manager
2. Right-click your scope → "Scope Options"
3. Configure option 006 (DNS Servers)
4. Set to Proxilion server IP

## Verification

### Test DNS Resolution

```bash
# Test from client machine
nslookup chat.openai.com

# Should return Proxilion server IP
Server:  192.168.1.100
Address: 192.168.1.100

Name:    chat.openai.com
Address: 192.168.1.100
```

### Test with dig

```bash
dig chat.openai.com

# Should show Proxilion IP in ANSWER section
;; ANSWER SECTION:
chat.openai.com.    300    IN    A    192.168.1.100
```

### Test HTTPS Connection

```bash
curl -v https://chat.openai.com

# Should show Proxilion certificate
* Server certificate:
*  subject: CN=chat.openai.com
*  issuer: CN=Proxilion Root CA
```

## Split DNS Configuration

For organizations that need to allow some users to bypass Proxilion:

### Create Separate DNS Views

#### BIND Split DNS

```bind
# Monitored users view
view "monitored" {
    match-clients { 192.168.1.0/24; };
    zone "." {
        type hint;
        file "/etc/bind/db.root";
    };
    zone "chat.openai.com" {
        type master;
        file "/etc/bind/zones/proxilion.zone";
    };
};

# Unmonitored users view
view "unmonitored" {
    match-clients { 192.168.2.0/24; };
    zone "." {
        type hint;
        file "/etc/bind/db.root";
    };
    # No override - uses public DNS
};
```

## Troubleshooting

### DNS Not Resolving to Proxilion

1. **Check DNS server configuration**:
   ```bash
   cat /etc/resolv.conf
   ```

2. **Flush DNS cache**:
   - **Windows**: `ipconfig /flushdns`
   - **macOS**: `sudo dscacheutil -flushcache`
   - **Linux**: `sudo systemd-resolve --flush-caches`

3. **Verify DNS propagation**:
   ```bash
   nslookup chat.openai.com <dns-server-ip>
   ```

### Certificate Errors

If users see certificate warnings:

1. Verify CA certificate is installed on client devices
2. Check certificate trust settings
3. Ensure Proxilion is generating valid certificates

### Connection Timeouts

1. Verify Proxilion is running:
   ```bash
   sudo systemctl status proxilion
   ```

2. Check firewall rules:
   ```bash
   sudo iptables -L -n | grep 8787
   ```

3. Test connectivity:
   ```bash
   telnet <proxilion-ip> 8787
   ```

## Security Considerations

### DNS Security

1. **Use DNSSEC** for DNS integrity
2. **Enable DNS over TLS (DoT)** or **DNS over HTTPS (DoH)** for privacy
3. **Monitor DNS queries** for bypass attempts
4. **Block public DNS servers** (8.8.8.8, 1.1.1.1) at firewall

### Bypass Prevention

Users may attempt to bypass Proxilion by:

1. **Using public DNS servers**: Block at firewall
2. **Using VPNs**: Implement VPN detection
3. **Using IP addresses directly**: Block at firewall
4. **Using mobile hotspots**: Enforce device policies

### Monitoring

Monitor for bypass attempts:

```bash
# Check for DNS queries to public resolvers
sudo tcpdump -i any port 53 and not host <internal-dns-ip>

# Check for direct connections to AI IPs
sudo tcpdump -i any host <openai-ip> and not host <proxilion-ip>
```

## Advanced Configuration

### Conditional Forwarding

Forward non-AI domains to upstream DNS:

```bind
# BIND configuration
forwarders {
    8.8.8.8;
    8.8.4.4;
};

# Only override AI domains
zone "chat.openai.com" {
    type master;
    file "/etc/bind/zones/proxilion.zone";
};
```

### Load Balancing

For high availability, use multiple Proxilion instances:

```bind
chat.openai.com.    IN  A   192.168.1.100
chat.openai.com.    IN  A   192.168.1.101
chat.openai.com.    IN  A   192.168.1.102
```

### Geographic Distribution

Route users to nearest Proxilion instance:

```bind
# US users
view "us" {
    match-clients { us-subnet; };
    zone "chat.openai.com" {
        file "/etc/bind/zones/proxilion-us.zone";
    };
};

# EU users
view "eu" {
    match-clients { eu-subnet; };
    zone "chat.openai.com" {
        file "/etc/bind/zones/proxilion-eu.zone";
    };
};
```

## Rollback Plan

If issues occur, quickly revert DNS changes:

1. **Remove DNS overrides** from DNS server
2. **Reload DNS service**
3. **Flush client DNS caches**
4. **Verify resolution** returns to public IPs

## Support

For assistance with DNS configuration:
- Documentation: https://github.com/proxilion/proxilion
- Issues: https://github.com/proxilion/proxilion/issues
- Enterprise Support: support@proxilion.com

