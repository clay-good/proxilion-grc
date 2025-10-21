/**
 * Schema Validation Types
 * 
 * Type definitions for request/response validation and schema enforcement
 */

export type SchemaType = 'json-schema' | 'openapi' | 'custom';
export type ValidationSeverity = 'error' | 'warning' | 'info';
export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  field: string;
  type: 'required' | 'type' | 'format' | 'range' | 'pattern' | 'enum' | 'custom';
  severity: ValidationSeverity;
  config: Record<string, any>;
  enabled: boolean;
}

export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: DataType | DataType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  enum?: any[];
  const?: any;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  definitions?: Record<string, JSONSchema>;
  $ref?: string;
}

export interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JSONSchema>;
    securitySchemes?: Record<string, any>;
  };
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
}

export interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: Record<string, string[]>[];
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: JSONSchema;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
  headers?: Record<string, Header>;
}

export interface MediaType {
  schema: JSONSchema;
  example?: any;
  examples?: Record<string, Example>;
}

export interface Header {
  description?: string;
  required?: boolean;
  schema: JSONSchema;
}

export interface Example {
  summary?: string;
  description?: string;
  value: any;
}

export interface SchemaDefinition {
  id: string;
  name: string;
  version: string;
  type: SchemaType;
  schema: JSONSchema | OpenAPISchema | CustomSchema;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, any>;
}

export interface CustomSchema {
  rules: ValidationRule[];
  validator?: (data: any) => ValidationResult;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: ValidationSeverity;
  code: string;
  value?: any;
  expected?: any;
  path?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
  metadata: {
    schemaId?: string;
    schemaVersion?: string;
    validatedAt: number;
    duration: number;
  };
}

export interface ValidationContext {
  schemaId?: string;
  strictMode: boolean;
  allowAdditionalProperties: boolean;
  coerceTypes: boolean;
  removeAdditional: boolean;
  useDefaults: boolean;
  validateFormats: boolean;
}

export interface SchemaRegistryConfig {
  enableVersioning: boolean;
  enableCaching: boolean;
  cacheSize: number;
  cacheTTL: number;
  strictMode: boolean;
  allowAdditionalProperties: boolean;
}

export interface ValidationStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  averageDuration: number;
  errorsByField: Record<string, number>;
  errorsByCode: Record<string, number>;
  schemaUsage: Record<string, number>;
}

export interface SchemaValidationOptions {
  context?: ValidationContext;
  throwOnError?: boolean;
  collectAllErrors?: boolean;
  abortEarly?: boolean;
}

export interface SchemaMatchCriteria {
  provider?: string;
  model?: string;
  endpoint?: string;
  method?: string;
  contentType?: string;
  direction?: 'request' | 'response';
}

export interface SchemaMapping {
  id: string;
  criteria: SchemaMatchCriteria;
  schemaId: string;
  priority: number;
  enabled: boolean;
}

export interface ValidationReport {
  timestamp: number;
  totalRequests: number;
  validRequests: number;
  invalidRequests: number;
  validationErrors: ValidationError[];
  topErrors: Array<{
    code: string;
    count: number;
    message: string;
  }>;
  topFields: Array<{
    field: string;
    errorCount: number;
  }>;
  schemaBreakdown: Record<string, {
    total: number;
    valid: number;
    invalid: number;
  }>;
}

export interface SchemaVersion {
  version: string;
  schema: JSONSchema | OpenAPISchema | CustomSchema;
  createdAt: number;
  deprecated: boolean;
  deprecationDate?: number;
  replacementVersion?: string;
  changelog?: string;
}

export interface SchemaEvolution {
  schemaId: string;
  versions: SchemaVersion[];
  currentVersion: string;
  history: Array<{
    version: string;
    action: 'created' | 'updated' | 'deprecated' | 'deleted';
    timestamp: number;
    author?: string;
    notes?: string;
  }>;
}

export interface ValidationMiddlewareConfig {
  validateRequests: boolean;
  validateResponses: boolean;
  strictMode: boolean;
  failOnValidationError: boolean;
  logValidationErrors: boolean;
  collectMetrics: boolean;
}

export interface SchemaImportOptions {
  format: 'json-schema' | 'openapi' | 'swagger';
  version?: string;
  overwrite: boolean;
  validate: boolean;
}

export interface SchemaExportOptions {
  format: 'json' | 'yaml';
  includeExamples: boolean;
  includeMetadata: boolean;
  minify: boolean;
}

