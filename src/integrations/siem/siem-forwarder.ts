/**
 * SIEM Forwarder
 * 
 * Forwards security events to SIEM systems in standard formats:
 * - CEF (Common Event Format) - ArcSight, QRadar
 * - LEEF (Log Event Extended Format) - QRadar
 * - JSON - Splunk, Elastic, Sentinel
 * - Syslog - Generic SIEM systems
 */

import { Logger } from '../../utils/logger.js';
import { MetricsCollector } from '../../utils/metrics.js';
import { AuditEvent, ThreatLevel } from '../../types/index.js';

export type SIEMFormat = 'CEF' | 'LEEF' | 'JSON' | 'SYSLOG';
export type SIEMVendor = 'SPLUNK' | 'QRADAR' | 'ARCSIGHT' | 'SENTINEL' | 'ELASTIC' | 'GENERIC';

export interface SIEMConfig {
  enabled: boolean;
  vendor: SIEMVendor;
  format: SIEMFormat;
  endpoint: string;
  apiKey?: string;
  batchSize: number;
  batchInterval: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface SIEMEvent {
  timestamp: number;
  severity: number;
  category: string;
  action: string;
  outcome: string;
  source: string;
  destination: string;
  user?: string;
  threatLevel: ThreatLevel;
  details: Record<string, any>;
}

export class SIEMForwarder {
  private config: SIEMConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private eventQueue: SIEMEvent[];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SIEMConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      vendor: config.vendor || 'GENERIC',
      format: config.format || 'JSON',
      endpoint: config.endpoint || '',
      apiKey: config.apiKey,
      batchSize: config.batchSize || 100,
      batchInterval: config.batchInterval || 10000, // 10 seconds
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
    };

    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.eventQueue = [];

