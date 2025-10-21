import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager, ProxilionConfig } from '../src/config/config-manager.js';
import { ThreatLevel, PolicyAction } from '../src/types/index.js';

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = ConfigManager.getInstance();
    configManager.reset(); // Reset to defaults before each test
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Default Configuration', () => {
    it('should have valid default configuration', () => {
      const config = configManager.getConfig();

      expect(config.server.port).toBe(8787);
      expect(config.server.environment).toBe('development');
      expect(config.security.enablePIIScanner).toBe(true);
      expect(config.performance.enableCaching).toBe(true);
    });

    it('should validate default configuration', () => {
      const errors = configManager.validate();
      expect(errors.length).toBe(0);
    });
  });

  describe('Get Configuration', () => {
    it('should get entire configuration', () => {
      const config = configManager.getConfig();

      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.performance).toBeDefined();
    });

    it('should get configuration by path', () => {
      const port = configManager.get<number>('server.port');
      const enablePII = configManager.get<boolean>('security.enablePIIScanner');

      expect(port).toBe(8787);
      expect(enablePII).toBe(true);
    });

    it('should return undefined for invalid path', () => {
      const value = configManager.get('invalid.path.here');
      expect(value).toBeUndefined();
    });

    it('should return deep cloned config', () => {
      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('Set Configuration', () => {
    it('should set configuration by path', () => {
      configManager.set('server.port', 9000);
      const port = configManager.get<number>('server.port');

      expect(port).toBe(9000);
    });

    it('should set nested configuration', () => {
      configManager.set('security.enablePIIScanner', false);
      const enabled = configManager.get<boolean>('security.enablePIIScanner');

      expect(enabled).toBe(false);
    });

    it('should throw error for invalid path', () => {
      expect(() => configManager.set('', 'value')).toThrow();
    });
  });

  describe('Update Configuration', () => {
    it('should update partial configuration', () => {
      configManager.update({
        server: {
          port: 9000,
          host: '127.0.0.1',
          environment: 'production',
          logLevel: 'error',
        },
      });

      const config = configManager.getConfig();
      expect(config.server.port).toBe(9000);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.server.environment).toBe('production');
    });

    it('should merge nested configuration', () => {
      configManager.update({
        security: {
          enablePIIScanner: false,
        } as any,
      });

      const config = configManager.getConfig();
      expect(config.security.enablePIIScanner).toBe(false);
      expect(config.security.enablePromptInjectionScanner).toBe(true); // Should remain unchanged
    });
  });

  describe('Load Configuration', () => {
    it('should load valid configuration', () => {
      const newConfig: ProxilionConfig = {
        ...configManager.getConfig(),
        server: {
          port: 8080,
          host: 'localhost',
          environment: 'staging',
          logLevel: 'debug',
        },
      };

      configManager.load(newConfig);
      const config = configManager.getConfig();

      expect(config.server.port).toBe(8080);
      expect(config.server.environment).toBe('staging');
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig: ProxilionConfig = {
        ...configManager.getConfig(),
        server: {
          ...configManager.getConfig().server,
          port: -1, // Invalid port
        },
      };

      expect(() => configManager.load(invalidConfig)).toThrow();
    });
  });

  describe('Reset Configuration', () => {
    it('should reset to default configuration', () => {
      configManager.set('server.port', 9000);
      configManager.reset();

      const port = configManager.get<number>('server.port');
      expect(port).toBe(8787); // Default port
    });
  });

  describe('Configuration Validation', () => {
    it('should validate port range', () => {
      configManager.set('server.port', 70000);
      const errors = configManager.validate();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].path).toBe('server.port');
    });

    it('should validate cache TTL', () => {
      configManager.set('performance.cacheTTL', -100);
      const errors = configManager.validate();

      expect(errors.length).toBeGreaterThan(0);
      const error = errors.find(e => e.path === 'performance.cacheTTL');
      expect(error).toBeDefined();
    });

    it('should validate cache max size', () => {
      configManager.set('performance.cacheMaxSize', 0);
      const errors = configManager.validate();

      expect(errors.length).toBeGreaterThan(0);
      const error = errors.find(e => e.path === 'performance.cacheMaxSize');
      expect(error).toBeDefined();
    });

    it('should validate rate limit max requests', () => {
      configManager.set('performance.rateLimitMaxRequests', 0);
      const errors = configManager.validate();

      expect(errors.length).toBeGreaterThan(0);
      const error = errors.find(e => e.path === 'performance.rateLimitMaxRequests');
      expect(error).toBeDefined();
    });

    it('should validate alert threshold', () => {
      configManager.set('cost.alertThreshold', 1.5);
      const errors = configManager.validate();

      expect(errors.length).toBeGreaterThan(0);
      const error = errors.find(e => e.path === 'cost.alertThreshold');
      expect(error).toBeDefined();
    });
  });

  describe('Configuration Watchers', () => {
    it('should register watcher', () => {
      let called = false;
      configManager.watch('test-watcher', () => {
        called = true;
      });

      configManager.set('server.port', 9000);
      expect(called).toBe(true);
    });

    it('should unregister watcher', () => {
      let callCount = 0;
      configManager.watch('test-watcher', () => {
        callCount++;
      });

      configManager.set('server.port', 9000);
      expect(callCount).toBe(1);

      configManager.unwatch('test-watcher');
      configManager.set('server.port', 9001);
      expect(callCount).toBe(1); // Should not increment
    });

    it('should notify multiple watchers', () => {
      let count1 = 0;
      let count2 = 0;

      configManager.watch('watcher-1', () => count1++);
      configManager.watch('watcher-2', () => count2++);

      configManager.set('server.port', 9000);

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('should pass updated config to watchers', () => {
      let receivedConfig: ProxilionConfig | null = null;

      configManager.watch('test-watcher', (config) => {
        receivedConfig = config;
      });

      configManager.set('server.port', 9000);

      expect(receivedConfig).toBeDefined();
      expect(receivedConfig?.server.port).toBe(9000);
    });
  });

  describe('Secrets Management', () => {
    it('should set and get secret', () => {
      configManager.setSecret('api-key', 'secret-value');
      const value = configManager.getSecret('api-key');

      expect(value).toBe('secret-value');
    });

    it('should check if secret exists', () => {
      configManager.setSecret('api-key', 'secret-value');

      expect(configManager.hasSecret('api-key')).toBe(true);
      expect(configManager.hasSecret('non-existent')).toBe(false);
    });

    it('should delete secret', () => {
      configManager.setSecret('api-key', 'secret-value');
      expect(configManager.hasSecret('api-key')).toBe(true);

      configManager.deleteSecret('api-key');
      expect(configManager.hasSecret('api-key')).toBe(false);
    });

    it('should return undefined for non-existent secret', () => {
      const value = configManager.getSecret('non-existent');
      expect(value).toBeUndefined();
    });
  });

  describe('Import/Export Configuration', () => {
    it('should export configuration as JSON', () => {
      const json = configManager.export();
      const parsed = JSON.parse(json);

      expect(parsed.server).toBeDefined();
      expect(parsed.security).toBeDefined();
    });

    it('should import configuration from JSON', () => {
      const config = configManager.getConfig();
      config.server.port = 9000;
      const json = JSON.stringify(config);

      configManager.import(json);
      const port = configManager.get<number>('server.port');

      expect(port).toBe(9000);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => configManager.import('invalid json')).toThrow();
    });

    it('should throw error for invalid configuration in JSON', () => {
      const invalidConfig = {
        ...configManager.getConfig(),
        server: {
          ...configManager.getConfig().server,
          port: -1,
        },
      };

      expect(() => configManager.import(JSON.stringify(invalidConfig))).toThrow();
    });
  });

  describe('Security Configuration', () => {
    it('should configure scanner enablement', () => {
      configManager.update({
        security: {
          enablePIIScanner: false,
          enableToxicityScanner: false,
        } as any,
      });

      const config = configManager.getConfig();
      expect(config.security.enablePIIScanner).toBe(false);
      expect(config.security.enableToxicityScanner).toBe(false);
    });

    it('should configure compliance standards', () => {
      configManager.set('security.complianceStandards', ['gdpr', 'hipaa']);
      const standards = configManager.get<string[]>('security.complianceStandards');

      expect(standards).toEqual(['gdpr', 'hipaa']);
    });
  });

  describe('Performance Configuration', () => {
    it('should configure caching', () => {
      configManager.update({
        performance: {
          enableCaching: false,
          cacheStrategy: 'lfu',
          cacheTTL: 7200000,
        } as any,
      });

      const config = configManager.getConfig();
      expect(config.performance.enableCaching).toBe(false);
      expect(config.performance.cacheStrategy).toBe('lfu');
      expect(config.performance.cacheTTL).toBe(7200000);
    });

    it('should configure rate limiting', () => {
      configManager.update({
        performance: {
          rateLimitAlgorithm: 'sliding_window',
          rateLimitMaxRequests: 200,
        } as any,
      });

      const config = configManager.getConfig();
      expect(config.performance.rateLimitAlgorithm).toBe('sliding_window');
      expect(config.performance.rateLimitMaxRequests).toBe(200);
    });
  });
});

