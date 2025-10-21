/**
 * Configuration Management System
 * 
 * Centralized configuration management with hot-reload, validation,
 * and secrets management capabilities.
 */

import { Logger } from '../utils/logger.js';
import { ThreatLevel, PolicyAction } from '../types/index.js';

export interface ProxilionConfig {
  // Server Configuration
  server: {
    port: number;
    host: string;
    environment: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };

  // Security Configuration
  security: {
    enablePIIScanner: boolean;
    enablePromptInjectionScanner: boolean;
    enableToxicityScanner: boolean;
    enableDLPScanner: boolean;
    enableComplianceScanner: boolean;
    complianceStandards: string[];
    defaultThreatAction: PolicyAction;
    maxThreatLevel: ThreatLevel;
  };

  // Performance Configuration
  performance: {
    enableCaching: boolean;
    cacheStrategy: 'lru' | 'lfu' | 'fifo';
    cacheTTL: number;
    cacheMaxSize: number;
    enableRateLimiting: boolean;
    rateLimitAlgorithm: 'token_bucket' | 'sliding_window' | 'fixed_window' | 'leaky_bucket';
    rateLimitMaxRequests: number;
    rateLimitWindowMs: number;
    enableDeduplication: boolean;
    deduplicationWindowMs: number;
  };

  // Integration Configuration
  integrations: {
    siem: {
      enabled: boolean;
      endpoint: string;
      format: 'cef' | 'leef' | 'json' | 'syslog';
      batchSize: number;
      flushIntervalMs: number;
    };
    webhooks: {
      enabled: boolean;
      maxRetries: number;
      retryDelayMs: number;
      timeoutMs: number;
    };
    alerting: {
      enabled: boolean;
      channels: string[];
      minSeverity: ThreatLevel;
    };
  };

  // AI Provider Configuration
  providers: {
    openai: {
      enabled: boolean;
      apiKey?: string;
      baseURL?: string;
      timeout: number;
    };
    anthropic: {
      enabled: boolean;
      apiKey?: string;
      baseURL?: string;
      timeout: number;
    };
    google: {
      enabled: boolean;
      apiKey?: string;
      baseURL?: string;
      timeout: number;
    };
    cohere: {
      enabled: boolean;
      apiKey?: string;
      baseURL?: string;
      timeout: number;
    };
  };

  // Cost Management
  cost: {
    enabled: boolean;
    trackingEnabled: boolean;
    budgetLimits: {
      hourly?: number;
      daily?: number;
      weekly?: number;
      monthly?: number;
    };
    alertThreshold: number;
  };

  // Tenancy Configuration
  tenancy: {
    enabled: boolean;
    isolationLevel: 'strict' | 'moderate' | 'relaxed';
    defaultQuotas: {
      maxRequestsPerHour: number;
      maxTokensPerDay: number;
      maxConcurrentRequests: number;
    };
  };
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: any;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ProxilionConfig;
  private logger: Logger;
  private watchers: Map<string, (config: ProxilionConfig) => void> = new Map();
  private secrets: Map<string, string> = new Map();

