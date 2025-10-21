/**
 * Tests for Identity Extractor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityExtractor } from '../src/identity/identity-extractor.js';
import { ProxilionRequest } from '../src/types/index.js';

describe('IdentityExtractor', () => {
  let extractor: IdentityExtractor;

  beforeEach(() => {
    extractor = new IdentityExtractor({
      enableAPIKeyMapping: true,
      enableJWTExtraction: true,
      enableHeaderExtraction: true,
      enableCookieExtraction: true,
      enableIPMapping: true,
      defaultOrganizationId: 'test-org',
    });
  });

  describe('API Key Extraction', () => {
    it('should extract identity from registered API key', async () => {
      // Register API key
      extractor.registerAPIKey({
        apiKey: 'sk-test-1234567890abcdef',
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        organizationId: 'org-123',
        teamId: 'team-456',
        createdAt: Date.now(),
      });

      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'authorization': 'Bearer sk-test-1234567890abcdef',
        },
        body: {},
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('user-123');
      expect(identity.email).toBe('test@example.com');
      expect(identity.organizationId).toBe('org-123');
      expect(identity.teamId).toBe('team-456');
      expect(identity.source).toBe('api-key');
      expect(identity.confidence).toBe(1.0);
    });

    it('should infer identity from unregistered API key', async () => {
      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'authorization': 'Bearer sk-unknown-key',
        },
        body: {},
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toContain('api-key-');
      expect(identity.organizationId).toBe('test-org');
      expect(identity.source).toBe('api-key');
      expect(identity.confidence).toBe(0.5);
    });
  });

  describe('JWT Extraction', () => {
    it('should extract identity from JWT token', async () => {
      // Create a simple JWT (header.payload.signature)
      const payload = {
        sub: 'user-456',
        email: 'jwt@example.com',
        preferred_username: 'jwtuser',
        org_id: 'org-789',
        team_id: 'team-123',
        roles: ['admin', 'user'],
      };

      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const jwt = `header.${encodedPayload}.signature`;

      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'authorization': `Bearer ${jwt}`,
        },
        body: {},
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('user-456');
      expect(identity.email).toBe('jwt@example.com');
      expect(identity.username).toBe('jwtuser');
      expect(identity.organizationId).toBe('org-789');
      expect(identity.teamId).toBe('team-123');
      expect(identity.roles).toEqual(['admin', 'user']);
      expect(identity.source).toBe('jwt-token');
      expect(identity.confidence).toBe(0.9);
    });
  });

  describe('HTTP Header Extraction', () => {
    it('should extract identity from HTTP headers', async () => {
      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'x-user-id': 'user-789',
          'x-user-email': 'header@example.com',
          'x-organization-id': 'org-456',
          'x-team-id': 'team-789',
        },
        body: {},
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('user-789');
      expect(identity.email).toBe('header@example.com');
      expect(identity.organizationId).toBe('org-456');
      expect(identity.teamId).toBe('team-789');
      expect(identity.source).toBe('http-header');
      expect(identity.confidence).toBe(0.8);
    });
  });

  describe('Cookie Extraction', () => {
    it('should extract identity from cookies', async () => {
      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'cookie': 'session_id=abc123; user_id=user-999; user_email=cookie@example.com',
        },
        body: {},
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('user-999');
      expect(identity.email).toBe('cookie@example.com');
      expect(identity.organizationId).toBe('test-org');
      expect(identity.source).toBe('browser-cookie');
      expect(identity.confidence).toBe(0.7);
    });
  });

  describe('IP Mapping', () => {
    it('should extract identity from IP address mapping', async () => {
      extractor.registerIPMapping('192.168.1.100', 'user-ip-123');

      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {},
        body: {},
        sourceIp: '192.168.1.100',
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('user-ip-123');
      expect(identity.organizationId).toBe('test-org');
      expect(identity.source).toBe('ip-address');
      expect(identity.confidence).toBe(0.3);
    });
  });

  describe('Anonymous Fallback', () => {
    it('should create anonymous identity when no extraction method succeeds', async () => {
      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {},
        body: {},
        sourceIp: '10.0.0.1',
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('anonymous-10.0.0.1');
      expect(identity.organizationId).toBe('test-org');
      expect(identity.source).toBe('unknown');
      expect(identity.confidence).toBe(0.0);
      expect(identity.metadata?.anonymous).toBe(true);
    });
  });

  describe('Priority Order', () => {
    it('should prioritize API key over other methods', async () => {
      extractor.registerAPIKey({
        apiKey: 'sk-priority-test',
        userId: 'api-key-user',
        email: 'apikey@example.com',
        organizationId: 'org-api',
        createdAt: Date.now(),
      });

      const request: ProxilionRequest = {
        id: 'req-1',
        timestamp: Date.now(),
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'authorization': 'Bearer sk-priority-test',
          'x-user-id': 'header-user',
          'x-user-email': 'header@example.com',
          'cookie': 'user_id=cookie-user',
        },
        body: {},
      };

      const identity = await extractor.extractIdentity(request);

      expect(identity.userId).toBe('api-key-user');
      expect(identity.email).toBe('apikey@example.com');
      expect(identity.source).toBe('api-key');
    });
  });

  describe('Statistics', () => {
    it('should track registration statistics', () => {
      extractor.registerAPIKey({
        apiKey: 'sk-stats-test-1',
        userId: 'user-1',
        organizationId: 'org-1',
        createdAt: Date.now(),
      });

      extractor.registerAPIKey({
        apiKey: 'sk-stats-test-2',
        userId: 'user-2',
        organizationId: 'org-1',
        createdAt: Date.now(),
      });

      extractor.registerIPMapping('192.168.1.1', 'user-1');

      const stats = extractor.getStats();

      expect(stats.registeredAPIKeys).toBe(2);
      expect(stats.registeredIPMappings).toBe(1);
    });
  });
});

