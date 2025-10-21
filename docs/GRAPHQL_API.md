# GraphQL API Gateway

## Overview

Proxilion now includes a comprehensive GraphQL API Gateway that provides a unified, type-safe interface for managing all Proxilion features. The GraphQL API offers real-time subscriptions, powerful querying capabilities, and a modern developer experience.

## Features

### ✅ Complete API Coverage
- **Policy Management**: Create, update, delete, enable/disable policies
- **Scanner Management**: Query scanners, update configurations
- **Workflow Orchestration**: Create and execute workflows
- **Prompt Management**: Version control for prompts
- **Model Registry**: Query and manage AI models
- **Analytics**: Real-time metrics and historical data
- **Cost Tracking**: Budget management and cost analysis
- **Audit Logs**: Security and compliance tracking

### ✅ Real-Time Subscriptions
- Live metrics updates (every 5 seconds)
- Alert notifications
- Workflow execution status
- Policy violation alerts
- Cost threshold alerts

### ✅ Authentication & Security
- API Key authentication
- Bearer token support
- Per-query authorization checks
- Structured error handling

## Endpoint

```
POST /graphql
```

## Authentication

Include authentication in request headers:

```bash
# API Key
curl -X POST http://localhost:8787/graphql \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ health { status } }"}'

# Bearer Token
curl -X POST http://localhost:8787/graphql \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ health { status } }"}'
```

## Example Queries

### Health Check

```graphql
query {
  health {
    status
    uptime
    version
    timestamp
  }
}
```

### List All Policies

```graphql
query {
  policies {
    id
    name
    description
    enabled
    priority
    conditions {
      field
      operator
      value
    }
    actions {
      type
      config
    }
  }
}
```

### Get Analytics

```graphql
query {
  analytics(timeRange: { start: 1234567890, end: 1234567999 }) {
    totalRequests
    totalCost
    averageLatency
    errorRate
    topModels {
      model
      count
      cost
    }
    topUsers {
      userId
      requestCount
      totalCost
    }
  }
}
```

### Query AI Models

```graphql
query {
  models {
    id
    name
    provider
    capabilities
    pricing {
      inputCostPer1kTokens
      outputCostPer1kTokens
    }
    enabled
  }
}
```

### Get Real-Time Metrics

```graphql
query {
  realtimeMetrics {
    timestamp
    requestsPerSecond
    averageLatency
    errorRate
    activeConnections
    cacheHitRate
  }
}
```

## Example Mutations

### Create a Policy

```graphql
mutation {
  createPolicy(input: {
    name: "Block High Risk Requests"
    description: "Block requests with high threat level"
    enabled: true
    priority: 100
    conditions: [
      {
        field: "threatLevel"
        operator: "EQUALS"
        value: "CRITICAL"
      }
    ]
    actions: [
      {
        type: BLOCK
        config: { reason: "High threat detected" }
      }
    ]
  }) {
    id
    name
    enabled
  }
}
```

### Execute a Workflow

```graphql
mutation {
  executeWorkflow(
    id: "content-summarization"
    variables: {
      content: "Long text to summarize..."
      maxLength: 100
    }
  ) {
    id
    status
    result
    startTime
    endTime
  }
}
```

### Create a Prompt

```graphql
mutation {
  createPrompt(input: {
    name: "Customer Support"
    template: "You are a helpful customer support agent. {{context}}"
    variables: ["context"]
    tags: ["support", "customer-service"]
  }) {
    id
    name
    version
    createdAt
  }
}
```

### Process AI Request

```graphql
mutation {
  processAIRequest(input: {
    provider: OPENAI
    model: "gpt-4"
    messages: [
      { role: "user", content: "Hello!" }
    ]
    temperature: 0.7
    maxTokens: 100
  }) {
    content
    model
    usage {
      promptTokens
      completionTokens
      totalTokens
    }
    cost
    latency
  }
}
```

## Example Subscriptions

### Subscribe to Real-Time Metrics

```graphql
subscription {
  metricsUpdated {
    timestamp
    requestsPerSecond
    averageLatency
    errorRate
    activeConnections
    cacheHitRate
  }
}
```

### Subscribe to Alerts

```graphql
subscription {
  alertCreated(severity: CRITICAL) {
    id
    type
    severity
    message
    timestamp
    metadata
  }
}
```

### Subscribe to Workflow Updates

```graphql
subscription {
  workflowExecutionUpdated(executionId: "exec-123") {
    id
    status
    progress
    currentStep
    result
  }
}
```

## GraphQL Playground

In development mode, access the interactive GraphQL Playground at:

```
http://localhost:8787/graphql
```

The playground provides:
- Interactive query editor with autocomplete
- Schema documentation browser
- Query history
- Variable editor
- Real-time subscription testing

## Configuration

Configure the GraphQL server via environment variables:

```bash
# API Key for authentication (optional in development)
GRAPHQL_API_KEY=your-secret-key

# Enable introspection (default: true in development, false in production)
NODE_ENV=production

# CORS origins (comma-separated)
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

## Error Handling

The GraphQL API returns structured errors:

```json
{
  "errors": [
    {
      "message": "Unauthorized",
      "extensions": {
        "code": "UNAUTHORIZED"
      }
    }
  ]
}
```

Error codes:
- `UNAUTHORIZED` - Authentication required or invalid
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid input
- `INTERNAL_ERROR` - Server error

## Performance

- **Caching**: Responses are cached where appropriate
- **Batching**: Multiple queries in a single request
- **Subscriptions**: Efficient WebSocket connections
- **Metrics**: Request duration and error tracking

## Next Steps

1. Explore the schema in GraphQL Playground
2. Build custom queries for your use case
3. Set up subscriptions for real-time monitoring
4. Integrate with your frontend application
5. Configure authentication for production

