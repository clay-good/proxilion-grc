/**
 * Browser Session Tracker
 * 
 * Tracks browser-based LLM usage with user identification.
 * Handles:
 * - Cookie-based session tracking
 * - SSO integration (SAML, OAuth, OIDC)
 * - Corporate proxy headers
 * - Browser fingerprinting (as fallback)
 * - Session persistence
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { ProxilionRequest } from '../types/index.js';
import { UserIdentity } from './identity-extractor.js';

export interface BrowserSession {
  sessionId: string;
  userId: string;
  email?: string;
  username?: string;
  displayName?: string;
  teamId?: string;
  organizationId: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  userAgent?: string;
  sourceIp?: string;
  metadata?: Record<string, any>;
}

export interface SessionConfig {
  sessionDuration: number;  // ms
  cookieName: string;
  cookieDomain?: string;
  cookieSecure: boolean;
  cookieHttpOnly: boolean;
  cookieSameSite: 'strict' | 'lax' | 'none';
}

export class BrowserSessionTracker {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: Required<SessionConfig>;
  private sessions: Map<string, BrowserSession> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<SessionConfig> = {}) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      sessionDuration: config.sessionDuration ?? 24 * 60 * 60 * 1000, // 24 hours
      cookieName: config.cookieName ?? 'proxilion_session',
      cookieDomain: config.cookieDomain || '',
      cookieSecure: config.cookieSecure ?? true,
      cookieHttpOnly: config.cookieHttpOnly ?? true,
      cookieSameSite: config.cookieSameSite ?? 'lax',
    };

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Get or create session from request
   */
  async getOrCreateSession(request: ProxilionRequest, identity: UserIdentity): Promise<BrowserSession> {
    // Try to get existing session from cookie
    const sessionId = this.extractSessionId(request);
    
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session && !this.isSessionExpired(session)) {
        // Update last seen
        session.lastSeen = Date.now();
        
        this.logger.debug('Existing session found', {
          sessionId,
          userId: session.userId || '',
        });
        
        return session;
      }
    }

    // Create new session
    const newSession = this.createSession(identity, request);
    this.sessions.set(newSession.sessionId, newSession);
    
    this.logger.info('New browser session created', {
      sessionId: newSession.sessionId,
      userId: newSession.userId,
      organizationId: newSession.organizationId,
    });
    
    this.metrics.increment('browser_session_created_total', 1, {
      organizationId: newSession.organizationId,
    });
    
    return newSession;
  }

  /**
   * Create new session
   */
  private createSession(identity: UserIdentity, request: ProxilionRequest): BrowserSession {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    
    return {
      sessionId,
      userId: identity.userId,
      email: identity.email,
      username: identity.username,
      displayName: identity.displayName,
      teamId: identity.teamId,
      organizationId: identity.organizationId,
      createdAt: now,
      lastSeen: now,
      expiresAt: now + this.config.sessionDuration,
      userAgent: request.userAgent,
      sourceIp: request.sourceIp,
      metadata: identity.metadata,
    };
  }

  /**
   * Extract session ID from request cookies
   */
  private extractSessionId(request: ProxilionRequest): string | null {
    const cookieHeader = request.headers['cookie'] || request.headers['Cookie'];
    if (!cookieHeader) return null;

    const cookies = this.parseCookies(cookieHeader);
    return cookies[this.config.cookieName] || null;
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
   * Generate session ID
   */
  private generateSessionId(): string {
    // Generate cryptographically secure random session ID
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if session is expired
   */
  private isSessionExpired(session: BrowserSession): boolean {
    return Date.now() > session.expiresAt;
  }

  /**
   * Get session cookie header
   */
  getSessionCookie(session: BrowserSession): string {
    const parts = [
      `${this.config.cookieName}=${session.sessionId}`,
      `Max-Age=${Math.floor(this.config.sessionDuration / 1000)}`,
      `Path=/`,
    ];

    if (this.config.cookieDomain) {
      parts.push(`Domain=${this.config.cookieDomain}`);
    }

    if (this.config.cookieSecure) {
      parts.push('Secure');
    }

    if (this.config.cookieHttpOnly) {
      parts.push('HttpOnly');
    }

    parts.push(`SameSite=${this.config.cookieSameSite}`);

    return parts.join('; ');
  }

  /**
   * Invalidate session
   */
  invalidateSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    
    this.logger.info('Session invalidated', { sessionId });
    this.metrics.increment('browser_session_invalidated_total');
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BrowserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return null;
    }
    return session;
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): BrowserSession[] {
    const sessions: BrowserSession[] = [];
    
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !this.isSessionExpired(session)) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }

  /**
   * Get all sessions for an organization
   */
  getOrganizationSessions(organizationId: string): BrowserSession[] {
    const sessions: BrowserSession[] = [];
    
    for (const session of this.sessions.values()) {
      if (session.organizationId === organizationId && !this.isSessionExpired(session)) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    // Clean up expired sessions every hour
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Expired sessions cleaned up', { count: cleanedCount });
      this.metrics.increment('browser_session_cleanup_total', 1, { count: String(cleanedCount) });
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const now = Date.now();
    let activeSessions = 0;
    let expiredSessions = 0;

    for (const session of this.sessions.values()) {
      if (this.isSessionExpired(session)) {
        expiredSessions++;
      } else {
        activeSessions++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions,
    };
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Extract identity from SSO headers (common corporate proxy patterns)
   */
  extractFromSSOHeaders(request: ProxilionRequest): UserIdentity | null {
    // Common SSO headers from corporate proxies/gateways
    const ssoHeaders = {
      // Microsoft Azure AD / Entra ID
      'x-ms-client-principal-name': 'email',
      'x-ms-client-principal-id': 'userId',
      
      // Okta
      'x-okta-user': 'email',
      'x-okta-user-id': 'userId',
      
      // Auth0
      'x-auth0-user': 'email',
      'x-auth0-user-id': 'userId',
      
      // Generic SAML
      'x-saml-user': 'email',
      'x-saml-uid': 'userId',
      
      // Generic OAuth/OIDC
      'x-oidc-user': 'email',
      'x-oidc-sub': 'userId',
      
      // Corporate proxy headers
      'x-authenticated-user': 'email',
      'x-remote-user': 'email',
      'remote-user': 'email',
    };

    let userId: string | undefined;
    let email: string | undefined;

    for (const [header, type] of Object.entries(ssoHeaders)) {
      const value = request.headers[header] || request.headers[header.toUpperCase()];
      if (value) {
        if (type === 'userId') {
          userId = value;
        } else if (type === 'email') {
          email = value;
        }
      }
    }

    if (!userId && !email) return null;

    return {
      userId: userId || email || 'unknown',
      email: email,
      organizationId: 'default', // Would be extracted from domain or additional headers
      source: 'sso-token',
      confidence: 0.9,
      metadata: {
        ssoProvider: this.detectSSOProvider(request),
      },
    };
  }

  /**
   * Detect SSO provider from headers
   */
  private detectSSOProvider(request: ProxilionRequest): string {
    if (request.headers['x-ms-client-principal-name']) return 'azure-ad';
    if (request.headers['x-okta-user']) return 'okta';
    if (request.headers['x-auth0-user']) return 'auth0';
    if (request.headers['x-saml-user']) return 'saml';
    if (request.headers['x-oidc-user']) return 'oidc';
    return 'unknown';
  }
}

