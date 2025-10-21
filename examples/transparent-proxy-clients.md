# Client SDK Configuration for Transparent Proxy

This guide shows how to configure various AI SDK clients to work with Proxilion in transparent proxy mode.

## 🎯 Overview

When Proxilion is configured as a transparent proxy (via DNS or /etc/hosts), most SDKs work without any code changes. However, for explicit proxy configuration or custom setups, use the examples below.

---

## OpenAI SDK

### Python (openai)

#### Method 1: Transparent (No Code Changes)

```python
import openai

# Works automatically if DNS/hosts file is configured
client = openai.OpenAI(api_key="your-api-key")

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

#### Method 2: Explicit Base URL

```python
import openai

# Point directly to Proxilion
client = openai.OpenAI(
    api_key="your-api-key",
    base_url="http://proxilion.yourcompany.com:8787/proxy/api.openai.com/v1"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

#### Method 3: HTTP Proxy

```python
import openai
import httpx

# Configure HTTP proxy
http_client = httpx.Client(
    proxies={
        "http://": "http://proxilion.yourcompany.com:8787",
        "https://": "http://proxilion.yourcompany.com:8787"
    }
)

client = openai.OpenAI(
    api_key="your-api-key",
    http_client=http_client
)
```

### Node.js (openai)

#### Method 1: Transparent (No Code Changes)

```javascript
import OpenAI from 'openai';

// Works automatically if DNS/hosts file is configured
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

#### Method 2: Explicit Base URL

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'http://proxilion.yourcompany.com:8787/proxy/api.openai.com/v1'
});
```

#### Method 3: HTTP Proxy

```javascript
import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://proxilion.yourcompany.com:8787');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  httpAgent: agent
});
```

### cURL

```bash
# Method 1: Transparent (DNS/hosts configured)
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Method 2: Explicit proxy path
curl http://proxilion.yourcompany.com:8787/proxy/api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Method 3: HTTP proxy
curl -x http://proxilion.yourcompany.com:8787 \
  https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Anthropic SDK

### Python (anthropic)

#### Method 1: Transparent (No Code Changes)

```python
import anthropic

# Works automatically if DNS/hosts file is configured
client = anthropic.Anthropic(api_key="your-api-key")

message = client.messages.create(
    model="claude-3-sonnet-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)
```

#### Method 2: Explicit Base URL

```python
import anthropic

client = anthropic.Anthropic(
    api_key="your-api-key",
    base_url="http://proxilion.yourcompany.com:8787/proxy/api.anthropic.com"
)
```

#### Method 3: HTTP Proxy

```python
import anthropic
import httpx

http_client = httpx.Client(
    proxies={
        "http://": "http://proxilion.yourcompany.com:8787",
        "https://": "http://proxilion.yourcompany.com:8787"
    }
)

client = anthropic.Anthropic(
    api_key="your-api-key",
    http_client=http_client
)
```

### Node.js (@anthropic-ai/sdk)

#### Method 1: Transparent (No Code Changes)

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const message = await client.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(message.content[0].text);
```

#### Method 2: Explicit Base URL

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'http://proxilion.yourcompany.com:8787/proxy/api.anthropic.com'
});
```

### cURL

```bash
# Method 1: Transparent
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Method 2: Explicit proxy path
curl http://proxilion.yourcompany.com:8787/proxy/api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Google AI SDK

### Python (google-generativeai)

#### Method 1: Transparent (No Code Changes)

```python
import google.generativeai as genai

# Works automatically if DNS/hosts file is configured
genai.configure(api_key="your-api-key")

model = genai.GenerativeModel('gemini-pro')
response = model.generate_content("Hello!")
print(response.text)
```

#### Method 2: Custom Transport

```python
import google.generativeai as genai
import httpx

# Configure with custom transport
transport = httpx.HTTPTransport(
    proxy="http://proxilion.yourcompany.com:8787"
)

genai.configure(
    api_key="your-api-key",
    transport=transport
)
```

### Node.js (@google/generative-ai)

#### Method 1: Transparent (No Code Changes)

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

const result = await model.generateContent('Hello!');
console.log(result.response.text());
```

### cURL

```bash
# Method 1: Transparent
curl https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=$GOOGLE_API_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'

