# DNS Configuration Guide

This guide covers DNS configuration for routing AI service traffic through Proxilion GRC in transparent proxy mode.

---

## Overview

Proxilion GRC can operate as a transparent proxy by configuring DNS to resolve AI provider domains to the Proxilion proxy IP address. This allows interception without explicit proxy configuration on clients.

**How It Works:**
1. Client requests `api.openai.com`
2. DNS returns Proxilion proxy IP instead of actual OpenAI IP
3. Client connects to Proxilion thinking it's OpenAI
4. Proxilion intercepts, scans, and forwards to real OpenAI

---

## Architecture

```
Client Browser/App
    |
    | DNS Query: api.openai.com
    v
Internal DNS Server
    |
    | Returns: Proxilion IP (e.g., 10.0.0.50)
    v
Client connects to Proxilion (thinking it's OpenAI)
    |
    v
Proxilion GRC Proxy
    |
    | TLS termination + Security scanning
    | Real DNS lookup for api.openai.com
    v
Actual OpenAI API Server
```

**Requirements:**
1. Control over DNS resolution (internal DNS server)
2. Proxilion CA certificate trusted on all clients
3. Proxilion accessible on HTTPS port (443)

---

## AI Provider Domains to Override

Configure DNS overrides for these domains:

### OpenAI
```
api.openai.com          -> Proxilion IP
chat.openai.com         -> Proxilion IP (web interface)
chatgpt.com             -> Proxilion IP (web interface)
```

### Anthropic
```
api.anthropic.com       -> Proxilion IP
claude.ai               -> Proxilion IP (web interface)
```

### Google AI
```
generativelanguage.googleapis.com  -> Proxilion IP
gemini.google.com                  -> Proxilion IP (web interface)
bard.google.com                    -> Proxilion IP (web interface)
```

### Cohere
```
api.cohere.ai           -> Proxilion IP
api.cohere.com          -> Proxilion IP
```

### Azure OpenAI
```
*.openai.azure.com      -> Proxilion IP
```

### AWS Bedrock
```
bedrock-runtime.*.amazonaws.com -> Proxilion IP
```

---

## DNS Server Configuration

### BIND (Linux)

Edit your zone file (e.g., `/etc/bind/zones/db.override`):

```bind
$TTL 300
@       IN      SOA     ns1.example.com. admin.example.com. (
                        2024010101 ; Serial
                        3600       ; Refresh
                        1800       ; Retry
                        604800     ; Expire
                        300 )      ; Minimum TTL

; OpenAI
api.openai.com.         IN      A       10.0.0.50
chat.openai.com.        IN      A       10.0.0.50
chatgpt.com.            IN      A       10.0.0.50

; Anthropic
api.anthropic.com.      IN      A       10.0.0.50
claude.ai.              IN      A       10.0.0.50

; Google AI
generativelanguage.googleapis.com. IN A 10.0.0.50
gemini.google.com.      IN      A       10.0.0.50

; Cohere
api.cohere.ai.          IN      A       10.0.0.50
api.cohere.com.         IN      A       10.0.0.50
```

Update `/etc/bind/named.conf.local`:

```bind
zone "openai.com" {
    type master;
    file "/etc/bind/zones/db.openai.override";
};

zone "anthropic.com" {
    type master;
    file "/etc/bind/zones/db.anthropic.override";
};

zone "claude.ai" {
    type master;
    file "/etc/bind/zones/db.claude.override";
};
```

Restart BIND:
```bash
sudo systemctl restart bind9
```

### dnsmasq (Linux/Pi-hole)

Edit `/etc/dnsmasq.conf` or create `/etc/dnsmasq.d/proxilion.conf`:

```conf
# Proxilion AI Traffic Override
# Replace 10.0.0.50 with your Proxilion proxy IP

# OpenAI
address=/api.openai.com/10.0.0.50
address=/chat.openai.com/10.0.0.50
address=/chatgpt.com/10.0.0.50

# Anthropic
address=/api.anthropic.com/10.0.0.50
address=/claude.ai/10.0.0.50

# Google AI
address=/generativelanguage.googleapis.com/10.0.0.50
address=/gemini.google.com/10.0.0.50
address=/bard.google.com/10.0.0.50

# Cohere
address=/api.cohere.ai/10.0.0.50
address=/api.cohere.com/10.0.0.50
```

Restart dnsmasq:
```bash
sudo systemctl restart dnsmasq
```

### Windows DNS Server

1. Open DNS Manager
2. Right-click Forward Lookup Zones > New Zone
3. Create primary zone for each domain (e.g., `openai.com`)
4. Add A record pointing to Proxilion IP

PowerShell:
```powershell
# Create zone for openai.com
Add-DnsServerPrimaryZone -Name "openai.com" -ZoneFile "openai.com.dns"

# Add A records
Add-DnsServerResourceRecordA -ZoneName "openai.com" -Name "api" -IPv4Address "10.0.0.50"
Add-DnsServerResourceRecordA -ZoneName "openai.com" -Name "chat" -IPv4Address "10.0.0.50"

# Repeat for other domains
```

### Pi-hole

1. Navigate to Local DNS > DNS Records
2. Add entries:
   - Domain: `api.openai.com`, IP: `10.0.0.50`
   - Domain: `chat.openai.com`, IP: `10.0.0.50`
   - (repeat for all AI domains)

