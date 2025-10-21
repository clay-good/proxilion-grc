/**
 * Tests for Real-time Monitoring System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealtimeMonitor, MonitorEvent, MonitorSubscription } from '../src/monitoring/realtime-monitor';
import { MetricsCollector } from '../src/utils/metrics';
import { AnalyticsEngine } from '../src/analytics/analytics-engine';
import { ThreatLevel } from '../src/types/index';

describe('RealtimeMonitor', () => {
  let monitor: RealtimeMonitor;
  let metricsCollector: MetricsCollector;
  let analyticsEngine: AnalyticsEngine;

  beforeEach(() => {
    metricsCollector = MetricsCollector.getInstance();
    metricsCollector.clear();
    analyticsEngine = new AnalyticsEngine();
    
    monitor = new RealtimeMonitor(metricsCollector, analyticsEngine, {
      heartbeatInterval: 100,
      connectionTimeout: 300,
      maxConnections: 10,
      metricsInterval: 100,
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('Connection Management', () => {
    it('should establish a connection', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['metric', 'alert'],
      };

      const connected = monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      expect(connected).toBe(true);
      expect(events.length).toBeGreaterThan(0); // Should receive initial system status
      expect(events[0].type).toBe('system');
    });

    it('should reject connections when max limit reached', () => {
      const subscription: MonitorSubscription = {
        eventTypes: ['metric'],
      };

      // Connect up to max
      for (let i = 0; i < 10; i++) {
        const connected = monitor.connect(`conn-${i}`, subscription, () => {});
        expect(connected).toBe(true);
      }

      // Try to connect one more
      const connected = monitor.connect('conn-11', subscription, () => {});
      expect(connected).toBe(false);
    });

    it('should disconnect a connection', () => {
      const subscription: MonitorSubscription = {
        eventTypes: ['metric'],
      };

      monitor.connect('conn-1', subscription, () => {});
      const stats1 = monitor.getConnectionStats();
      expect(stats1.totalConnections).toBe(1);

      monitor.disconnect('conn-1');
      const stats2 = monitor.getConnectionStats();
      expect(stats2.totalConnections).toBe(0);
    });

    it('should update subscription', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['metric'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      // Update to include alerts
      const updated = monitor.updateSubscription('conn-1', {
        eventTypes: ['metric', 'alert'],
      });

      expect(updated).toBe(true);
    });

    it('should return false when updating non-existent connection', () => {
      const updated = monitor.updateSubscription('non-existent', {
        eventTypes: ['metric'],
      });

      expect(updated).toBe(false);
    });
  });

  describe('Metric Broadcasting', () => {
    it('should broadcast metrics to subscribed connections', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['metric'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      // Clear initial events
      events.length = 0;

      // Broadcast a metric
      monitor.broadcastMetric({
        name: 'test.metric',
        value: 100,
        type: 'counter',
        timestamp: Date.now(),
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('metric');
      expect(events[0].data.name).toBe('test.metric');
      expect(events[0].data.value).toBe(100);
    });

    it('should filter metrics by name', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['metric'],
        metricNames: ['allowed.metric'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      // Broadcast allowed metric
      monitor.broadcastMetric({
        name: 'allowed.metric',
        value: 100,
        type: 'counter',
        timestamp: Date.now(),
      });

      // Broadcast filtered metric
      monitor.broadcastMetric({
        name: 'filtered.metric',
        value: 200,
        type: 'counter',
        timestamp: Date.now(),
      });

      expect(events.length).toBe(1);
      expect(events[0].data.name).toBe('allowed.metric');
    });

    it('should not broadcast to unsubscribed connections', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['alert'], // Not subscribed to metrics
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      monitor.broadcastMetric({
        name: 'test.metric',
        value: 100,
        type: 'counter',
        timestamp: Date.now(),
      });

      expect(events.length).toBe(0);
    });
  });

  describe('Alert Broadcasting', () => {
    it('should broadcast alerts to subscribed connections', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['alert'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      monitor.broadcastAlert({
        id: 'alert-1',
        timestamp: Date.now(),
        severity: 'CRITICAL',
        title: 'Test Alert',
        message: 'This is a test alert',
        event: {} as any,
        metadata: {},
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('alert');
      expect(events[0].data.severity).toBe('CRITICAL');
    });
  });

  describe('Anomaly Broadcasting', () => {
    it('should broadcast anomalies to subscribed connections', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['anomaly'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      monitor.broadcastAnomaly({
        id: 'anomaly-1',
        timestamp: Date.now(),
        type: 'spike',
        severity: 'high',
        metric: 'request.latency',
        value: 500,
        baseline: 100,
        deviation: 4.5,
        description: 'Latency spike detected',
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('anomaly');
      expect(events[0].data.metric).toBe('request.latency');
    });
  });

  describe('Threat Broadcasting', () => {
    it('should broadcast threats to subscribed connections', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['threat'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      monitor.broadcastThreat({
        id: 'threat-1',
        timestamp: Date.now(),
        level: 'INFO',
        type: 'security',
        message: 'Threat detected',
        correlationId: 'corr-1',
        threatLevel: ThreatLevel.HIGH,
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('threat');
      expect(events[0].data.threatLevel).toBe(ThreatLevel.HIGH);

      monitor.disconnect('conn-1');
    });

    it('should filter threats by minimum threat level', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['threat'],
        minThreatLevel: ThreatLevel.HIGH,
      };

      monitor.connect('conn-filter-test', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      // Broadcast LOW threat (should be filtered)
      monitor.broadcastThreat({
        id: 'threat-1',
        timestamp: Date.now(),
        level: 'INFO',
        type: 'security',
        message: 'Low threat',
        correlationId: 'corr-1',
        threatLevel: ThreatLevel.LOW,
      });

      // Broadcast HIGH threat (should pass)
      monitor.broadcastThreat({
        id: 'threat-2',
        timestamp: Date.now(),
        level: 'ERROR',
        type: 'security',
        message: 'High threat',
        correlationId: 'corr-2',
        threatLevel: ThreatLevel.HIGH,
      });

      expect(events.length).toBe(1);
      expect(events[0].data.threatLevel).toBe(ThreatLevel.HIGH);
    });
  });

  describe('System Event Broadcasting', () => {
    it('should broadcast system events', () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['system'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      // Clear initial system status event
      events.length = 0;

      monitor.broadcastSystemEvent('config.updated', {
        setting: 'maxConnections',
        value: 50,
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('system');
      expect(events[0].data.eventType).toBe('config.updated');
    });
  });

  describe('Connection Statistics', () => {
    it('should return connection statistics', () => {
      const subscription: MonitorSubscription = {
        eventTypes: ['metric', 'alert'],
      };

      monitor.connect('conn-1', subscription, () => {});
      monitor.connect('conn-2', subscription, () => {});

      const stats = monitor.getConnectionStats();

      expect(stats.totalConnections).toBe(2);
      expect(stats.connectionsByType.metric).toBe(2);
      expect(stats.connectionsByType.alert).toBe(2);
      expect(stats.oldestConnection).toBeDefined();
      expect(stats.averageConnectionDuration).toBeGreaterThanOrEqual(0);
    });

    it('should return zero stats when no connections', () => {
      const stats = monitor.getConnectionStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.oldestConnection).toBeNull();
      expect(stats.averageConnectionDuration).toBe(0);
    });
  });

  describe('Event Buffer', () => {
    it('should buffer events', () => {
      monitor.broadcastMetric({
        name: 'test.metric',
        value: 100,
        type: 'counter',
        timestamp: Date.now(),
      });

      const events = monitor.getRecentEvents(10);
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].type).toBe('metric');
    });

    it('should filter events by type', () => {
      monitor.broadcastMetric({
        name: 'test.metric',
        value: 100,
        type: 'counter',
        timestamp: Date.now(),
      });

      monitor.broadcastSystemEvent('test.event', {});

      const metricEvents = monitor.getRecentEvents(10, 'metric');
      const systemEvents = monitor.getRecentEvents(10, 'system');

      expect(metricEvents.every(e => e.type === 'metric')).toBe(true);
      expect(systemEvents.every(e => e.type === 'system')).toBe(true);
    });

    it('should limit returned events', () => {
      // Broadcast many events
      for (let i = 0; i < 50; i++) {
        monitor.broadcastMetric({
          name: 'test.metric',
          value: i,
          type: 'counter',
          timestamp: Date.now(),
        });
      }

      const events = monitor.getRecentEvents(10);
      expect(events.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeats to subscribed connections', async () => {
      const events: MonitorEvent[] = [];
      const subscription: MonitorSubscription = {
        eventTypes: ['heartbeat'],
      };

      monitor.connect('conn-1', subscription, (event) => {
        events.push(event);
      });

      events.length = 0;

      // Wait for heartbeat
      await new Promise(resolve => setTimeout(resolve, 150));

      const heartbeats = events.filter(e => e.type === 'heartbeat');
      expect(heartbeats.length).toBeGreaterThan(0);
      expect(heartbeats[0].data.connections).toBeDefined();
    });
  });

  describe('Stale Connection Cleanup', () => {
    it('should remove stale connections', async () => {
      const subscription: MonitorSubscription = {
        eventTypes: ['metric'],
      };

      monitor.connect('conn-1', subscription, () => {});

      const stats1 = monitor.getConnectionStats();
      expect(stats1.totalConnections).toBe(1);

      // Wait for connection to become stale
      await new Promise(resolve => setTimeout(resolve, 400));

      const stats2 = monitor.getConnectionStats();
      expect(stats2.totalConnections).toBe(0);
    });
  });
});

