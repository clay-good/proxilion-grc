/**
 * Structured logging utility with privacy-preserving capabilities
 */

import { LogLevel, AuditEvent } from '../types/index.js';

export class Logger {
  private maskSensitiveData: boolean;
  private minLevel: LogLevel;
  private correlationId?: string;

  // Pre-compiled regex patterns for better performance
  private static readonly maskPatterns = [
    { pattern: /\b[a-zA-Z0-9]{32,}\b/g, replacement: '[REDACTED_KEY]' },
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[CARD]' },
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  ];

  private static readonly sensitiveKeyPatterns = [
    /api[_-]?key/i,
    /auth/i,
    /token/i,
    /secret/i,
    /password/i,
    /credential/i,
    /bearer/i,
  ];

  constructor(config?: { maskSensitiveData?: boolean; minLevel?: LogLevel }) {
    this.maskSensitiveData = config?.maskSensitiveData ?? true;
    this.minLevel = config?.minLevel ?? LogLevel.INFO;
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.TRACE,
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
      LogLevel.CRITICAL,
    ];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private maskData(data: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
    if (!this.maskSensitiveData) return data;

    if (typeof data === 'string') {
      return this.maskString(data);
    }

    if (Array.isArray(data)) {
      // Check for circular references
      if (seen.has(data)) {
        return '[Circular]';
      }
      seen.add(data);
      return data.map((item) => this.maskData(item, seen));
    }

    if (data && typeof data === 'object') {
      // Check for circular references
      if (seen.has(data)) {
        return '[Circular]';
      }
      seen.add(data);

      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isSensitiveKey(key)) {
          masked[key] = '[REDACTED]';
        } else {
          masked[key] = this.maskData(value, seen);
        }
      }
      return masked;
    }

    return data;
  }

  private isSensitiveKey(key: string): boolean {
    return Logger.sensitiveKeyPatterns.some((pattern) => pattern.test(key));
  }

  private maskString(str: string): string {
    // Use pre-compiled patterns for better performance
    for (const { pattern, replacement } of Logger.maskPatterns) {
      str = str.replace(pattern, replacement);
    }
    return str;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const event: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      type: 'log',
      message,
      correlationId: this.correlationId || 'unknown',
      data: this.maskData(data) as Record<string, unknown>,
    };

    const output = JSON.stringify(event);

    switch (level) {
      case LogLevel.CRITICAL:
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, {
      ...data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  critical(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.CRITICAL, message, {
      ...data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }
}

// Global logger instance
export const logger = new Logger();

