/**
 * Authentication Provider
 * 
 * Supports multiple authentication methods:
 * - API Key
 * - JWT (JSON Web Token)
 * - OAuth 2.0
 * - Basic Auth
 * - Custom headers
 */

import { Logger } from '../../utils/logger.js';
import { MetricsCollector } from '../../utils/metrics.js';
import crypto from 'crypto';

export type AuthMethod = 'API_KEY' | 'JWT' | 'OAUTH' | 'BASIC' | 'CUSTOM';

export interface AuthConfig {
  method: AuthMethod;
  apiKeys?: string[];
  jwtSecret?: string;
  jwtIssuer?: string;
  oauthEndpoint?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  customHeaderName?: string;
  customValidator?: (value: string) => Promise<boolean>;
}

export interface AuthContext {
  authenticated: boolean;
  method: AuthMethod;
  userId?: string;
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
}

export interface JWTPayload {
  sub: string;
  iss?: string;
  exp?: number;
  iat?: number;
  roles?: string[];
  permissions?: string[];
  tenant?: string;
  [key: string]: any;
}

export class AuthProvider {
  private config: AuthConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private tokenCache: Map<string, { context: AuthContext; expiry: number }>;

  constructor(config: AuthConfig) {
    this.config = config;
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.tokenCache = new Map();

    // Start cache cleanup
    setInterval(() => this.cleanupCache(), 60000); // Every minute
  }

  /**
   * Authenticate request
   */
  async authenticate(headers: Record<string, string>): Promise<AuthContext> {
    const startTime = Date.now();

    try {
      let context: AuthContext;

      switch (this.config.method) {
        case 'API_KEY':
          context = await this.authenticateApiKey(headers);
          break;
        case 'JWT':
          context = await this.authenticateJWT(headers);
          break;
        case 'OAUTH':
          context = await this.authenticateOAuth(headers);
          break;
        case 'BASIC':
          context = await this.authenticateBasic(headers);
          break;
        case 'CUSTOM':
          context = await this.authenticateCustom(headers);
          break;
        default:
          throw new Error(`Unsupported auth method: ${this.config.method}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('auth_duration_ms', duration);

      if (context.authenticated) {
        this.metrics.increment('auth_success_total');
        this.logger.debug('Authentication successful', {
          method: this.config.method,
          userId: context.userId,
        });
      } else {
        this.metrics.increment('auth_failed_total');
        this.logger.warn('Authentication failed', {
          method: this.config.method,
        });
      }

      return context;
    } catch (error) {
      this.metrics.increment('auth_error_total');
      this.logger.error('Authentication error', error as Error);

      return {
        authenticated: false,
        method: this.config.method,
      };
    }
  }

  /**
   * Authenticate using API Key
   */
  private async authenticateApiKey(headers: Record<string, string>): Promise<AuthContext> {
    const authHeader = headers['authorization'] || headers['x-api-key'];

    if (!authHeader) {
      return { authenticated: false, method: 'API_KEY' };
    }

    // Extract API key from "Bearer <key>" or direct key
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    // Check if API key is valid
    const isValid = this.config.apiKeys?.includes(apiKey) || false;

    if (!isValid) {
      return { authenticated: false, method: 'API_KEY' };
    }

    // Extract user ID from API key (simple hash for demo)
    const userId = this.hashApiKey(apiKey);

    return {
      authenticated: true,
      method: 'API_KEY',
      userId,
      roles: ['user'],
      permissions: ['ai:request'],
    };
  }

  /**
   * Authenticate using JWT
   */
  private async authenticateJWT(headers: Record<string, string>): Promise<AuthContext> {
    const authHeader = headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, method: 'JWT' };
    }

    const token = authHeader.substring(7);

    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && cached.expiry > Date.now()) {
      return cached.context;
    }

    try {
      const payload = await this.verifyJWT(token);

      // Check expiration
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return { authenticated: false, method: 'JWT' };
      }

      // Check issuer
      if (this.config.jwtIssuer && payload.iss !== this.config.jwtIssuer) {
        return { authenticated: false, method: 'JWT' };
      }

      const context: AuthContext = {
        authenticated: true,
        method: 'JWT',
        userId: payload.sub,
        tenantId: payload.tenant,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        metadata: payload,
      };

      // Cache the result
      const expiry = payload.exp ? payload.exp * 1000 : Date.now() + 3600000; // 1 hour default
      this.tokenCache.set(token, { context, expiry });

      return context;
    } catch (error) {
      this.logger.warn('JWT verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { authenticated: false, method: 'JWT' };
    }
  }

  /**
   * Verify JWT token (simplified - in production use a proper JWT library)
   */
  private async verifyJWT(token: string): Promise<JWTPayload> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    if (this.config.jwtSecret) {
      const data = `${headerB64}.${payloadB64}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.jwtSecret)
        .update(data)
        .digest('base64url');

      if (signatureB64 !== expectedSignature) {
        throw new Error('Invalid JWT signature');
      }
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    return JSON.parse(payloadJson);
  }

  /**
   * Authenticate using OAuth 2.0
   */
  private async authenticateOAuth(headers: Record<string, string>): Promise<AuthContext> {
    const authHeader = headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, method: 'OAUTH' };
    }

    const token = authHeader.substring(7);

    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && cached.expiry > Date.now()) {
      return cached.context;
    }