    if (this.config.enabled) {
      this.startBatchTimer();
    }
  }

  /**
   * Forward security event to SIEM
   */
  async forward(event: AuditEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const siemEvent = this.convertToSIEMEvent(event);
    this.eventQueue.push(siemEvent);

    // If batch size reached, flush immediately
    if (this.eventQueue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Convert audit event to SIEM event
   */
  private convertToSIEMEvent(event: AuditEvent): SIEMEvent {
    return {
      timestamp: event.timestamp,
      severity: this.mapThreatLevelToSeverity(event.threatLevel || ThreatLevel.NONE),
      category: this.mapEventTypeToCategory(event.eventType || 'unknown'),
      action: event.action || 'unknown',
      outcome: event.decision ? String(event.decision) : 'unknown',
      source: event.sourceIp || 'unknown',
      destination: event.targetService || 'unknown',
      user: event.userId || 'unknown',
      threatLevel: event.threatLevel || ThreatLevel.NONE,
      details: {
        requestId: event.requestId,
        model: event.model,
        provider: event.provider,
        findings: event.findings,
        policyId: event.policyId,
        duration: event.duration,
      },
    };
  }

  /**
   * Map threat level to SIEM severity (0-10)
   */
  private mapThreatLevelToSeverity(threatLevel: ThreatLevel): number {
    const severityMap: Record<string, number> = {
      [ThreatLevel.NONE]: 0,
      [ThreatLevel.LOW]: 3,
      [ThreatLevel.MEDIUM]: 5,
      [ThreatLevel.HIGH]: 8,
      [ThreatLevel.CRITICAL]: 10,
    };
    return severityMap[threatLevel] || 0;
  }

  /**
   * Map event type to SIEM category
   */
  private mapEventTypeToCategory(eventType: string): string {
    const categoryMap: Record<string, string> = {
      'request.received': 'authentication',
      'request.blocked': 'security',
      'request.allowed': 'access',
      'scan.completed': 'security',
      'policy.evaluated': 'policy',
      'pii.detected': 'data-protection',
      'injection.detected': 'security',
    };
    return categoryMap[eventType] || 'general';
  }

  /**
   * Format event based on SIEM format
   */
  private formatEvent(event: SIEMEvent): string {
    switch (this.config.format) {
      case 'CEF':
        return this.formatCEF(event);
      case 'LEEF':
        return this.formatLEEF(event);
      case 'JSON':
        return this.formatJSON(event);
      case 'SYSLOG':
        return this.formatSyslog(event);
      default:
        return this.formatJSON(event);
    }
  }

  /**
   * Format as CEF (Common Event Format)
   * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
   */
  private formatCEF(event: SIEMEvent): string {
    const header = [
      'CEF:0',
      'Proxilion',
      'AI Security Proxy',
      '0.1.0',
      event.category,
      event.action,
      event.severity.toString(),
    ].join('|');

    const extensions = [
      `rt=${event.timestamp}`,
      `src=${event.source}`,
      `dst=${event.destination}`,
      `act=${event.action}`,
      `outcome=${event.outcome}`,
      `cat=${event.category}`,
      `cs1Label=ThreatLevel`,
      `cs1=${event.threatLevel}`,
      `cs2Label=RequestId`,
      `cs2=${event.details.requestId}`,
      `cs3Label=Model`,
      `cs3=${event.details.model}`,
    ];

    if (event.user) {
      extensions.push(`suser=${event.user}`);
    }

    return `${header}|${extensions.join(' ')}`;
  }

  /**
   * Format as LEEF (Log Event Extended Format)
   * LEEF:Version|Vendor|Product|Version|EventID|Delimiter|Extension
   */
  private formatLEEF(event: SIEMEvent): string {
    const header = [
      'LEEF:2.0',
      'Proxilion',
      'AI Security Proxy',
      '0.1.0',
      event.category,
      '\t',
    ].join('|');

    const extensions = [
      `devTime=${new Date(event.timestamp).toISOString()}`,
      `src=${event.source}`,
      `dst=${event.destination}`,
      `usrName=${event.user || 'unknown'}`,
      `cat=${event.category}`,
      `sev=${event.severity}`,
      `threatLevel=${event.threatLevel}`,
      `requestId=${event.details.requestId}`,
      `model=${event.details.model}`,
      `provider=${event.details.provider}`,
    ];

    return `${header}${extensions.join('\t')}`;
  }

  /**
   * Format as JSON
   */
  private formatJSON(event: SIEMEvent): string {
    return JSON.stringify({
      timestamp: new Date(event.timestamp).toISOString(),
      severity: event.severity,
      category: event.category,
      action: event.action,
      outcome: event.outcome,
      source: {
        ip: event.source,
        user: event.user,
      },
      destination: event.destination,
      threat: {
        level: event.threatLevel,
        score: event.severity,
      },
      details: event.details,
      vendor: 'Proxilion',
      product: 'AI Security Proxy',
      version: '0.1.0',
    });
  }

  /**
   * Format as Syslog (RFC 5424)
   */
  private formatSyslog(event: SIEMEvent): string {
    const priority = this.calculateSyslogPriority(event.severity);
    const timestamp = new Date(event.timestamp).toISOString();
    const hostname = 'proxilion';
    const appName = 'ai-security-proxy';
    const procId = process.pid || '-';
    const msgId = event.category;

    const structuredData = [
      `[proxilion@0`,
      `requestId="${event.details.requestId}"`,
      `threatLevel="${event.threatLevel}"`,
      `model="${event.details.model}"`,
      `provider="${event.details.provider}"`,
      `]`,
    ].join(' ');

    const message = `${event.action} - ${event.outcome}`;

    return `<${priority}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${message}`;
  }

  /**
   * Calculate syslog priority (facility * 8 + severity)
   */
  private calculateSyslogPriority(severity: number): number {
    const facility = 16; // local0
    const syslogSeverity = Math.min(7, Math.floor((10 - severity) * 0.7));
    return facility * 8 + syslogSeverity;
  }

  /**
   * Flush event queue to SIEM
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendToSIEM(events);
      this.metrics.increment('siem_events_sent_total', events.length);
      this.logger.info('Events sent to SIEM', { count: events.length });
    } catch (error) {
      this.logger.error('Failed to send events to SIEM', error as Error);
      this.metrics.increment('siem_events_failed_total', events.length);
      // Don't re-queue events - they've already been retried in sendToSIEM
      // Re-queuing would cause duplicate retry attempts
    }
  }

  /**
   * Send events to SIEM endpoint
   */
  private async sendToSIEM(events: SIEMEvent[]): Promise<void> {
    let payload: string;

    if (this.config.format === 'JSON') {
      // For JSON format, create array of objects (not strings)
      const jsonEvents = events.map((e) => JSON.parse(this.formatEvent(e)));
      payload = JSON.stringify(jsonEvents);
    } else {
      // For other formats, join formatted strings with newlines
      const formattedEvents = events.map((e) => this.formatEvent(e));
      payload = formattedEvents.join('\n');
    }

    // retryAttempts includes the initial attempt, so we loop retryAttempts + 1 times
    const maxAttempts = this.config.retryAttempts + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': this.getContentType(),
            ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
          },
          body: payload,
        });

        if (!response.ok) {
          throw new Error(`SIEM endpoint returned ${response.status}`);
        }

        return; // Success
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error; // Last attempt failed
        }
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * (attempt + 1)));
      }
    }
  }

  /**
   * Get content type for format
   */
  private getContentType(): string {
    switch (this.config.format) {
      case 'JSON':
        return 'application/json';
      case 'CEF':
      case 'LEEF':
      case 'SYSLOG':
        return 'text/plain';
      default:
        return 'application/json';
    }
  }

  /**
   * Start batch timer
   */
  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      this.flush().catch((error) => {
        this.logger.error('Batch flush failed', error as Error);
      });
    }, this.config.batchInterval);
  }

  /**
   * Stop batch timer
   */
  stop(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    // Flush remaining events
    this.flush().catch((error) => {
      this.logger.error('Final flush failed', error as Error);
    });
  }

  /**
   * Get configuration
   */
  getConfig(): SIEMConfig {
    return { ...this.config };
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }
}

