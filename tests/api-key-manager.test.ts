/**
 * Tests for API Key Manager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { APIKeyManager } from '../src/identity/api-key-manager.js';

describe('APIKeyManager', () => {
  let manager: APIKeyManager;

  beforeEach(() => {
    manager = new APIKeyManager();
  });

  describe('Key Registration', () => {
    it('should register a single API key', () => {
      manager.registerKey({
        apiKey: 'sk-test-key-123',
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        organizationId: 'org-123',
        teamId: 'team-456',
      });

      const metadata = manager.getKeyMetadata('sk-test-key-123');

      expect(metadata).toBeDefined();
      expect(metadata?.userId).toBe('user-123');
      expect(metadata?.email).toBe('test@example.com');
      expect(metadata?.organizationId).toBe('org-123');
      expect(metadata?.teamId).toBe('team-456');
    });

    it('should register multiple API keys', () => {
      const keys = [
        {
          apiKey: 'sk-key-1',
          userId: 'user-1',
          email: 'user1@example.com',
          organizationId: 'org-1',
        },
        {
          apiKey: 'sk-key-2',
          userId: 'user-2',
          email: 'user2@example.com',
          organizationId: 'org-1',
        },
      ];

      manager.registerKeys(keys);

      expect(manager.getKeyMetadata('sk-key-1')).toBeDefined();
      expect(manager.getKeyMetadata('sk-key-2')).toBeDefined();
    });
  });

  describe('Usage Tracking', () => {
    beforeEach(() => {
      manager.registerKey({
        apiKey: 'sk-usage-test',
        userId: 'user-usage',
        organizationId: 'org-usage',
      });
    });

    it('should track successful API key usage', () => {
      manager.trackUsage('sk-usage-test', true, 0.05);
      manager.trackUsage('sk-usage-test', true, 0.03);

      const usage = manager.getKeyUsage('sk-usage-test');

      expect(usage).toBeDefined();
      expect(usage?.totalRequests).toBe(2);
      expect(usage?.successfulRequests).toBe(2);
      expect(usage?.failedRequests).toBe(0);
      expect(usage?.totalCost).toBe(0.08);
    });

    it('should track failed API key usage', () => {
      manager.trackUsage('sk-usage-test', false, 0);
      manager.trackUsage('sk-usage-test', false, 0);

      const usage = manager.getKeyUsage('sk-usage-test');

      expect(usage).toBeDefined();
      expect(usage?.totalRequests).toBe(2);
      expect(usage?.successfulRequests).toBe(0);
      expect(usage?.failedRequests).toBe(2);
    });

    it('should track usage for unregistered keys', () => {
      manager.trackUsage('sk-unregistered', true, 0.01);

      const usage = manager.getKeyUsage('sk-unregistered');

      expect(usage).toBeDefined();
      expect(usage?.totalRequests).toBe(1);
    });
  });

  describe('Key Queries', () => {
    beforeEach(() => {
      manager.registerKeys([
        {
          apiKey: 'sk-user1-key1',
          userId: 'user-1',
          organizationId: 'org-1',
          teamId: 'team-1',
        },
        {
          apiKey: 'sk-user1-key2',
          userId: 'user-1',
          organizationId: 'org-1',
          teamId: 'team-1',
        },
        {
          apiKey: 'sk-user2-key1',
          userId: 'user-2',
          organizationId: 'org-1',
          teamId: 'team-2',
        },
        {
          apiKey: 'sk-user3-key1',
          userId: 'user-3',
          organizationId: 'org-2',
          teamId: 'team-3',
        },
      ]);
    });

    it('should get all keys for a user', () => {
      const keys = manager.getKeysForUser('user-1');

      expect(keys).toHaveLength(2);
      expect(keys.every(k => k.userId === 'user-1')).toBe(true);
    });

    it('should get all keys for an organization', () => {
      const keys = manager.getKeysForOrganization('org-1');

      expect(keys).toHaveLength(3);
      expect(keys.every(k => k.organizationId === 'org-1')).toBe(true);
    });

    it('should get all keys for a team', () => {
      const keys = manager.getKeysForTeam('team-1');

      expect(keys).toHaveLength(2);
      expect(keys.every(k => k.teamId === 'team-1')).toBe(true);
    });
  });

  describe('Usage Statistics', () => {
    beforeEach(() => {
      manager.registerKeys([
        {
          apiKey: 'sk-aaaaaaaaaaaaaaaaa',
          userId: 'stats-user-1',
          organizationId: 'stats-org-1',
          teamId: 'stats-team-1',
        },
        {
          apiKey: 'sk-bbbbbbbbbbbbbbbbb',
          userId: 'stats-user-1',
          organizationId: 'stats-org-1',
          teamId: 'stats-team-1',
        },
        {
          apiKey: 'sk-ccccccccccccccccc',
          userId: 'stats-user-2',
          organizationId: 'stats-org-1',
          teamId: 'stats-team-1',
        },
      ]);

      // Track usage
      manager.trackUsage('sk-aaaaaaaaaaaaaaaaa', true, 0.10);
      manager.trackUsage('sk-aaaaaaaaaaaaaaaaa', true, 0.15);
      manager.trackUsage('sk-bbbbbbbbbbbbbbbbb', true, 0.20);
      manager.trackUsage('sk-ccccccccccccccccc', false, 0);
    });

    it('should get user usage statistics', () => {
      const stats = manager.getUserUsageStats('stats-user-1');

      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.failedRequests).toBe(0);
      expect(stats.totalCost).toBe(0.45);
      expect(stats.keyCount).toBe(2);
    });

    it('should get organization usage statistics', () => {
      const stats = manager.getOrganizationUsageStats('stats-org-1');

      expect(stats.totalRequests).toBe(4);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.failedRequests).toBe(1);
      expect(stats.totalCost).toBe(0.45);
      expect(stats.keyCount).toBe(3);
      expect(stats.userCount).toBe(2);
    });

    it('should get team usage statistics', () => {
      const stats = manager.getTeamUsageStats('stats-team-1');

      expect(stats.totalRequests).toBe(4);
      expect(stats.successfulRequests).toBe(3);
      expect(stats.failedRequests).toBe(1);
      expect(stats.totalCost).toBe(0.45);
      expect(stats.keyCount).toBe(3);
      expect(stats.userCount).toBe(2);
    });
  });

  describe('Key Expiration', () => {
    it('should detect expired keys', () => {
      const now = Date.now();
      const pastTime = now - 1000;

      manager.registerKey({
        apiKey: 'sk-expired-key',
        userId: 'user-expired',
        organizationId: 'org-expired',
        expiresAt: pastTime,
      });

      expect(manager.isKeyExpired('sk-expired-key')).toBe(true);
    });

    it('should detect non-expired keys', () => {
      const now = Date.now();
      const futureTime = now + 1000000;

      manager.registerKey({
        apiKey: 'sk-valid-key',
        userId: 'user-valid',
        organizationId: 'org-valid',
        expiresAt: futureTime,
      });

      expect(manager.isKeyExpired('sk-valid-key')).toBe(false);
    });

    it('should handle keys without expiration', () => {
      manager.registerKey({
        apiKey: 'sk-no-expiry',
        userId: 'user-no-expiry',
        organizationId: 'org-no-expiry',
      });

      expect(manager.isKeyExpired('sk-no-expiry')).toBe(false);
    });
  });

  describe('Key Revocation', () => {
    it('should revoke an API key', () => {
      manager.registerKey({
        apiKey: 'sk-revoke-test',
        userId: 'user-revoke',
        organizationId: 'org-revoke',
      });

      expect(manager.getKeyMetadata('sk-revoke-test')).toBeDefined();

      manager.revokeKey('sk-revoke-test');

      expect(manager.getKeyMetadata('sk-revoke-test')).toBeNull();
    });
  });

  describe('CSV Import', () => {
    it('should import keys from CSV', () => {
      const csv = `apiKey,userId,email,username,teamId,organizationId
sk-csv-key-1,user-csv-1,user1@csv.com,csvuser1,team-csv-1,org-csv
sk-csv-key-2,user-csv-2,user2@csv.com,csvuser2,team-csv-2,org-csv`;

      manager.importFromCSV(csv);

      expect(manager.getKeyMetadata('sk-csv-key-1')).toBeDefined();
      expect(manager.getKeyMetadata('sk-csv-key-2')).toBeDefined();

      const key1 = manager.getKeyMetadata('sk-csv-key-1');
      expect(key1?.userId).toBe('user-csv-1');
      expect(key1?.email).toBe('user1@csv.com');
    });
  });

  describe('JSON Import/Export', () => {
    it('should import keys from JSON', () => {
      const json = JSON.stringify([
        {
          apiKey: 'sk-json-key-1',
          userId: 'user-json-1',
          email: 'user1@json.com',
          organizationId: 'org-json',
        },
        {
          apiKey: 'sk-json-key-2',
          userId: 'user-json-2',
          email: 'user2@json.com',
          organizationId: 'org-json',
        },
      ]);

      manager.importFromJSON(json);

      expect(manager.getKeyMetadata('sk-json-key-1')).toBeDefined();
      expect(manager.getKeyMetadata('sk-json-key-2')).toBeDefined();
    });

    it('should export keys to JSON', () => {
      manager.registerKeys([
        {
          apiKey: 'sk-export-1',
          userId: 'user-export-1',
          organizationId: 'org-export',
        },
        {
          apiKey: 'sk-export-2',
          userId: 'user-export-2',
          organizationId: 'org-export',
        },
      ]);

      const json = manager.exportToJSON();
      const keys = JSON.parse(json);

      expect(keys).toHaveLength(2);
      expect(keys[0].userId).toBeDefined();
      expect(keys[1].userId).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should track overall statistics', () => {
      manager.registerKeys([
        { apiKey: 'sk-1aaaaaaaaaaaaa', userId: 'u1', organizationId: 'o1' },
        { apiKey: 'sk-2bbbbbbbbbbbb', userId: 'u2', organizationId: 'o1' },
        { apiKey: 'sk-3cccccccccccc', userId: 'u3', organizationId: 'o1' },
      ]);

      manager.trackUsage('sk-1aaaaaaaaaaaaa', true, 0.01);
      manager.trackUsage('sk-2bbbbbbbbbbbb', true, 0.02);

      const stats = manager.getStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.totalUsageRecords).toBe(3); // All 3 keys have usage records (third one is initialized)
    });
  });
});

