/**
 * GraphQL Schema Definition
 * 
 * Defines the complete GraphQL schema for Proxilion API Gateway
 */

export const typeDefs = `#graphql
  # Scalars
  scalar DateTime
  scalar JSON

  # Enums
  enum AIProvider {
    OPENAI
    ANTHROPIC
    GOOGLE
    COHERE
  }

  enum ThreatLevel {
    NONE
    LOW
    MEDIUM
    HIGH
    CRITICAL
  }

  enum PolicyAction {
    ALLOW
    BLOCK
    MODIFY
    ALERT
    QUEUE
    REDIRECT
  }

  enum ScannerType {
    PII
    PROMPT_INJECTION
    TOXICITY
    DLP
    COMPLIANCE
  }

  enum WorkflowStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    CANCELLED
  }

  # Types
  type Query {
    # Health & Status
    health: HealthStatus!
    version: String!
    
    # Policies
    policies: [Policy!]!
    policy(id: ID!): Policy
    
    # Scanners
    scanners: [Scanner!]!
    scanner(id: ID!): Scanner
    
    # Analytics
    analytics(timeRange: TimeRangeInput!): Analytics!
    userAnalytics(userId: ID!, timeRange: TimeRangeInput!): UserAnalytics!
    
    # Cost Tracking
    costs(timeRange: TimeRangeInput!): CostSummary!
    costsByUser(timeRange: TimeRangeInput!): [UserCost!]!
    
    # Workflows
    workflows: [Workflow!]!
    workflow(id: ID!): Workflow
    workflowExecutions(workflowId: ID!, limit: Int): [WorkflowExecution!]!
    
    # Prompts
    prompts: [Prompt!]!
    prompt(id: ID!): Prompt
    promptVersions(promptId: ID!): [PromptVersion!]!
    
    # Models
    models: [AIModel!]!
    model(id: ID!): AIModel
    
    # Monitoring
    realtimeMetrics: RealtimeMetrics!
    alerts(severity: ThreatLevel, limit: Int): [Alert!]!
    
    # Audit Logs
    auditLogs(filters: AuditLogFilters, limit: Int): [AuditLog!]!
  }

  type Mutation {
    # Policy Management
    createPolicy(input: CreatePolicyInput!): Policy!
    updatePolicy(id: ID!, input: UpdatePolicyInput!): Policy!
    deletePolicy(id: ID!): Boolean!
    enablePolicy(id: ID!): Policy!
    disablePolicy(id: ID!): Policy!
    
    # Scanner Management
    enableScanner(type: ScannerType!): Scanner!
    disableScanner(type: ScannerType!): Scanner!
    updateScannerConfig(type: ScannerType!, config: JSON!): Scanner!
    
    # Workflow Management
    createWorkflow(input: CreateWorkflowInput!): Workflow!
    updateWorkflow(id: ID!, input: UpdateWorkflowInput!): Workflow!
    deleteWorkflow(id: ID!): Boolean!
    executeWorkflow(id: ID!, variables: JSON): WorkflowExecution!
    cancelWorkflowExecution(executionId: ID!): Boolean!
    
    # Prompt Management
    createPrompt(input: CreatePromptInput!): Prompt!
    updatePrompt(id: ID!, input: UpdatePromptInput!): Prompt!
    deletePrompt(id: ID!): Boolean!
    createPromptVersion(promptId: ID!, content: String!, changelog: String): PromptVersion!
    
    # Model Management
    registerModel(input: RegisterModelInput!): AIModel!
    updateModelConfig(id: ID!, config: JSON!): AIModel!
    
    # Request Processing
    processAIRequest(input: AIRequestInput!): AIResponse!
    
    # Alert Management
    acknowledgeAlert(id: ID!): Alert!
    resolveAlert(id: ID!, resolution: String): Alert!
  }

  type Subscription {
    # Real-time monitoring
    metricsUpdated: RealtimeMetrics!
    alertCreated(severity: ThreatLevel): Alert!
    
    # Workflow execution updates
    workflowExecutionUpdated(executionId: ID!): WorkflowExecution!
    
    # Policy violations
    policyViolation: PolicyViolation!
    
    # Cost updates
    costThresholdExceeded: CostAlert!
  }

  # Health & Status Types
  type HealthStatus {
    status: String!
    uptime: Float!
    version: String!
    components: [ComponentHealth!]!
  }

  type ComponentHealth {
    name: String!
    status: String!
    latency: Float
    errorRate: Float
  }

  # Policy Types
  type Policy {
    id: ID!
    name: String!
    description: String
    enabled: Boolean!
    priority: Int!
    conditions: [PolicyCondition!]!
    actions: [PolicyActionConfig!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PolicyCondition {
    type: String!
    field: String!
    operator: String!
    value: JSON!
  }

  type PolicyActionConfig {
    action: PolicyAction!
    config: JSON
  }

  input CreatePolicyInput {
    name: String!
    description: String
    priority: Int!
    conditions: [PolicyConditionInput!]!
    actions: [PolicyActionInput!]!
  }

  input UpdatePolicyInput {
    name: String
    description: String
    priority: Int
    conditions: [PolicyConditionInput!]
    actions: [PolicyActionInput!]
  }

  input PolicyConditionInput {
    type: String!
    field: String!
    operator: String!
    value: JSON!
  }

  input PolicyActionInput {
    action: PolicyAction!
    config: JSON
  }

  # Scanner Types
  type Scanner {
    id: ID!
    type: ScannerType!
    name: String!
    enabled: Boolean!
    config: JSON
    stats: ScannerStats!
  }

  type ScannerStats {
    totalScans: Int!
    threatsDetected: Int!
    averageDuration: Float!
    lastScan: DateTime
  }

  # Analytics Types
  type Analytics {
    totalRequests: Int!
    successRate: Float!
    averageLatency: Float!
    topModels: [ModelUsage!]!
    topUsers: [UserUsage!]!
    threatsByType: [ThreatCount!]!
    requestsByProvider: [ProviderUsage!]!
  }

  type UserAnalytics {
    userId: ID!
    totalRequests: Int!
    successRate: Float!
    averageCost: Float!
    topModels: [ModelUsage!]!
    violations: [PolicyViolation!]!
  }

  type ModelUsage {
    model: String!
    count: Int!
    percentage: Float!
  }

  type UserUsage {
    userId: ID!
    count: Int!
    percentage: Float!
  }

  type ThreatCount {
    type: String!
    count: Int!
    severity: ThreatLevel!
  }

  type ProviderUsage {
    provider: AIProvider!
    count: Int!
    percentage: Float!
  }

  input TimeRangeInput {
    start: DateTime!
    end: DateTime!
  }

  # Cost Types
  type CostSummary {
    totalCost: Float!
    costByProvider: [ProviderCost!]!
    costByModel: [ModelCost!]!
    costByUser: [UserCost!]!
    trend: [CostDataPoint!]!
  }

  type ProviderCost {
    provider: AIProvider!
    cost: Float!
    requests: Int!
  }

  type ModelCost {
    model: String!
    cost: Float!
    requests: Int!
  }

  type UserCost {
    userId: ID!
    cost: Float!
    requests: Int!
  }

  type CostDataPoint {
    timestamp: DateTime!
    cost: Float!
  }

  type CostAlert {
    userId: ID!
    threshold: Float!
    current: Float!
    timestamp: DateTime!
  }

  # Workflow Types
  type Workflow {
    id: ID!
    name: String!
    description: String
    version: String!
    steps: [WorkflowStep!]!
    variables: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type WorkflowStep {
    id: ID!
    type: String!
    config: JSON!
    dependsOn: [ID!]
  }

  type WorkflowExecution {
    id: ID!
    workflowId: ID!
    status: WorkflowStatus!
    startTime: DateTime!
    endTime: DateTime
    duration: Float
    steps: [StepExecution!]!
    error: String
  }

  type StepExecution {
    stepId: ID!
    status: WorkflowStatus!
    output: JSON
    error: String
    duration: Float
  }

  input CreateWorkflowInput {
    name: String!
    description: String
    version: String!
    steps: [WorkflowStepInput!]!
    variables: JSON
  }

  input UpdateWorkflowInput {
    name: String
    description: String
    steps: [WorkflowStepInput!]
    variables: JSON
  }

  input WorkflowStepInput {
    id: ID!
    type: String!
    config: JSON!
    dependsOn: [ID!]
  }

  # Prompt Types
  type Prompt {
    id: ID!
    name: String!
    description: String
    currentVersion: PromptVersion!
    versions: [PromptVersion!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PromptVersion {
    id: ID!
    promptId: ID!
    version: String!
    content: String!
    variables: [String!]!
    changelog: String
    createdAt: DateTime!
    createdBy: String
  }

  input CreatePromptInput {
    name: String!
    description: String
    content: String!
  }

  input UpdatePromptInput {
    name: String
    description: String
  }

  # Model Types
  type AIModel {
    id: ID!
    name: String!
    provider: AIProvider!
    capabilities: [String!]!
    pricing: ModelPricing!
    config: JSON
    enabled: Boolean!
  }

  type ModelPricing {
    inputCostPer1kTokens: Float!
    outputCostPer1kTokens: Float!
  }

  input RegisterModelInput {
    name: String!
    provider: AIProvider!
    capabilities: [String!]!
    inputCostPer1kTokens: Float!
    outputCostPer1kTokens: Float!
    config: JSON
  }

  # Monitoring Types
  type RealtimeMetrics {
    timestamp: DateTime!
    requestsPerSecond: Float!
    averageLatency: Float!
    errorRate: Float!
    activeConnections: Int!
    cacheHitRate: Float!
    topEndpoints: [EndpointMetric!]!
  }

  type EndpointMetric {
    endpoint: String!
    requests: Int!
    latency: Float!
    errorRate: Float!
  }

  type Alert {
    id: ID!
    severity: ThreatLevel!
    type: String!
    message: String!
    details: JSON
    acknowledged: Boolean!
    resolved: Boolean!
    createdAt: DateTime!
    acknowledgedAt: DateTime
    resolvedAt: DateTime
  }

  type PolicyViolation {
    id: ID!
    policyId: ID!
    policyName: String!
    userId: ID
    severity: ThreatLevel!
    action: PolicyAction!
    details: JSON!
    timestamp: DateTime!
  }

  # Audit Log Types
  type AuditLog {
    id: ID!
    timestamp: DateTime!
    userId: ID
    action: String!
    resource: String!
    details: JSON
    ipAddress: String
    userAgent: String
  }

  input AuditLogFilters {
    userId: ID
    action: String
    resource: String
    startTime: DateTime
    endTime: DateTime
  }

  # AI Request Types
  input AIRequestInput {
    provider: AIProvider!
    model: String!
    messages: [MessageInput!]!
    temperature: Float
    maxTokens: Int
    stream: Boolean
  }

  input MessageInput {
    role: String!
    content: String!
  }

  type AIResponse {
    id: ID!
    provider: AIProvider!
    model: String!
    content: String!
    usage: Usage!
    cost: Float!
    latency: Float!
    cached: Boolean!
  }

  type Usage {
    promptTokens: Int!
    completionTokens: Int!
    totalTokens: Int!
  }
`;