# Method 2: Explicit proxy path
curl http://proxilion.yourcompany.com:8787/proxy/generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=$GOOGLE_API_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'
```

---

## Environment Variables

Set these environment variables to configure HTTP proxy for all applications:

### Linux/macOS

```bash
# Add to ~/.bashrc or ~/.zshrc
export HTTP_PROXY=http://proxilion.yourcompany.com:8787
export HTTPS_PROXY=http://proxilion.yourcompany.com:8787
export NO_PROXY=localhost,127.0.0.1

# Apply changes
source ~/.bashrc
```

### Windows

```powershell
# PowerShell
$env:HTTP_PROXY="http://proxilion.yourcompany.com:8787"
$env:HTTPS_PROXY="http://proxilion.yourcompany.com:8787"

# Or set permanently
[System.Environment]::SetEnvironmentVariable("HTTP_PROXY", "http://proxilion.yourcompany.com:8787", "User")
[System.Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://proxilion.yourcompany.com:8787", "User")
```

### Docker

```yaml
# docker-compose.yml
services:
  app:
    image: your-app
    environment:
      - HTTP_PROXY=http://proxilion.yourcompany.com:8787
      - HTTPS_PROXY=http://proxilion.yourcompany.com:8787
      - NO_PROXY=localhost,127.0.0.1
```

---

## Testing Your Configuration

### Test Script (Python)

```python
#!/usr/bin/env python3
"""Test Proxilion transparent proxy configuration"""

import openai
import anthropic
import sys

def test_openai():
    try:
        client = openai.OpenAI(api_key="your-key")
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Say 'OpenAI works!'"}],
            max_tokens=10
        )
        print("✅ OpenAI:", response.choices[0].message.content)
        return True
    except Exception as e:
        print("❌ OpenAI failed:", str(e))
        return False

def test_anthropic():
    try:
        client = anthropic.Anthropic(api_key="your-key")
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=10,
            messages=[{"role": "user", "content": "Say 'Anthropic works!'"}]
        )
        print("✅ Anthropic:", message.content[0].text)
        return True
    except Exception as e:
        print("❌ Anthropic failed:", str(e))
        return False

if __name__ == "__main__":
    print("Testing Proxilion transparent proxy...\n")
    
    openai_ok = test_openai()
    anthropic_ok = test_anthropic()
    
    if openai_ok and anthropic_ok:
        print("\n✅ All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed")
        sys.exit(1)
```

### Test Script (Node.js)

```javascript
#!/usr/bin/env node
/**
 * Test Proxilion transparent proxy configuration
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

async function testOpenAI() {
  try {
    const client = new OpenAI({ apiKey: 'your-key' });
    const response = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: "Say 'OpenAI works!'" }],
      max_tokens: 10
    });
    console.log('✅ OpenAI:', response.choices[0].message.content);
    return true;
  } catch (error) {
    console.log('❌ OpenAI failed:', error.message);
    return false;
  }
}

async function testAnthropic() {
  try {
    const client = new Anthropic({ apiKey: 'your-key' });
    const message = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: "Say 'Anthropic works!'" }]
    });
    console.log('✅ Anthropic:', message.content[0].text);
    return true;
  } catch (error) {
    console.log('❌ Anthropic failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('Testing Proxilion transparent proxy...\n');
  
  const openaiOk = await testOpenAI();
  const anthropicOk = await testAnthropic();
  
  if (openaiOk && anthropicOk) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main();
```

---

## Troubleshooting

### Issue: SDK Can't Connect

**Solution:** Verify DNS/hosts configuration:
```bash
nslookup api.openai.com
# Should return Proxilion IP
```

### Issue: SSL Certificate Errors

**Solution:** Install Proxilion's SSL certificate or disable verification (dev only):
```python
# Python (NOT for production!)
import ssl
ssl._create_default_https_context = ssl._create_unverified_context
```

### Issue: Proxy Not Being Used

**Solution:** Check environment variables:
```bash
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

---

## Next Steps

- [Configure Security Policies](../docs/SECURITY_POLICIES.md)
- [Monitor API Usage](../docs/MONITORING.md)
- [Set Up Alerts](../docs/ALERTING.md)

