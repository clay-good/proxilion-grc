/**
 * Core type definitions for Proxilion AI Security Proxy
 */

// ============================================================================
// Request and Response Types
// ============================================================================

export interface ProxilionRequest {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  sourceIp?: string;
  userAgent?: string;
}

export interface ProxilionResponse {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  streaming?: boolean;
}

// ============================================================================
// AI Service Types
// ============================================================================

export enum AIServiceProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  COHERE = 'cohere',
  HUGGINGFACE = 'huggingface',
  CUSTOM = 'custom',
  UNKNOWN = 'unknown',
}

export interface AIServiceConfig {
  provider: AIServiceProvider;
  baseUrl: string;
  apiKeyHeader: string;
  supportedModels: string[];
  rateLimit?: RateLimitConfig;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
}

// ============================================================================
// Unified Internal Representation (UIR)
// ============================================================================

export interface UnifiedAIRequest {
  provider: AIServiceProvider;
  model: string;
  messages: Message[];
  parameters: GenerationParameters;
  streaming: boolean;
  tools?: Tool[];
  multimodal?: MultimodalContent[];
  metadata: RequestMetadata;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
}

export interface ContentPart {
  type: 'text' | 'image' | 'document';
  text?: string;
  imageUrl?: string;
  imageData?: string;
  mimeType?: string;
}

export interface GenerationParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface MultimodalContent {
  type: 'image' | 'document' | 'audio' | 'video';
  data: string;
  mimeType: string;
  size: number;
}

export interface RequestMetadata {
  correlationId: string;
  userId?: string;
  applicationId?: string;
  department?: string;
  costCenter?: string;
  tags?: Record<string, string>;
  cacheDisabled?: boolean;
  deduplicationDisabled?: boolean;
  requestId?: string;
  timestamp?: number;
  endpoint?: string;
}

// Type alias for AIProvider (for backwards compatibility)
export type AIProvider = AIServiceProvider;

// ============================================================================
// Security Scanning Types
// ============================================================================

export enum ThreatLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ScanResult {
  scannerId: string;
  scannerName: string;
  passed: boolean;
  threatLevel: ThreatLevel;
  score: number;
  findings: Finding[];
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
}

export interface Finding {
  type: string;
  severity: ThreatLevel;
  message: string;
  location?: Location;
  evidence?: string;
  remediation?: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Location {
  path: string;
  line?: number;
  column?: number;
  offset?: number;
  length?: number;
}

export interface AggregatedScanResult {
  overallThreatLevel: ThreatLevel;
  overallScore: number;
  scanResults: ScanResult[];
  findings: Finding[];
  totalExecutionTimeMs: number;
  timestamp: number;
}

// ============================================================================
// Policy Types
// ============================================================================

export enum PolicyAction {
  ALLOW = 'allow',
  BLOCK = 'block',
  MODIFY = 'modify',
  ALERT = 'alert',
  LOG = 'log',
  QUEUE = 'queue',
  REDIRECT = 'redirect',
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyActionConfig[];
  metadata?: Record<string, unknown>;
}

export interface PolicyCondition {
  type: 'threat_level' | 'scanner' | 'user' | 'time' | 'custom';
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';
  value: unknown;
  field?: string;
}

export interface PolicyActionConfig {
  action: PolicyAction;
  parameters?: Record<string, unknown>;
}

export interface PolicyDecision {
  policyId: string;
  action: PolicyAction;
  reason: string;
  matchedConditions: PolicyCondition[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Audit and Logging Types
// ============================================================================

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  level: LogLevel;
  type: string;
  message: string;
  correlationId: string;
  userId?: string;
  requestId?: string;
  data?: Record<string, unknown>;
  tags?: string[];
  // Extended properties for security events
  eventType?: string;
  action?: string;
  decision?: PolicyAction;
  threatLevel?: ThreatLevel;
  sourceIp?: string;
  provider?: AIServiceProvider;
  model?: string;
  findings?: Finding[];
  policyId?: string;
  duration?: number;
  targetService?: string;
}

// Response type for unified AI responses
export interface UnifiedAIResponse {
  provider: AIServiceProvider;
  model: string;
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

export interface MetricEvent {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  timestamp: number;
  tags?: Record<string, string>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ProxilionConfig {
  proxy: ProxyConfig;
  security: SecurityConfig;
  policies: Policy[];
  integrations: IntegrationConfig;
  observability: ObservabilityConfig;
}

export interface ProxyConfig {
  port: number;
  host: string;
  timeout: number;
  maxRequestSize: number;
  maxResponseSize: number;
  connectionPoolSize: number;
  enableHttp2: boolean;
  tlsConfig?: TLSConfig;
}

export interface TLSConfig {
  enabled: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  mutualTls?: boolean;
}

export interface SecurityConfig {
  scanners: ScannerConfig[];
  enablePiiDetection: boolean;
  enablePromptInjectionDetection: boolean;
  enableDlp: boolean;
  enableThreatIntelligence: boolean;
  customRules?: CustomRule[];
}

export interface ScannerConfig {
  id: string;
  name: string;
  enabled: boolean;
  async: boolean;
  timeout: number;
  config?: Record<string, unknown>;
}

export interface CustomRule {
  id: string;
  name: string;
  pattern: string;
  severity: ThreatLevel;
  action: PolicyAction;
}

export interface IntegrationConfig {
  siem?: SiemConfig;
  iam?: IamConfig;
  dlp?: DlpConfig;
}

export interface SiemConfig {
  enabled: boolean;
  endpoint: string;
  format: 'cef' | 'leef' | 'json';
}

export interface IamConfig {
  enabled: boolean;
  provider: 'ldap' | 'saml' | 'oauth' | 'oidc';
  endpoint: string;
}

export interface DlpConfig {
  enabled: boolean;
  provider: string;
  endpoint: string;
}

export interface ObservabilityConfig {
  logging: LoggingConfig;
  metrics: MetricsConfig;
  tracing: TracingConfig;
}

export interface LoggingConfig {
  level: LogLevel;
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'remote';
  maskSensitiveData: boolean;
}

export interface MetricsConfig {
  enabled: boolean;
  endpoint?: string;
  interval: number;
}

export interface TracingConfig {
  enabled: boolean;
  endpoint?: string;
  samplingRate: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class ProxilionError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProxilionError';
  }
}

