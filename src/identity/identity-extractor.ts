/**
 * Identity Extractor
 * 
 * Extracts user, team, and organization identity from:
 * - API keys (with metadata mapping)
 * - HTTP headers (X-User-Email, X-User-ID, etc.)
 * - JWT tokens (Authorization: Bearer)
 * - Browser cookies/sessions
 * - SSO tokens (SAML, OAuth)
 * - Custom authentication schemes
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { ProxilionRequest } from '../types/index.js';

export interface UserIdentity {
  userId: string;           // Unique user identifier
  email?: string;           // User email
  username?: string;        // Username
  displayName?: string;     // Display name
  teamId?: string;          // Team/department ID
  teamName?: string;        // Team/department name
  organizationId: string;   // Organization ID
  organizationName?: string; // Organization name
  roles?: string[];         // User roles
  metadata?: Record<string, any>; // Additional metadata
  source: IdentitySource;   // How identity was extracted
  confidence: number;       // Confidence level (0-1)
}

export type IdentitySource = 
  | 'api-key'
  | 'jwt-token'
  | 'http-header'
  | 'browser-cookie'
  | 'sso-token'
  | 'ip-address'
  | 'unknown';

export interface APIKeyMetadata {
  apiKey: string;           // Hashed API key
  userId: string;
  email?: string;
  username?: string;
  teamId?: string;
  teamName?: string;
  organizationId: string;
  organizationName?: string;
  roles?: string[];
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, any>;
}

export interface IdentityExtractionConfig {
  enableAPIKeyMapping: boolean;
  enableJWTExtraction: boolean;
  enableHeaderExtraction: boolean;
  enableCookieExtraction: boolean;
  enableIPMapping: boolean;
  jwtSecret?: string;
  defaultOrganizationId: string;
}

export class IdentityExtractor {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<IdentityExtractionConfig>;
  private apiKeyRegistry: Map<string, APIKeyMetadata> = new Map();
  private ipToUserMap: Map<string, string> = new Map();

  constructor(config: Partial<IdentityExtractionConfig> = {}) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      enableAPIKeyMapping: config.enableAPIKeyMapping ?? true,
      enableJWTExtraction: config.enableJWTExtraction ?? true,
      enableHeaderExtraction: config.enableHeaderExtraction ?? true,
      enableCookieExtraction: config.enableCookieExtraction ?? true,
      enableIPMapping: config.enableIPMapping ?? true,
      jwtSecret: config.jwtSecret || '',
      defaultOrganizationId: config.defaultOrganizationId ?? 'default',
    };
  }

  /**
   * Extract identity from request
   */
  async extractIdentity(request: ProxilionRequest): Promise<UserIdentity> {
    const startTime = Date.now();

    try {
      // Try multiple extraction methods in order of confidence
      let identity: UserIdentity | null = null;

      // 1. Try API key mapping (highest confidence)
      if (this.config.enableAPIKeyMapping) {
        identity = await this.extractFromAPIKey(request);
        if (identity) {
          this.logger.info('Identity extracted from API key', {
            userId: identity.userId || '',
            organizationId: identity.organizationId,
            source: identity.source,
          });
          this.metrics.increment('identity_extraction_success_total', 1, { source: 'api-key' });
          return identity;
        }
      }

      // 2. Try JWT token (high confidence)
      if (this.config.enableJWTExtraction) {
        identity = await this.extractFromJWT(request);
        if (identity) {
          this.logger.info('Identity extracted from JWT', {
            userId: identity.userId || '',
            organizationId: identity.organizationId,
            source: identity.source,
          });
          this.metrics.increment('identity_extraction_success_total', 1, { source: 'jwt' });
          return identity;
        }
      }

      // 3. Try HTTP headers (medium confidence)
      if (this.config.enableHeaderExtraction) {
        identity = await this.extractFromHeaders(request);
        if (identity) {
          this.logger.info('Identity extracted from headers', {
            userId: identity.userId || '',
            organizationId: identity.organizationId,
            source: identity.source,
          });
          this.metrics.increment('identity_extraction_success_total', 1, { source: 'headers' });
          return identity;
        }
      }

      // 4. Try browser cookies (medium confidence)
      if (this.config.enableCookieExtraction) {
        identity = await this.extractFromCookies(request);
        if (identity) {
          this.logger.info('Identity extracted from cookies', {
            userId: identity.userId || '',
            organizationId: identity.organizationId,
            source: identity.source,
          });
          this.metrics.increment('identity_extraction_success_total', 1, { source: 'cookies' });
          return identity;
        }
      }

      // 5. Try IP address mapping (low confidence)
      if (this.config.enableIPMapping) {
        identity = await this.extractFromIP(request);
        if (identity) {
          this.logger.info('Identity extracted from IP', {
            userId: identity.userId || '',
            organizationId: identity.organizationId,
            source: identity.source,
          });
          this.metrics.increment('identity_extraction_success_total', 1, { source: 'ip' });
          return identity;
        }
      }

      // 6. Fallback to anonymous user
      this.logger.warn('Could not extract identity, using anonymous', {
        requestId: request.id,
        sourceIp: request.sourceIp,
      });
      this.metrics.increment('identity_extraction_failed_total');

      return this.createAnonymousIdentity(request);
    } catch (error) {
      this.logger.error('Identity extraction error', error instanceof Error ? error : undefined, {
        requestId: request.id,
      });
      this.metrics.increment('identity_extraction_error_total');
      return this.createAnonymousIdentity(request);
    } finally {
      const duration = Date.now() - startTime;
      this.metrics.histogram('identity_extraction_duration_ms', duration);
    }
  }

  /**
   * Extract identity from API key
   */
  private async extractFromAPIKey(request: ProxilionRequest): Promise<UserIdentity | null> {
    // Check Authorization header
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];
    if (!authHeader) return null;

    // Extract API key from "Bearer sk-..." or "sk-..."
    let apiKey: string | null = null;
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else {
      apiKey = authHeader;
    }

    if (!apiKey) return null;

    // Hash API key for lookup (first 16 chars as identifier)
    const keyPrefix = apiKey.substring(0, 16);
    const metadata = this.apiKeyRegistry.get(keyPrefix);

    if (!metadata) {
      // API key not registered, try to infer from key format
      return this.inferIdentityFromAPIKey(apiKey, request);
    }

    return {
      userId: metadata.userId,
      email: metadata.email,
      username: metadata.username,
      teamId: metadata.teamId,
      teamName: metadata.teamName,
      organizationId: metadata.organizationId,
      organizationName: metadata.organizationName,
      roles: metadata.roles,
      metadata: metadata.metadata,
      source: 'api-key',
      confidence: 1.0,
    };
  }

  /**
   * Infer identity from API key format
   */
  private inferIdentityFromAPIKey(apiKey: string, request: ProxilionRequest): UserIdentity | null {
    // OpenAI format: sk-proj-{project}-{user}
    // Anthropic format: sk-ant-{identifier}
    // Google format: AIza{identifier}

    // Check if this looks like a valid API key (not a JWT)
    // API keys typically start with sk-, AIza, or similar prefixes
    const isValidAPIKeyFormat = /^(sk-|AIza|ant-|co-)/i.test(apiKey);

    if (!isValidAPIKeyFormat) {
      return null; // Not an API key, let other extractors try
    }

    // For now, create a user ID from the key prefix
    const keyPrefix = apiKey.substring(0, 16);

    return {
      userId: `api-key-${keyPrefix}`,
      organizationId: this.config.defaultOrganizationId,
      source: 'api-key',
      confidence: 0.5, // Lower confidence since not registered
      metadata: {
        apiKeyPrefix: keyPrefix,
        inferredFromKey: true,
      },
    };
  }

  /**
   * Extract identity from JWT token
   */
  private async extractFromJWT(request: ProxilionRequest): Promise<UserIdentity | null> {
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    
    try {
      // Decode JWT (without verification for now - in production, verify signature)
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Extract standard JWT claims
      const userId = payload.sub || payload.user_id || payload.userId;
      const email = payload.email;
      const username = payload.preferred_username || payload.username;
      const organizationId = payload.org_id || payload.organization_id || this.config.defaultOrganizationId;
      const teamId = payload.team_id || payload.department_id;
      const roles = payload.roles || payload.groups || [];

      if (!userId) return null;

      return {
        userId,
        email,
        username,
        teamId,
        organizationId,
        roles: Array.isArray(roles) ? roles : [roles],
        source: 'jwt-token',
        confidence: 0.9,
        metadata: {
          jwtIssuer: payload.iss,
          jwtExpiry: payload.exp,
        },
      };
    } catch (error) {
      this.logger.debug('Failed to parse JWT', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract identity from HTTP headers
   */
  private async extractFromHeaders(request: ProxilionRequest): Promise<UserIdentity | null> {
    // Check for common identity headers
    const userId = 
      request.headers['x-user-id'] ||
      request.headers['X-User-ID'] ||
      request.headers['x-user'] ||
      request.headers['X-User'];

    const email = 
      request.headers['x-user-email'] ||
      request.headers['X-User-Email'] ||
      request.headers['x-email'] ||
      request.headers['X-Email'];

    const organizationId = 
      request.headers['x-organization-id'] ||
      request.headers['X-Organization-ID'] ||
      request.headers['x-org-id'] ||
      request.headers['X-Org-ID'] ||
      this.config.defaultOrganizationId;

    const teamId = 
      request.headers['x-team-id'] ||
      request.headers['X-Team-ID'] ||
      request.headers['x-department-id'] ||
      request.headers['X-Department-ID'];

    if (!userId && !email) return null;

    return {
      userId: userId || email || 'unknown',
      email: email,
      organizationId,
      teamId,
      source: 'http-header',
      confidence: 0.8,
    };
  }

  /**
   * Extract identity from browser cookies
   */
  private async extractFromCookies(request: ProxilionRequest): Promise<UserIdentity | null> {
    const cookieHeader = request.headers['cookie'] || request.headers['Cookie'];
    if (!cookieHeader) return null;

    // Parse cookies
    const cookies = this.parseCookies(cookieHeader);

    // Look for common session/identity cookies
    const sessionId = cookies['session_id'] || cookies['sessionid'] || cookies['SESSIONID'];
    const userId = cookies['user_id'] || cookies['userid'] || cookies['USERID'];
    const email = cookies['user_email'] || cookies['email'];

    if (!sessionId && !userId && !email) return null;

    // In production, you'd look up the session in a session store
    // For now, use the cookie values directly
    return {
      userId: userId || sessionId || email || 'unknown',
      email: email,
      organizationId: this.config.defaultOrganizationId,
      source: 'browser-cookie',
      confidence: 0.7,
      metadata: {
        sessionId,
      },
    };
  }

  /**
   * Extract identity from IP address
   */
  private async extractFromIP(request: ProxilionRequest): Promise<UserIdentity | null> {
    if (!request.sourceIp) return null;

    const userId = this.ipToUserMap.get(request.sourceIp);
    if (!userId) return null;

    return {
      userId,
      organizationId: this.config.defaultOrganizationId,
      source: 'ip-address',
      confidence: 0.3, // Very low confidence
      metadata: {
        sourceIp: request.sourceIp,
      },
    };
  }

  /**
   * Create anonymous identity
   */
  private createAnonymousIdentity(request: ProxilionRequest): UserIdentity {
    return {
      userId: `anonymous-${request.sourceIp || 'unknown'}`,
      organizationId: this.config.defaultOrganizationId,
      source: 'unknown',
      confidence: 0.0,
      metadata: {
        anonymous: true,
        sourceIp: request.sourceIp,
      },
    };
  }

  /**
   * Parse cookie header
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    const pairs = cookieHeader.split(';');

    for (const pair of pairs) {
      const [key, value] = pair.trim().split('=');
      if (key && value) {
        cookies[key] = decodeURIComponent(value);
      }
    }

    return cookies;
  }

  /**
   * Register API key with metadata
   */
  registerAPIKey(metadata: APIKeyMetadata): void {
    const keyPrefix = metadata.apiKey.substring(0, 16);
    this.apiKeyRegistry.set(keyPrefix, metadata);
    
    this.logger.info('API key registered', {
      userId: metadata.userId,
      organizationId: metadata.organizationId,
    });
  }

  /**
   * Register IP to user mapping
   */
  registerIPMapping(ip: string, userId: string): void {
    this.ipToUserMap.set(ip, userId);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      registeredAPIKeys: this.apiKeyRegistry.size,
      registeredIPMappings: this.ipToUserMap.size,
    };
  }
}