  private constructor() {
    this.logger = new Logger();
    this.config = this.getDefaultConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ProxilionConfig {
    return {
      server: {
        port: 8787,
        host: '0.0.0.0',
        environment: 'development',
        logLevel: 'info',
      },
      security: {
        enablePIIScanner: true,
        enablePromptInjectionScanner: true,
        enableToxicityScanner: true,
        enableDLPScanner: true,
        enableComplianceScanner: true,
        complianceStandards: ['gdpr', 'hipaa', 'pci_dss', 'soc2'],
        defaultThreatAction: PolicyAction.BLOCK,
        maxThreatLevel: ThreatLevel.HIGH,
      },
      performance: {
        enableCaching: true,
        cacheStrategy: 'lru',
        cacheTTL: 3600000, // 1 hour
        cacheMaxSize: 1000,
        enableRateLimiting: true,
        rateLimitAlgorithm: 'token_bucket',
        rateLimitMaxRequests: 100,
        rateLimitWindowMs: 60000, // 1 minute
        enableDeduplication: true,
        deduplicationWindowMs: 5000, // 5 seconds
      },
      integrations: {
        siem: {
          enabled: false,
          endpoint: '',
          format: 'json',
          batchSize: 100,
          flushIntervalMs: 5000,
        },
        webhooks: {
          enabled: false,
          maxRetries: 3,
          retryDelayMs: 1000,
          timeoutMs: 5000,
        },
        alerting: {
          enabled: false,
          channels: [],
          minSeverity: ThreatLevel.HIGH,
        },
      },
      providers: {
        openai: {
          enabled: true,
          timeout: 30000,
        },
        anthropic: {
          enabled: true,
          timeout: 30000,
        },
        google: {
          enabled: true,
          timeout: 30000,
        },
        cohere: {
          enabled: true,
          timeout: 30000,
        },
      },
      cost: {
        enabled: true,
        trackingEnabled: true,
        budgetLimits: {},
        alertThreshold: 0.8,
      },
      tenancy: {
        enabled: false,
        isolationLevel: 'moderate',
        defaultQuotas: {
          maxRequestsPerHour: 1000,
          maxTokensPerDay: 1000000,
          maxConcurrentRequests: 10,
        },
      },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ProxilionConfig {
    return JSON.parse(JSON.stringify(this.config)); // Deep clone
  }

  /**
   * Get specific configuration value by path
   */
  get<T = any>(path: string): T | undefined {
    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value as T;
  }

  /**
   * Set specific configuration value by path
   */
  set(path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    if (!lastKey) {
      throw new Error('Invalid configuration path');
    }

    let target: any = this.config;
    for (const key of keys) {
      if (!(key in target)) {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;

    this.logger.info('Configuration updated', { path, value });
    this.notifyWatchers();
  }

  /**
   * Update configuration with partial config
   */
  update(partialConfig: Partial<ProxilionConfig>): void {
    this.config = this.mergeConfig(this.config, partialConfig);
    
    const errors = this.validate();
    if (errors.length > 0) {
      this.logger.warn('Configuration validation warnings', { errors });
    }

    this.logger.info('Configuration updated');
    this.notifyWatchers();
  }

  /**
   * Load configuration from object
   */
  load(config: ProxilionConfig): void {
    const errors = this.validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.map(e => e.message).join(', ')}`);
    }

    this.config = config;
    this.logger.info('Configuration loaded');
    this.notifyWatchers();
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = this.getDefaultConfig();
    this.logger.info('Configuration reset to defaults');
    this.notifyWatchers();
  }

  /**
   * Validate current configuration
   */
  validate(config?: ProxilionConfig): ConfigValidationError[] {
    return this.validateConfig(config || this.config);
  }

  /**
   * Validate configuration object
   */
  private validateConfig(config: ProxilionConfig): ConfigValidationError[] {
    const errors: ConfigValidationError[] = [];

    // Validate server configuration
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push({
        path: 'server.port',
        message: 'Port must be between 1 and 65535',
        value: config.server.port,
      });
    }

    // Validate performance configuration
    if (config.performance.cacheTTL < 0) {
      errors.push({
        path: 'performance.cacheTTL',
        message: 'Cache TTL must be non-negative',
        value: config.performance.cacheTTL,
      });
    }

    if (config.performance.cacheMaxSize < 1) {
      errors.push({
        path: 'performance.cacheMaxSize',
        message: 'Cache max size must be at least 1',
        value: config.performance.cacheMaxSize,
      });
    }

    if (config.performance.rateLimitMaxRequests < 1) {
      errors.push({
        path: 'performance.rateLimitMaxRequests',
        message: 'Rate limit max requests must be at least 1',
        value: config.performance.rateLimitMaxRequests,
      });
    }

    // Validate cost configuration
    if (config.cost.alertThreshold < 0 || config.cost.alertThreshold > 1) {
      errors.push({
        path: 'cost.alertThreshold',
        message: 'Alert threshold must be between 0 and 1',
        value: config.cost.alertThreshold,
      });
    }

    return errors;
  }

  /**
   * Watch for configuration changes
   */
  watch(id: string, callback: (config: ProxilionConfig) => void): void {
    this.watchers.set(id, callback);
    this.logger.debug('Configuration watcher registered', { id });
  }

  /**
   * Unwatch configuration changes
   */
  unwatch(id: string): void {
    this.watchers.delete(id);
    this.logger.debug('Configuration watcher unregistered', { id });
  }

  /**
   * Notify all watchers of configuration changes
   */
  private notifyWatchers(): void {
    const config = this.getConfig();
    for (const [id, callback] of this.watchers) {
      try {
        callback(config);
      } catch (error) {
        this.logger.error('Configuration watcher error', error instanceof Error ? error : undefined, { id });
      }
    }
  }

  /**
   * Merge configurations (deep merge)
   */
  private mergeConfig(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfig(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Set secret value (for API keys, passwords, etc.)
   */
  setSecret(key: string, value: string): void {
    this.secrets.set(key, value);
    this.logger.info('Secret set', { key });
  }

  /**
   * Get secret value
   */
  getSecret(key: string): string | undefined {
    return this.secrets.get(key);
  }

  /**
   * Check if secret exists
   */
  hasSecret(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * Delete secret
   */
  deleteSecret(key: string): void {
    this.secrets.delete(key);
    this.logger.info('Secret deleted', { key });
  }

  /**
   * Export configuration (without secrets)
   */
  export(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  import(json: string): void {
    try {
      const config = JSON.parse(json);
      this.load(config);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${(error as Error).message}`);
    }
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();

