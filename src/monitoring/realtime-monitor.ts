/**
 * Real-time Monitoring System
 * 
 * Provides WebSocket-based live monitoring with:
 * - Real-time metrics streaming
 * - Live alert notifications
 * - System event broadcasting
 * - Connection management with heartbeat
 * - Subscription-based filtering
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector, MetricStats } from '../utils/metrics.js';
import { AnalyticsEngine, Anomaly } from '../analytics/analytics-engine.js';
import { AlertManager, Alert } from '../integrations/alerting/alert-manager.js';
import { AuditEvent, MetricEvent, ThreatLevel } from '../types/index.js';

export type MonitorEventType = 
  | 'metric' 
  | 'alert' 
  | 'anomaly' 
  | 'threat' 
  | 'system' 
  | 'heartbeat';

export interface MonitorEvent {
  id: string;
  type: MonitorEventType;
  timestamp: number;
  data: any;
}

export interface MonitorSubscription {
  eventTypes: MonitorEventType[];
  metricNames?: string[];
  minThreatLevel?: ThreatLevel;
  filters?: Record<string, any>;
}

export interface MonitorConnection {
  id: string;
  connectedAt: number;
  lastHeartbeat: number;
  subscription: MonitorSubscription;
  send: (event: MonitorEvent) => void;
}

export interface RealtimeMonitorConfig {
  heartbeatInterval?: number;
  connectionTimeout?: number;
  maxConnections?: number;
  metricsInterval?: number;
  enableCompression?: boolean;
}

export class RealtimeMonitor {
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private analyticsEngine: AnalyticsEngine;
  private connections: Map<string, MonitorConnection>;
  private config: Required<RealtimeMonitorConfig>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private eventBuffer: MonitorEvent[] = [];
  private maxBufferSize = 1000;

  constructor(
    metricsCollector: MetricsCollector,
    analyticsEngine: AnalyticsEngine,
    config: RealtimeMonitorConfig = {}
  ) {
    this.logger = new Logger();
    this.metricsCollector = metricsCollector;
    this.analyticsEngine = analyticsEngine;
    this.connections = new Map();
    
    this.config = {
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      connectionTimeout: config.connectionTimeout || 90000, // 90 seconds
      maxConnections: config.maxConnections || 100,
      metricsInterval: config.metricsInterval || 5000, // 5 seconds
      enableCompression: config.enableCompression ?? true,
    };

    this.startHeartbeat();
    this.startMetricsStreaming();
  }

  /**
   * Register a new connection
   */
  connect(
    connectionId: string,
    subscription: MonitorSubscription,
    sendFn: (event: MonitorEvent) => void
  ): boolean {
    if (this.connections.size >= this.config.maxConnections) {
      this.logger.warn('Max connections reached', { 
        current: this.connections.size,
        max: this.config.maxConnections 
      });
      return false;
    }

    const connection: MonitorConnection = {
      id: connectionId,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      subscription,
      send: sendFn,
    };

    this.connections.set(connectionId, connection);

    this.logger.info('Monitor connection established', {
      connectionId,
      subscription,
      totalConnections: this.connections.size,
    });

    // Send initial system status
    this.sendSystemStatus(connection);

    return true;
  }

  /**
   * Disconnect a connection
   */
  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
      this.logger.info('Monitor connection closed', {
        connectionId,
        duration: Date.now() - connection.connectedAt,
        totalConnections: this.connections.size,
      });
    }
  }

  /**
   * Update connection subscription
   */
  updateSubscription(connectionId: string, subscription: Partial<MonitorSubscription>): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    connection.subscription = {
      ...connection.subscription,
      ...subscription,
    };

    this.logger.debug('Subscription updated', { connectionId, subscription });
    return true;
  }

  /**
   * Broadcast metric event
   */
  broadcastMetric(metric: MetricEvent): void {
    const event: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'metric',
      timestamp: Date.now(),
      data: metric,
    };

    this.bufferEvent(event);
    this.broadcast(event, (conn) => 
      conn.subscription.eventTypes.includes('metric') &&
      (!conn.subscription.metricNames || conn.subscription.metricNames.includes(metric.name))
    );
  }

  /**
   * Broadcast alert
   */
  broadcastAlert(alert: Alert): void {
    const event: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'alert',
      timestamp: Date.now(),
      data: alert,
    };

    this.bufferEvent(event);
    this.broadcast(event, (conn) => 
      conn.subscription.eventTypes.includes('alert')
    );
  }

  /**
   * Broadcast anomaly
   */
  broadcastAnomaly(anomaly: Anomaly): void {
    const event: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'anomaly',
      timestamp: Date.now(),
      data: anomaly,
    };

    this.bufferEvent(event);
    this.broadcast(event, (conn) => 
      conn.subscription.eventTypes.includes('anomaly')
    );
  }

  /**
   * Broadcast threat event
   */
  broadcastThreat(auditEvent: AuditEvent): void {
    const event: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'threat',
      timestamp: Date.now(),
      data: auditEvent,
    };

    this.bufferEvent(event);
    this.broadcast(event, (conn) => {
      if (!conn.subscription.eventTypes.includes('threat')) {
        return false;
      }

      // Filter by minimum threat level
      if (conn.subscription.minThreatLevel && auditEvent.threatLevel) {
        const levels: ThreatLevel[] = [ThreatLevel.NONE, ThreatLevel.LOW, ThreatLevel.MEDIUM, ThreatLevel.HIGH, ThreatLevel.CRITICAL];
        const eventLevel = levels.indexOf(auditEvent.threatLevel);
        const minLevel = levels.indexOf(conn.subscription.minThreatLevel);
        return eventLevel >= minLevel;
      }

      return true;
    });
  }

  /**
   * Broadcast system event
   */
  broadcastSystemEvent(eventType: string, data: any): void {
    const event: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'system',
      timestamp: Date.now(),
      data: {
        eventType,
        ...data,
      },
    };

    this.bufferEvent(event);
    this.broadcast(event, (conn) => 
      conn.subscription.eventTypes.includes('system')
    );
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    connectionsByType: Record<string, number>;
    oldestConnection: number | null;
    averageConnectionDuration: number;
  } {
    const now = Date.now();
    const connections = Array.from(this.connections.values());

    const connectionsByType: Record<string, number> = {};
    let totalDuration = 0;
    let oldestConnection: number | null = null;

    for (const conn of connections) {
      const duration = now - conn.connectedAt;
      totalDuration += duration;

      if (!oldestConnection || conn.connectedAt < oldestConnection) {
        oldestConnection = conn.connectedAt;
      }

      // Count by subscription types
      for (const type of conn.subscription.eventTypes) {
        connectionsByType[type] = (connectionsByType[type] || 0) + 1;
      }
    }

    return {
      totalConnections: connections.length,
      connectionsByType,
      oldestConnection,
      averageConnectionDuration: connections.length > 0 ? totalDuration / connections.length : 0,
    };
  }

  /**
   * Get recent events from buffer
   */
  getRecentEvents(limit: number = 100, eventType?: MonitorEventType): MonitorEvent[] {
    let events = [...this.eventBuffer];

    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }

    return events.slice(-limit);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
      this.checkStaleConnections();
    }, this.config.heartbeatInterval);
  }

  /**
   * Start metrics streaming timer
   */
  private startMetricsStreaming(): void {
    this.metricsTimer = setInterval(() => {
      this.streamMetricsSnapshot();
    }, this.config.metricsInterval);
  }

  /**
   * Send heartbeat to all connections
   */
  private sendHeartbeats(): void {
    const heartbeat: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'heartbeat',
      timestamp: Date.now(),
      data: {
        connections: this.connections.size,
        uptime: process.uptime(),
      },
    };

    this.broadcast(heartbeat, (conn) => 
      conn.subscription.eventTypes.includes('heartbeat')
    );
  }

  /**
   * Check for stale connections and remove them
   */
  private checkStaleConnections(): void {
    const now = Date.now();
    const staleConnections: string[] = [];

    for (const [id, conn] of this.connections.entries()) {
      if (now - conn.lastHeartbeat > this.config.connectionTimeout) {
        staleConnections.push(id);
      }
    }

    for (const id of staleConnections) {
      this.disconnect(id);
      this.logger.warn('Removed stale connection', { connectionId: id });
    }
  }

  /**
   * Stream current metrics snapshot
   */
  private streamMetricsSnapshot(): void {
    // Get key metrics
    const metricNames = [
      'requestCount',
      'errorCount',
      'latency',
      'threatsDetected',
      'cacheHits',
      'cacheMisses',
    ];

    for (const name of metricNames) {
      const stats = this.metricsCollector.getStats(name);
      if (stats) {
        this.broadcastMetric({
          name,
          value: stats.mean,
          type: 'gauge',
          timestamp: Date.now(),
          tags: { snapshot: 'true' },
        });
      }
    }
  }

  /**
   * Send initial system status to connection
   */
  private sendSystemStatus(connection: MonitorConnection): void {
    const stats = this.getConnectionStats();
    
    const event: MonitorEvent = {
      id: crypto.randomUUID(),
      type: 'system',
      timestamp: Date.now(),
      data: {
        eventType: 'connection.established',
        connectionId: connection.id,
        stats,
      },
    };

    connection.send(event);
  }

  /**
   * Broadcast event to matching connections
   */
  private broadcast(
    event: MonitorEvent,
    filter: (conn: MonitorConnection) => boolean
  ): void {
    let sent = 0;
    let failed = 0;

    for (const connection of this.connections.values()) {
      if (filter(connection)) {
        try {
          connection.send(event);
          connection.lastHeartbeat = Date.now();
          sent++;
        } catch (error) {
          this.logger.error('Failed to send event to connection', error as Error, {
            connectionId: connection.id,
            eventType: event.type,
          });
          failed++;
        }
      }
    }

    if (sent > 0 || failed > 0) {
      this.logger.debug('Event broadcasted', {
        eventType: event.type,
        sent,
        failed,
      });
    }
  }

  /**
   * Buffer event for history
   */
  private bufferEvent(event: MonitorEvent): void {
    this.eventBuffer.push(event);

    // Trim buffer if too large
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }
  }

  /**
   * Stop monitoring system
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    // Disconnect all connections
    for (const id of this.connections.keys()) {
      this.disconnect(id);
    }

    this.logger.info('Realtime monitor stopped');
  }
}

