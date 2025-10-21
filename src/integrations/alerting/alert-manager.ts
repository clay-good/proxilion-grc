/**
 * Alert Manager
 * 
 * Manages security alerts with multiple channels:
 * - Email (SMTP)
 * - Slack
 * - PagerDuty
 * - Microsoft Teams
 * - Custom webhooks
 */

import { Logger } from '../../utils/logger.js';
import { MetricsCollector } from '../../utils/metrics.js';
import { AuditEvent, ThreatLevel } from '../../types/index.js';

export type AlertChannel = 'EMAIL' | 'SLACK' | 'PAGERDUTY' | 'TEAMS' | 'WEBHOOK';
export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannelConfig[];
  minThreatLevel: ThreatLevel;
  throttle: {
    enabled: boolean;
    windowMs: number;
    maxAlerts: number;
  };
  aggregation: {
    enabled: boolean;
    windowMs: number;
  };
}

export interface AlertChannelConfig {
  type: AlertChannel;
  enabled: boolean;
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  event: AuditEvent;
  metadata: Record<string, any>;
}

export class AlertManager {
  private config: AlertConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private alertHistory: Map<string, number[]>;
  private aggregationBuffer: Alert[];
  private aggregationTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      channels: config.channels || [],
      minThreatLevel: config.minThreatLevel || ThreatLevel.MEDIUM,
      throttle: {
        enabled: config.throttle?.enabled ?? true,
        windowMs: config.throttle?.windowMs || 60000, // 1 minute
        maxAlerts: config.throttle?.maxAlerts || 10,
      },
      aggregation: {
        enabled: config.aggregation?.enabled ?? true,
        windowMs: config.aggregation?.windowMs || 30000, // 30 seconds
      },
    };

    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.alertHistory = new Map();
    this.aggregationBuffer = [];

    if (this.config.aggregation.enabled) {
      this.startAggregationTimer();
    }
  }

  /**
   * Send alert for security event
   */
  async alert(event: AuditEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Check if event meets minimum threat level
    if (!this.shouldAlert(event)) {
      return;
    }

    // Check throttling
    if (this.config.throttle.enabled && this.isThrottled(event)) {
      this.logger.debug('Alert throttled', {
        eventType: event.eventType,
        threatLevel: event.threatLevel,
      });
      this.metrics.increment('alert_throttled_total');
      return;
    }

    const alert = this.createAlert(event);

    if (this.config.aggregation.enabled) {
      // Add to aggregation buffer
      this.aggregationBuffer.push(alert);
    } else {
      // Send immediately
      await this.sendAlert(alert);
    }

    // Track alert in history
    this.trackAlert(event);
  }

  /**
   * Check if event should trigger an alert
   */
  private shouldAlert(event: AuditEvent): boolean {
    if (!event.threatLevel) return false;

    const threatLevels: ThreatLevel[] = [ThreatLevel.NONE, ThreatLevel.LOW, ThreatLevel.MEDIUM, ThreatLevel.HIGH, ThreatLevel.CRITICAL];
    const eventLevel = threatLevels.indexOf(event.threatLevel);
    const minLevel = threatLevels.indexOf(this.config.minThreatLevel);

    return eventLevel >= minLevel;
  }

  /**
   * Check if alert is throttled
   */
  private isThrottled(event: AuditEvent): boolean {
    const key = `${event.eventType}:${event.threatLevel}`;
    const now = Date.now();
    const windowStart = now - this.config.throttle.windowMs;

    // Get alert history for this key
    let history = this.alertHistory.get(key) || [];

    // Remove old alerts outside the window
    history = history.filter((timestamp) => timestamp > windowStart);

    // Check if throttle limit exceeded
    return history.length >= this.config.throttle.maxAlerts;
  }

  /**
   * Track alert in history
   */
  private trackAlert(event: AuditEvent): void {
    const key = `${event.eventType}:${event.threatLevel}`;
    const now = Date.now();

    const history = this.alertHistory.get(key) || [];
    history.push(now);

    this.alertHistory.set(key, history);
  }

  /**
   * Create alert from event
   */
  private createAlert(event: AuditEvent): Alert {
    const severity = this.mapThreatLevelToSeverity(event.threatLevel || ThreatLevel.NONE);
    const title = this.generateAlertTitle(event);
    const message = this.generateAlertMessage(event);

    return {
      id: crypto.randomUUID(),
      timestamp: event.timestamp,
      severity,
      title,
      message,
      event,
      metadata: {
        requestId: event.requestId,
        userId: event.userId,
        sourceIp: event.sourceIp,
        provider: event.provider,
        model: event.model,
      },
    };
  }

  /**
   * Map threat level to alert severity
   */
  private mapThreatLevelToSeverity(threatLevel: ThreatLevel): AlertSeverity {
    const severityMap: Record<ThreatLevel, AlertSeverity> = {
      [ThreatLevel.NONE]: 'INFO',
      [ThreatLevel.LOW]: 'INFO',
      [ThreatLevel.MEDIUM]: 'WARNING',
      [ThreatLevel.HIGH]: 'ERROR',
      [ThreatLevel.CRITICAL]: 'CRITICAL',
    };
    return severityMap[threatLevel];
  }

  /**
   * Generate alert title
   */
  private generateAlertTitle(event: AuditEvent): string {
    const titles: Record<string, string> = {
      'pii.detected': '🔒 PII Detected in AI Request',
      'injection.detected': '⚠️ Prompt Injection Attempt Detected',
      'request.blocked': '🛑 AI Request Blocked by Security Policy',
      'rate.limit.exceeded': '⏱️ Rate Limit Exceeded',
      'auth.failed': '🔐 Authentication Failed',
    };

    return titles[event.eventType || ''] || `🔔 Security Event: ${event.eventType || 'unknown'}`;
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(event: AuditEvent): string {
    const parts = [
      `Threat Level: ${event.threatLevel}`,
      `Action: ${event.action}`,
      `Decision: ${event.decision}`,
    ];

    if (event.userId) {
      parts.push(`User: ${event.userId}`);
    }

    if (event.sourceIp) {
      parts.push(`Source IP: ${event.sourceIp}`);
    }

    if (event.provider && event.model) {
      parts.push(`Model: ${event.provider}/${event.model}`);
    }

    if (event.findings && event.findings.length > 0) {
      parts.push(`Findings: ${event.findings.length} security issues detected`);
    }

    return parts.join('\n');
  }

  /**
   * Send alert to all enabled channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const channelConfig of this.config.channels) {
      if (!channelConfig.enabled) {
        continue;
      }

      promises.push(
        this.sendToChannel(alert, channelConfig).catch((error) => {
          this.logger.error('Failed to send alert to channel', error as Error, {
            channel: channelConfig.type,
            alertId: alert.id,
          });
          this.metrics.increment(`alert_channel_error_total_${channelConfig.type.toLowerCase()}`);
        })
      );
    }

    await Promise.all(promises);
    this.metrics.increment('alert_sent_total');
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(alert: Alert, channelConfig: AlertChannelConfig): Promise<void> {
    switch (channelConfig.type) {
      case 'SLACK':
        await this.sendToSlack(alert, channelConfig.config);
        break;
      case 'PAGERDUTY':
        await this.sendToPagerDuty(alert, channelConfig.config);
        break;
      case 'TEAMS':
        await this.sendToTeams(alert, channelConfig.config);
        break;
      case 'WEBHOOK':
        await this.sendToWebhook(alert, channelConfig.config);
        break;
      case 'EMAIL':
        await this.sendToEmail(alert, channelConfig.config);
        break;
      default:
        this.logger.warn('Unknown alert channel type', { type: channelConfig.type });
    }
  }

  /**
   * Send alert to Slack
   */
  private async sendToSlack(alert: Alert, config: Record<string, any>): Promise<void> {
    const color = this.getSeverityColor(alert.severity);

    const payload = {
      text: alert.title,
      attachments: [
        {
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            { title: 'Severity', value: alert.severity, short: true },
            { title: 'Request ID', value: alert.metadata.requestId, short: true },
            { title: 'Timestamp', value: new Date(alert.timestamp).toISOString(), short: false },
          ],
          footer: 'Proxilion AI Security',
          ts: Math.floor(alert.timestamp / 1000),
        },
      ],
    };

    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send alert to PagerDuty
   */
  private async sendToPagerDuty(alert: Alert, config: Record<string, any>): Promise<void> {
    const payload = {
      routing_key: config.integrationKey,
      event_action: 'trigger',
      payload: {
        summary: alert.title,
        severity: alert.severity.toLowerCase(),
        source: 'proxilion',
        timestamp: new Date(alert.timestamp).toISOString(),
        custom_details: {
          message: alert.message,
          ...alert.metadata,
        },
      },
    };

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send alert to Microsoft Teams
   */
  private async sendToTeams(alert: Alert, config: Record<string, any>): Promise<void> {
    const color = this.getSeverityColor(alert.severity);

    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: alert.title,
      themeColor: color.replace('#', ''),
      title: alert.title,
      text: alert.message,
      sections: [
        {
          facts: [
            { name: 'Severity', value: alert.severity },
            { name: 'Request ID', value: alert.metadata.requestId },
            { name: 'Timestamp', value: new Date(alert.timestamp).toISOString() },
          ],
        },
      ],
    };

    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send alert to webhook
   */
  private async sendToWebhook(alert: Alert, config: Record<string, any>): Promise<void> {
    await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
      body: JSON.stringify(alert),
    });
  }

  /**
   * Send alert via email (placeholder)
   */
  private async sendToEmail(alert: Alert, config: Record<string, any>): Promise<void> {
    // Email sending would require SMTP configuration
    // This is a placeholder for the implementation
    this.logger.info('Email alert (not implemented)', {
      to: config.to,
      subject: alert.title,
    });
  }

  /**
   * Get color for severity
   */
  private getSeverityColor(severity: AlertSeverity): string {
    const colors: Record<AlertSeverity, string> = {
      INFO: '#36a64f',
      WARNING: '#ff9900',
      ERROR: '#ff0000',
      CRITICAL: '#8b0000',
    };
    return colors[severity];
  }

  /**
   * Start aggregation timer
   */
  private startAggregationTimer(): void {
    this.aggregationTimer = setInterval(() => {
      this.flushAggregatedAlerts();
    }, this.config.aggregation.windowMs);
  }

  /**
   * Flush aggregated alerts
   */
  private async flushAggregatedAlerts(): Promise<void> {
    if (this.aggregationBuffer.length === 0) {
      return;
    }

    const alerts = [...this.aggregationBuffer];
    this.aggregationBuffer = [];

    // If multiple alerts, send as summary
    if (alerts.length > 1) {
      const summary = this.createAggregatedAlert(alerts);
      await this.sendAlert(summary);
    } else {
      await this.sendAlert(alerts[0]);
    }
  }

  /**
   * Create aggregated alert from multiple alerts
   */
  private createAggregatedAlert(alerts: Alert[]): Alert {
    const highestSeverity = this.getHighestSeverity(alerts);
    const eventTypes = [...new Set(alerts.map((a) => a.event.eventType))];

    return {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      severity: highestSeverity,
      title: `🔔 ${alerts.length} Security Events Detected`,
      message: `Multiple security events detected:\n${eventTypes.join(', ')}`,
      event: alerts[0].event, // Use first event as reference
      metadata: {
        alertCount: alerts.length,
        eventTypes,
        timeRange: {
          start: Math.min(...alerts.map((a) => a.timestamp)),
          end: Math.max(...alerts.map((a) => a.timestamp)),
        },
      },
    };
  }

  /**
   * Get highest severity from alerts
   */
  private getHighestSeverity(alerts: Alert[]): AlertSeverity {
    const severities: AlertSeverity[] = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];
    let highest: AlertSeverity = 'INFO';

    for (const alert of alerts) {
      if (severities.indexOf(alert.severity) > severities.indexOf(highest)) {
        highest = alert.severity;
      }
    }

    return highest;
  }

  /**
   * Stop alert manager
   */
  stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    // Flush remaining alerts
    this.flushAggregatedAlerts();
  }
}