    try {
      // Validate token with OAuth provider
      const response = await fetch(this.config.oauthEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token,
          client_id: this.config.oauthClientId!,
          client_secret: this.config.oauthClientSecret!,
        }),
      });

      if (!response.ok) {
        return { authenticated: false, method: 'OAUTH' };
      }

      const data = await response.json() as any;

      if (!data.active) {
        return { authenticated: false, method: 'OAUTH' };
      }

      const context: AuthContext = {
        authenticated: true,
        method: 'OAUTH',
        userId: data.sub || data.username,
        roles: data.roles || [],
        permissions: data.scope?.split(' ') || [],
        metadata: data as Record<string, any>,
      };

      // Cache the result
      const expiry = data.exp ? data.exp * 1000 : Date.now() + 3600000;
      this.tokenCache.set(token, { context, expiry });

      return context;
    } catch (error) {
      this.logger.error('OAuth validation failed', error as Error);
      return { authenticated: false, method: 'OAUTH' };
    }
  }

  /**
   * Authenticate using Basic Auth
   */
  private async authenticateBasic(headers: Record<string, string>): Promise<AuthContext> {
    const authHeader = headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return { authenticated: false, method: 'BASIC' };
    }

    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // In production, validate against a user database
    // For now, just check if credentials are provided
    if (!username || !password) {
      return { authenticated: false, method: 'BASIC' };
    }

    return {
      authenticated: true,
      method: 'BASIC',
      userId: username,
      roles: ['user'],
      permissions: ['ai:request'],
    };
  }

  /**
   * Authenticate using custom method
   */
  private async authenticateCustom(headers: Record<string, string>): Promise<AuthContext> {
    if (!this.config.customHeaderName || !this.config.customValidator) {
      return { authenticated: false, method: 'CUSTOM' };
    }

    const headerValue = headers[this.config.customHeaderName.toLowerCase()];

    if (!headerValue) {
      return { authenticated: false, method: 'CUSTOM' };
    }

    const isValid = await this.config.customValidator(headerValue);

    if (!isValid) {
      return { authenticated: false, method: 'CUSTOM' };
    }

    return {
      authenticated: true,
      method: 'CUSTOM',
      userId: this.hashApiKey(headerValue),
      roles: ['user'],
      permissions: ['ai:request'],
    };
  }

  /**
   * Hash API key for user ID
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let removed = 0;

    for (const [token, cached] of this.tokenCache.entries()) {
      if (cached.expiry <= now) {
        this.tokenCache.delete(token);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Cleaned up expired auth cache entries', { removed });
    }
  }

  /**
   * Check if user has permission
   */
  hasPermission(context: AuthContext, permission: string): boolean {
    if (!context.authenticated) {
      return false;
    }

    return context.permissions?.includes(permission) || false;
  }

  /**
   * Check if user has role
   */
  hasRole(context: AuthContext, role: string): boolean {
    if (!context.authenticated) {
      return false;
    }

    return context.roles?.includes(role) || false;
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.tokenCache.size;
  }
}