Or edit `/etc/pihole/custom.list`:
```
10.0.0.50 api.openai.com
10.0.0.50 chat.openai.com
10.0.0.50 chatgpt.com
10.0.0.50 api.anthropic.com
10.0.0.50 claude.ai
10.0.0.50 generativelanguage.googleapis.com
10.0.0.50 gemini.google.com
```

---

## Cloudflare Gateway (Zero Trust)

If using Cloudflare Zero Trust:

1. Navigate to Gateway > DNS Locations
2. Create a DNS location for your network
3. Go to Gateway > Policies > DNS Policies
4. Create policy to override AI domains:

```yaml
Name: Route AI to Proxilion
Selector: Domain
Domains:
  - api.openai.com
  - chat.openai.com
  - api.anthropic.com
  - claude.ai
  - generativelanguage.googleapis.com
Action: Override
Override Host: your-proxilion-proxy.example.com
```

---

## DHCP Integration

Configure DHCP to distribute your internal DNS server:

### Linux (ISC DHCP)

Edit `/etc/dhcp/dhcpd.conf`:
```conf
option domain-name-servers 10.0.0.10;  # Your internal DNS
```

### Windows DHCP

1. Open DHCP Manager
2. Right-click Server Options > Configure Options
3. Set option 006 (DNS Servers) to your internal DNS IP

### Router/Firewall

Most routers allow setting DNS servers in DHCP settings. Configure to use your internal DNS that has the Proxilion overrides.

---

## Split-Horizon DNS

For environments where some clients should bypass Proxilion:

### Internal View (Through Proxilion)
```bind
view "internal" {
    match-clients { 10.0.0.0/8; 192.168.0.0/16; };

    zone "openai.com" {
        type master;
        file "/etc/bind/zones/db.openai.proxilion";
    };
};
```

### External View (Direct)
```bind
view "external" {
    match-clients { any; };

    zone "openai.com" {
        type forward;
        forwarders { 8.8.8.8; 8.8.4.4; };
    };
};
```

---

## DNSSEC Considerations

DNS overrides break DNSSEC validation. Options:

1. **Disable DNSSEC for overridden domains** - Configure resolver to skip DNSSEC for AI domains
2. **Disable DNSSEC network-wide** - Simpler but less secure
3. **Use explicit proxy** - Instead of DNS override, use explicit proxy configuration

dnsmasq DNSSEC bypass:
```conf
# Disable DNSSEC validation for overridden domains
dnssec-no-check-unsigned
```

---

## Testing DNS Configuration

### Verify DNS Override

```bash
# Should return Proxilion IP
nslookup api.openai.com
dig api.openai.com

# Expected output:
# api.openai.com.  300  IN  A  10.0.0.50
```

### Test Through Proxy

```bash
# Should work and be logged in Proxilion
curl -v https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-test"
```

### Check Proxilion Logs

```bash
# Should see the request in Proxilion logs
journalctl -u proxilion -f
```

---

## Troubleshooting

### DNS Not Resolving to Proxy

**Symptom:** AI domains resolve to real IPs, not Proxilion

**Solutions:**
1. Verify DNS server has overrides configured
2. Check client is using correct DNS server: `nslookup api.openai.com`
3. Flush DNS cache: `ipconfig /flushdns` (Windows) or `sudo systemd-resolve --flush-caches` (Linux)
4. Check DNS TTL - may be cached with old values

### Certificate Errors

**Symptom:** SSL/TLS errors when connecting through DNS override

**Solutions:**
1. Verify Proxilion CA certificate is trusted on client
2. Check Proxilion is generating certificates for the requested domain
3. Verify Proxilion is listening on port 443
4. Check certificate chain is complete

### Some Apps Bypass DNS

**Symptom:** Some applications connect directly, ignoring DNS

**Solutions:**
1. Some apps use DNS-over-HTTPS (DoH) - block DoH endpoints
2. Some apps hardcode IPs - use firewall rules
3. Use network-level blocking of direct connections

### DNSSEC Failures

**Symptom:** DNSSEC-enabled clients fail to resolve

**Solutions:**
1. Disable DNSSEC for overridden domains
2. Use explicit proxy configuration instead
3. Configure DNSSEC trust anchors for your internal CA

---

## Limitations

1. **DNSSEC Incompatible** - DNS overrides break DNSSEC validation
2. **DoH/DoT Bypass** - Apps using DNS-over-HTTPS bypass local DNS
3. **Hardcoded IPs** - Apps with hardcoded IPs bypass DNS
4. **Certificate Required** - All clients must trust Proxilion CA
5. **Complex Wildcards** - Some domains use complex wildcard patterns

---

## Security Considerations

1. **DNS Security** - Secure your DNS server to prevent unauthorized modifications
2. **Cache Poisoning** - Use DNSSEC for non-overridden domains
3. **Access Control** - Restrict who can modify DNS records
4. **Monitoring** - Log DNS queries for audit purposes

---

## Next Steps

- [Certificate Installation Guide](CERTIFICATE_INSTALLATION.md)
- [MDM Configuration Guide](MDM_CONFIGURATION.md)
- [Setup Guide](SETUP.md)
