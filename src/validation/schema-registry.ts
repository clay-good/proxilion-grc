/**
 * Schema Registry
 * 
 * Centralized registry for managing validation schemas with versioning and caching
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import {
  SchemaDefinition,
  SchemaRegistryConfig,
  SchemaVersion,
  SchemaEvolution,
  SchemaMapping,
  SchemaMatchCriteria,
  ValidationStats,
  SchemaImportOptions,
  SchemaExportOptions,
  JSONSchema,
  OpenAPISchema,
  CustomSchema,
} from './schema-types.js';

export class SchemaRegistry {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<SchemaRegistryConfig>;
  private schemas: Map<string, SchemaDefinition> = new Map();
  private schemaVersions: Map<string, SchemaEvolution> = new Map();
  private schemaMappings: SchemaMapping[] = [];
  private schemaCache: Map<string, { schema: SchemaDefinition; cachedAt: number }> = new Map();
  private stats: ValidationStats = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    averageDuration: 0,
    errorsByField: {},
    errorsByCode: {},
    schemaUsage: {},
  };

  constructor(config?: Partial<SchemaRegistryConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();

    this.config = {
      enableVersioning: config?.enableVersioning ?? true,
      enableCaching: config?.enableCaching ?? true,
      cacheSize: config?.cacheSize ?? 100,
      cacheTTL: config?.cacheTTL ?? 3600000, // 1 hour
      strictMode: config?.strictMode ?? false,
      allowAdditionalProperties: config?.allowAdditionalProperties ?? false,
    };

    this.logger.info('Schema registry initialized', {
      enableVersioning: this.config.enableVersioning,
      enableCaching: this.config.enableCaching,
    });
  }

  /**
   * Register a new schema
   */
  registerSchema(schema: Omit<SchemaDefinition, 'createdAt' | 'updatedAt'>): SchemaDefinition {
    const now = Date.now();
    const schemaDefinition: SchemaDefinition = {
      ...schema,
      createdAt: now,
      updatedAt: now,
    };

    this.schemas.set(schema.id, schemaDefinition);

    // Initialize versioning if enabled
    if (this.config.enableVersioning) {
      this.initializeVersioning(schemaDefinition);
    }

    // Clear cache for this schema
    this.schemaCache.delete(schema.id);

    this.logger.info('Schema registered', {
      schemaId: schema.id,
      name: schema.name,
      version: schema.version,
      type: schema.type,
    });

    this.metrics.increment('schema_registered_total');

    return schemaDefinition;
  }

  /**
   * Get schema by ID
   */
  getSchema(schemaId: string): SchemaDefinition | undefined {
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.schemaCache.get(schemaId);
      if (cached && Date.now() - cached.cachedAt < this.config.cacheTTL) {
        this.metrics.increment('schema_cache_hit_total');
        return cached.schema;
      }
    }

    // Get from registry
    const schema = this.schemas.get(schemaId);
    if (schema) {
      // Update cache
      if (this.config.enableCaching) {
        this.updateCache(schemaId, schema);
      }
      this.metrics.increment('schema_cache_miss_total');
    }

    return schema;
  }

  /**
   * Get schema by criteria (provider, model, endpoint, etc.)
   */
  getSchemaByMatch(criteria: SchemaMatchCriteria): SchemaDefinition | undefined {
    // Find matching mapping
    const mapping = this.findBestMatch(criteria);
    if (!mapping) {
      return undefined;
    }

    return this.getSchema(mapping.schemaId);
  }

  /**
   * Update existing schema
   */
  updateSchema(schemaId: string, updates: Partial<SchemaDefinition>): boolean {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      return false;
    }

    const updatedSchema: SchemaDefinition = {
      ...schema,
      ...updates,
      updatedAt: Date.now(),
    };

    this.schemas.set(schemaId, updatedSchema);

    // Create new version if versioning is enabled
    if (this.config.enableVersioning && updates.schema) {
      this.createVersion(schemaId, updatedSchema);
    }

    // Clear cache
    this.schemaCache.delete(schemaId);

    this.logger.info('Schema updated', { schemaId });
    this.metrics.increment('schema_updated_total');

    return true;
  }

  /**
   * Delete schema
   */
  deleteSchema(schemaId: string): boolean {
    const deleted = this.schemas.delete(schemaId);
    if (deleted) {
      this.schemaCache.delete(schemaId);
      this.schemaVersions.delete(schemaId);
      this.logger.info('Schema deleted', { schemaId });
      this.metrics.increment('schema_deleted_total');
    }
    return deleted;
  }

  /**
   * List all schemas
   */
  listSchemas(): SchemaDefinition[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Register schema mapping
   */
  registerMapping(mapping: SchemaMapping): void {
    this.schemaMappings.push(mapping);
    this.schemaMappings.sort((a, b) => b.priority - a.priority);

    this.logger.info('Schema mapping registered', {
      mappingId: mapping.id,
      schemaId: mapping.schemaId,
      priority: mapping.priority,
    });
  }

  /**
   * Find best matching schema mapping
   */
  private findBestMatch(criteria: SchemaMatchCriteria): SchemaMapping | undefined {
    for (const mapping of this.schemaMappings) {
      if (!mapping.enabled) {
        continue;
      }

      if (this.matchesCriteria(mapping.criteria, criteria)) {
        return mapping;
      }
    }

    return undefined;
  }

  /**
   * Check if criteria matches
   */
  private matchesCriteria(
    mappingCriteria: SchemaMatchCriteria,
    requestCriteria: SchemaMatchCriteria
  ): boolean {
    if (mappingCriteria.provider && mappingCriteria.provider !== requestCriteria.provider) {
      return false;
    }
    if (mappingCriteria.model && mappingCriteria.model !== requestCriteria.model) {
      return false;
    }
    if (mappingCriteria.endpoint && mappingCriteria.endpoint !== requestCriteria.endpoint) {
      return false;
    }
    if (mappingCriteria.method && mappingCriteria.method !== requestCriteria.method) {
      return false;
    }
    if (mappingCriteria.contentType && mappingCriteria.contentType !== requestCriteria.contentType) {
      return false;
    }
    if (mappingCriteria.direction && mappingCriteria.direction !== requestCriteria.direction) {
      return false;
    }

    return true;
  }

  /**
   * Initialize versioning for a schema
   */
  private initializeVersioning(schema: SchemaDefinition): void {
    const evolution: SchemaEvolution = {
      schemaId: schema.id,
      versions: [
        {
          version: schema.version,
          schema: schema.schema,
          createdAt: schema.createdAt,
          deprecated: false,
        },
      ],
      currentVersion: schema.version,
      history: [
        {
          version: schema.version,
          action: 'created',
          timestamp: schema.createdAt,
        },
      ],
    };

    this.schemaVersions.set(schema.id, evolution);
  }

  /**
   * Create new version of schema
   */
  private createVersion(schemaId: string, schema: SchemaDefinition): void {
    const evolution = this.schemaVersions.get(schemaId);
    if (!evolution) {
      return;
    }

    const newVersion: SchemaVersion = {
      version: schema.version,
      schema: schema.schema,
      createdAt: Date.now(),
      deprecated: false,
    };

    evolution.versions.push(newVersion);
    evolution.currentVersion = schema.version;
    evolution.history.push({
      version: schema.version,
      action: 'updated',
      timestamp: Date.now(),
    });

    this.logger.info('Schema version created', {
      schemaId,
      version: schema.version,
    });
  }

  /**
   * Get schema version history
   */
  getVersionHistory(schemaId: string): SchemaEvolution | undefined {
    return this.schemaVersions.get(schemaId);
  }

  /**
   * Get specific version of schema
   */
  getSchemaVersion(schemaId: string, version: string): SchemaVersion | undefined {
    const evolution = this.schemaVersions.get(schemaId);
    if (!evolution) {
      return undefined;
    }

    return evolution.versions.find((v) => v.version === version);
  }

  /**
   * Update cache
   */
  private updateCache(schemaId: string, schema: SchemaDefinition): void {
    // Evict oldest entries if cache is full
    if (this.schemaCache.size >= this.config.cacheSize) {
      const oldestKey = Array.from(this.schemaCache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0][0];
      this.schemaCache.delete(oldestKey);
    }

    this.schemaCache.set(schemaId, {
      schema,
      cachedAt: Date.now(),
    });
  }

  /**
   * Update validation statistics
   */
  updateStats(schemaId: string, valid: boolean, duration: number, errors: any[]): void {
    this.stats.totalValidations++;
    if (valid) {
      this.stats.successfulValidations++;
    } else {
      this.stats.failedValidations++;
    }

    // Update average duration
    this.stats.averageDuration =
      (this.stats.averageDuration * (this.stats.totalValidations - 1) + duration) /
      this.stats.totalValidations;

    // Update schema usage
    this.stats.schemaUsage[schemaId] = (this.stats.schemaUsage[schemaId] || 0) + 1;

    // Update error statistics
    for (const error of errors) {
      this.stats.errorsByField[error.field] = (this.stats.errorsByField[error.field] || 0) + 1;
      this.stats.errorsByCode[error.code] = (this.stats.errorsByCode[error.code] || 0) + 1;
    }
  }

  /**
   * Get validation statistics
   */
  getStats(): ValidationStats {
    return { ...this.stats };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.schemaCache.clear();
    this.logger.info('Schema cache cleared');
  }

  /**
   * Export schema
   */
  exportSchema(schemaId: string, options: SchemaExportOptions): string {
    const schema = this.getSchema(schemaId);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    const exportData = options.includeMetadata
      ? schema
      : { schema: schema.schema };

    if (options.format === 'json') {
      return options.minify
        ? JSON.stringify(exportData)
        : JSON.stringify(exportData, null, 2);
    }

    // YAML export would be implemented here
    throw new Error('YAML export not yet implemented');
  }
}

