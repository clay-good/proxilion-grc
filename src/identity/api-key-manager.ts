/**
 * API Key Manager
 * 
 * Manages API key registration and mapping to users/teams/orgs.
 * Supports:
 * - API key registration with metadata
 * - Bulk import from CSV/JSON
 * - Key rotation and expiration
 * - Usage tracking per key
 * - Key-to-user mapping
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { APIKeyMetadata } from './identity-extractor.js';

export interface APIKeyUsage {
  apiKey: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCost: number;
  lastUsed: number;
  firstUsed: number;
}

export interface APIKeyRegistration {
  apiKey: string;           // Full API key (will be hashed)
  userId: string;
  email?: string;
  username?: string;
  displayName?: string;
  teamId?: string;
  teamName?: string;
  organizationId: string;
  organizationName?: string;
  roles?: string[];
  expiresAt?: number;
  metadata?: Record<string, any>;
}

export class APIKeyManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  private keyRegistry: Map<string, APIKeyMetadata> = new Map();
  private keyUsage: Map<string, APIKeyUsage> = new Map();

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Register a single API key
   */
  registerKey(registration: APIKeyRegistration): void {
    const keyPrefix = this.getKeyPrefix(registration.apiKey);
    
    const metadata: APIKeyMetadata = {
      apiKey: keyPrefix,
      userId: registration.userId,
      email: registration.email,
      username: registration.username,
      teamId: registration.teamId,
      teamName: registration.teamName,
      organizationId: registration.organizationId,
      organizationName: registration.organizationName,
      roles: registration.roles,
      createdAt: Date.now(),
      expiresAt: registration.expiresAt,
      metadata: registration.metadata,
    };

    this.keyRegistry.set(keyPrefix, metadata);

    // Initialize usage tracking
    this.keyUsage.set(keyPrefix, {
      apiKey: keyPrefix,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCost: 0,
      lastUsed: 0,
      firstUsed: 0,
    });

    this.logger.info('API key registered', {
      keyPrefix,
      userId: registration.userId,
      organizationId: registration.organizationId,
    });

    this.metrics.increment('api_key_registered_total', 1, {
      organizationId: registration.organizationId,
    });
  }

  /**
   * Register multiple API keys from array
   */
  registerKeys(registrations: APIKeyRegistration[]): void {
    for (const registration of registrations) {
      this.registerKey(registration);
    }

    this.logger.info('Bulk API key registration completed', {
      count: registrations.length,
    });
  }

  /**
   * Import API keys from CSV format
   * Format: apiKey,userId,email,username,teamId,organizationId
   */
  importFromCSV(csv: string): void {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const registrations: APIKeyRegistration[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j];
      }

      registrations.push({
        apiKey: row.apiKey,
        userId: row.userId,
        email: row.email,
        username: row.username,
        teamId: row.teamId,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
      });
    }

    this.registerKeys(registrations);

    this.logger.info('API keys imported from CSV', {
      count: registrations.length,
    });
  }

  /**
   * Import API keys from JSON format
   */
  importFromJSON(json: string): void {
    const registrations: APIKeyRegistration[] = JSON.parse(json);
    this.registerKeys(registrations);

    this.logger.info('API keys imported from JSON', {
      count: registrations.length,
    });
  }

  /**
   * Get API key metadata
   */
  getKeyMetadata(apiKey: string): APIKeyMetadata | null {
    const keyPrefix = this.getKeyPrefix(apiKey);
    return this.keyRegistry.get(keyPrefix) || null;
  }

  /**
   * Get API key usage
   */
  getKeyUsage(apiKey: string): APIKeyUsage | null {
    const keyPrefix = this.getKeyPrefix(apiKey);
    return this.keyUsage.get(keyPrefix) || null;
  }

  /**
   * Track API key usage
   */
  trackUsage(apiKey: string, success: boolean, cost: number = 0): void {
    const keyPrefix = this.getKeyPrefix(apiKey);
    const usage = this.keyUsage.get(keyPrefix);

    if (!usage) {
      // Key not registered, create usage entry
      this.keyUsage.set(keyPrefix, {
        apiKey: keyPrefix,
        totalRequests: 1,
        successfulRequests: success ? 1 : 0,
        failedRequests: success ? 0 : 1,
        totalCost: cost,
        lastUsed: Date.now(),
        firstUsed: Date.now(),
      });
      return;
    }

    usage.totalRequests++;
    if (success) {
      usage.successfulRequests++;
    } else {
      usage.failedRequests++;
    }
    usage.totalCost += cost;
    usage.lastUsed = Date.now();
    if (usage.firstUsed === 0) {
      usage.firstUsed = Date.now();
    }
  }

  /**
   * Check if API key is expired
   */
  isKeyExpired(apiKey: string): boolean {
    const metadata = this.getKeyMetadata(apiKey);
    if (!metadata || !metadata.expiresAt) return false;
    return Date.now() > metadata.expiresAt;
  }

  /**
   * Revoke API key
   */
  revokeKey(apiKey: string): void {
    const keyPrefix = this.getKeyPrefix(apiKey);
    this.keyRegistry.delete(keyPrefix);
    
    this.logger.info('API key revoked', { keyPrefix });
    this.metrics.increment('api_key_revoked_total');
  }

  /**
   * Get all keys for a user
   */
  getKeysForUser(userId: string): APIKeyMetadata[] {
    const keys: APIKeyMetadata[] = [];
    
    for (const metadata of this.keyRegistry.values()) {
      if (metadata.userId === userId) {
        keys.push(metadata);
      }
    }

    return keys;
  }

  /**
   * Get all keys for an organization
   */
  getKeysForOrganization(organizationId: string): APIKeyMetadata[] {
    const keys: APIKeyMetadata[] = [];
    
    for (const metadata of this.keyRegistry.values()) {
      if (metadata.organizationId === organizationId) {
        keys.push(metadata);
      }
    }

    return keys;
  }

  /**
   * Get all keys for a team
   */
  getKeysForTeam(teamId: string): APIKeyMetadata[] {
    const keys: APIKeyMetadata[] = [];
    
    for (const metadata of this.keyRegistry.values()) {
      if (metadata.teamId === teamId) {
        keys.push(metadata);
      }
    }

    return keys;
  }

  /**
   * Get usage statistics for a user
   */
  getUserUsageStats(userId: string): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalCost: number;
    keyCount: number;
  } {
    const keys = this.getKeysForUser(userId);
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalCost = 0;

    for (const key of keys) {
      const usage = this.keyUsage.get(key.apiKey);
      if (usage) {
        totalRequests += usage.totalRequests;
        successfulRequests += usage.successfulRequests;
        failedRequests += usage.failedRequests;
        totalCost += usage.totalCost;
      }
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalCost,
      keyCount: keys.length,
    };
  }

  /**
   * Get usage statistics for an organization
   */
  getOrganizationUsageStats(organizationId: string): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalCost: number;
    keyCount: number;
    userCount: number;
  } {
    const keys = this.getKeysForOrganization(organizationId);
    const uniqueUsers = new Set<string>();
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalCost = 0;

    for (const key of keys) {
      uniqueUsers.add(key.userId);
      const usage = this.keyUsage.get(key.apiKey);
      if (usage) {
        totalRequests += usage.totalRequests;
        successfulRequests += usage.successfulRequests;
        failedRequests += usage.failedRequests;
        totalCost += usage.totalCost;
      }
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalCost,
      keyCount: keys.length,
      userCount: uniqueUsers.size,
    };
  }

  /**
   * Get usage statistics for a team
   */
  getTeamUsageStats(teamId: string): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalCost: number;
    keyCount: number;
    userCount: number;
  } {
    const keys = this.getKeysForTeam(teamId);
    const uniqueUsers = new Set<string>();
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalCost = 0;

    for (const key of keys) {
      uniqueUsers.add(key.userId);
      const usage = this.keyUsage.get(key.apiKey);
      if (usage) {
        totalRequests += usage.totalRequests;
        successfulRequests += usage.successfulRequests;
        failedRequests += usage.failedRequests;
        totalCost += usage.totalCost;
      }
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalCost,
      keyCount: keys.length,
      userCount: uniqueUsers.size,
    };
  }

  /**
   * Get key prefix (first 16 characters)
   */
  private getKeyPrefix(apiKey: string): string {
    return apiKey.substring(0, Math.min(16, apiKey.length));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalKeys: this.keyRegistry.size,
      totalUsageRecords: this.keyUsage.size,
    };
  }

  /**
   * Export all keys to JSON (for backup/migration)
   */
  exportToJSON(): string {
    const keys: APIKeyRegistration[] = [];
    
    for (const metadata of this.keyRegistry.values()) {
      keys.push({
        apiKey: metadata.apiKey,
        userId: metadata.userId,
        email: metadata.email,
        username: metadata.username,
        teamId: metadata.teamId,
        teamName: metadata.teamName,
        organizationId: metadata.organizationId,
        organizationName: metadata.organizationName,
        roles: metadata.roles,
        expiresAt: metadata.expiresAt,
        metadata: metadata.metadata,
      });
    }

    return JSON.stringify(keys, null, 2);
  }
}

