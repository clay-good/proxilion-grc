/**
 * Grafana Dashboard Definitions
 * 
 * Pre-built Grafana dashboards for:
 * - Security monitoring
 * - Performance metrics
 * - Cost tracking
 * - Compliance overview
 * - System health
 */

export interface GrafanaDashboard {
  title: string;
  description: string;
  tags: string[];
  panels: GrafanaPanel[];
  templating?: {
    list: GrafanaVariable[];
  };
  time?: {
    from: string;
    to: string;
  };
  refresh?: string;
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'heatmap' | 'gauge' | 'bargauge';
  gridPos: { x: number; y: number; w: number; h: number };
  targets: GrafanaTarget[];
  options?: any;
  fieldConfig?: any;
}

export interface GrafanaTarget {
  expr: string; // PromQL expression
  legendFormat?: string;
  refId: string;
}

export interface GrafanaVariable {
  name: string;
  type: 'query' | 'interval' | 'custom';
  query?: string;
  options?: any[];
}

export class GrafanaDashboardGenerator {
  /**
   * Generate security monitoring dashboard
   */
  static generateSecurityDashboard(): GrafanaDashboard {
    return {
      title: 'Proxilion - Security Monitoring',
      description: 'Real-time security threat monitoring and violation tracking',
      tags: ['proxilion', 'security', 'threats'],
      refresh: '30s',
      time: {
        from: 'now-1h',
        to: 'now',
      },
      templating: {
        list: [
          {
            name: 'organization',
            type: 'query',
            query: 'label_values(proxilion_requests_total, organization)',
          },
        ],
      },
      panels: [
        // Threats detected over time
        {
          id: 1,
          title: 'Threats Detected',
          type: 'graph',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [
            {
              expr: 'rate(proxilion_threats_detected_total{organization="$organization"}[5m])',
              legendFormat: '{{threat_type}}',
              refId: 'A',
            },
          ],
        },
        // Current threat level
        {
          id: 2,
          title: 'Current Threat Level',
          type: 'gauge',
          gridPos: { x: 12, y: 0, w: 6, h: 8 },
          targets: [
            {
              expr: 'sum(proxilion_threats_detected_total{organization="$organization",threat_level="CRITICAL"})',
              refId: 'A',
            },
          ],
          options: {
            thresholds: {
              mode: 'absolute',
              steps: [
                { value: 0, color: 'green' },
                { value: 10, color: 'yellow' },
                { value: 50, color: 'red' },
              ],
            },
          },
        },
        // Blocked requests
        {
          id: 3,
          title: 'Blocked Requests',
          type: 'stat',
          gridPos: { x: 18, y: 0, w: 6, h: 8 },
          targets: [
            {
              expr: 'sum(increase(proxilion_requests_blocked_total{organization="$organization"}[1h]))',
              refId: 'A',
            },
          ],
        },
        // Violations by type
        {
          id: 4,
          title: 'Violations by Type',
          type: 'bargauge',
          gridPos: { x: 0, y: 8, w: 12, h: 8 },
          targets: [
            {
              expr: 'sum by (violation_type) (proxilion_violations_total{organization="$organization"})',
              legendFormat: '{{violation_type}}',
              refId: 'A',
            },
          ],
        },
        // PII detections
        {
          id: 5,
          title: 'PII Detections',
          type: 'graph',
          gridPos: { x: 12, y: 8, w: 12, h: 8 },
          targets: [
            {
              expr: 'rate(proxilion_pii_detections_total{organization="$organization"}[5m])',
              legendFormat: '{{pii_type}}',
              refId: 'A',
            },
          ],
        },
        // High-risk users
        {
          id: 6,
          title: 'High-Risk Users',
          type: 'table',
          gridPos: { x: 0, y: 16, w: 24, h: 8 },
          targets: [
            {
              expr: 'topk(10, sum by (user_id) (proxilion_violations_total{organization="$organization"}))',
              refId: 'A',
            },
          ],
        },
      ],
    };
  }

  /**
   * Generate performance monitoring dashboard
   */
  static generatePerformanceDashboard(): GrafanaDashboard {
    return {
      title: 'Proxilion - Performance Metrics',
      description: 'Request latency, throughput, and cache performance',
      tags: ['proxilion', 'performance', 'latency'],
      refresh: '10s',
      time: {
        from: 'now-30m',
        to: 'now',
      },
      panels: [
        // Request rate
        {
          id: 1,
          title: 'Request Rate',
          type: 'graph',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [
            {
              expr: 'rate(proxilion_requests_total[1m])',
              legendFormat: '{{provider}}',
              refId: 'A',
            },
          ],
        },
        // Request latency (p50, p95, p99)
        {
          id: 2,
          title: 'Request Latency',
          type: 'graph',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [
            {
              expr: 'histogram_quantile(0.50, rate(proxilion_request_duration_seconds_bucket[5m]))',
              legendFormat: 'p50',
              refId: 'A',
            },
            {
              expr: 'histogram_quantile(0.95, rate(proxilion_request_duration_seconds_bucket[5m]))',
              legendFormat: 'p95',
              refId: 'B',
            },
            {
              expr: 'histogram_quantile(0.99, rate(proxilion_request_duration_seconds_bucket[5m]))',
              legendFormat: 'p99',
              refId: 'C',
            },
          ],
        },
        // Cache hit ratio
        {
          id: 3,
          title: 'Cache Hit Ratio',
          type: 'gauge',
          gridPos: { x: 0, y: 8, w: 8, h: 8 },
          targets: [
            {
              expr: 'sum(rate(proxilion_cache_hits_total[5m])) / (sum(rate(proxilion_cache_hits_total[5m])) + sum(rate(proxilion_cache_misses_total[5m])))',
              refId: 'A',
            },
          ],
          options: {
            thresholds: {
              mode: 'percentage',
              steps: [
                { value: 0, color: 'red' },
                { value: 50, color: 'yellow' },
                { value: 80, color: 'green' },
              ],
            },
          },
        },
        // Semantic cache performance
        {
          id: 4,
          title: 'Semantic Cache Hits',
          type: 'stat',
          gridPos: { x: 8, y: 8, w: 8, h: 8 },
          targets: [
            {
              expr: 'sum(increase(proxilion_semantic_cache_hits_total[1h]))',
              refId: 'A',
            },
          ],
        },
        // Latency saved by caching
        {
          id: 5,
          title: 'Latency Saved (seconds)',
          type: 'stat',
          gridPos: { x: 16, y: 8, w: 8, h: 8 },
          targets: [
            {
              expr: 'sum(proxilion_latency_saved_seconds)',
              refId: 'A',
            },
          ],
        },
        // Load balancer backend health
        {
          id: 6,
          title: 'Backend Health',
          type: 'bargauge',
          gridPos: { x: 0, y: 16, w: 12, h: 8 },
          targets: [
            {
              expr: 'proxilion_loadbalancer_backend_health',
              legendFormat: '{{backend}}',
              refId: 'A',
            },
          ],
        },
        // Error rate
        {
          id: 7,
          title: 'Error Rate',
          type: 'graph',
          gridPos: { x: 12, y: 16, w: 12, h: 8 },
          targets: [
            {
              expr: 'rate(proxilion_errors_total[5m])',
              legendFormat: '{{error_type}}',
              refId: 'A',
            },
          ],
        },
      ],
    };
  }

  /**
   * Generate cost tracking dashboard
   */
  static generateCostDashboard(): GrafanaDashboard {
    return {
      title: 'Proxilion - Cost Tracking',
      description: 'AI API cost monitoring and budget tracking',
      tags: ['proxilion', 'cost', 'budget'],
      refresh: '1m',
      time: {
        from: 'now-24h',
        to: 'now',
      },
      templating: {
        list: [
          {
            name: 'organization',
            type: 'query',
            query: 'label_values(proxilion_cost_total_dollars, organization)',
          },
        ],
      },
      panels: [
        // Total cost
        {
          id: 1,
          title: 'Total Cost (24h)',
          type: 'stat',
          gridPos: { x: 0, y: 0, w: 6, h: 8 },
          targets: [
            {
              expr: 'sum(increase(proxilion_cost_total_dollars{organization="$organization"}[24h]))',
              refId: 'A',
            },
          ],
          options: {
            unit: 'currencyUSD',
          },
        },
        // Cost by provider
        {
          id: 2,
          title: 'Cost by Provider',
          type: 'bargauge',
          gridPos: { x: 6, y: 0, w: 9, h: 8 },
          targets: [
            {
              expr: 'sum by (provider) (increase(proxilion_cost_total_dollars{organization="$organization"}[24h]))',
              legendFormat: '{{provider}}',
              refId: 'A',
            },
          ],
        },
        // Cost savings from caching
        {
          id: 3,
          title: 'Cost Saved (Caching)',
          type: 'stat',
          gridPos: { x: 15, y: 0, w: 9, h: 8 },
          targets: [
            {
              expr: 'sum(proxilion_cache_hits_total) * 0.03', // Assume $0.03 per request
              refId: 'A',
            },
          ],
          options: {
            unit: 'currencyUSD',
          },
        },
        // Cost over time
        {
          id: 4,
          title: 'Cost Over Time',
          type: 'graph',
          gridPos: { x: 0, y: 8, w: 24, h: 8 },
          targets: [
            {
              expr: 'sum by (provider) (rate(proxilion_cost_total_dollars{organization="$organization"}[5m]))',
              legendFormat: '{{provider}}',
              refId: 'A',
            },
          ],
        },
        // Cost per request
        {
          id: 5,
          title: 'Cost Per Request',
          type: 'graph',
          gridPos: { x: 0, y: 16, w: 12, h: 8 },
          targets: [
            {
              expr: 'histogram_quantile(0.95, rate(proxilion_cost_per_request_dollars_bucket{organization="$organization"}[5m]))',
              legendFormat: 'p95',
              refId: 'A',
            },
          ],
        },
        // Token usage
        {
          id: 6,
          title: 'Token Usage',
          type: 'graph',
          gridPos: { x: 12, y: 16, w: 12, h: 8 },
          targets: [
            {
              expr: 'rate(proxilion_tokens_total{organization="$organization"}[5m])',
              legendFormat: '{{token_type}}',
              refId: 'A',
            },
          ],
        },
      ],
    };
  }

  /**
   * Generate compliance dashboard
   */
  static generateComplianceDashboard(): GrafanaDashboard {
    return {
      title: 'Proxilion - Compliance Overview',
      description: 'Compliance violations and audit trail',
      tags: ['proxilion', 'compliance', 'audit'],
      refresh: '1m',
      time: {
        from: 'now-7d',
        to: 'now',
      },
      panels: [
        // Compliance score
        {
          id: 1,
          title: 'Compliance Score',
          type: 'gauge',
          gridPos: { x: 0, y: 0, w: 8, h: 8 },
          targets: [
            {
              expr: '100 - (sum(proxilion_compliance_violations_total) / sum(proxilion_requests_total) * 100)',
              refId: 'A',
            },
          ],
          options: {
            thresholds: {
              mode: 'absolute',
              steps: [
                { value: 0, color: 'red' },
                { value: 80, color: 'yellow' },
                { value: 95, color: 'green' },
              ],
            },
          },
        },
        // Violations by regulation
        {
          id: 2,
          title: 'Violations by Regulation',
          type: 'bargauge',
          gridPos: { x: 8, y: 0, w: 16, h: 8 },
          targets: [
            {
              expr: 'sum by (regulation) (proxilion_compliance_violations_total)',
              legendFormat: '{{regulation}}',
              refId: 'A',
            },
          ],
        },
        // Violations over time
        {
          id: 3,
          title: 'Compliance Violations Over Time',
          type: 'graph',
          gridPos: { x: 0, y: 8, w: 24, h: 8 },
          targets: [
            {
              expr: 'rate(proxilion_compliance_violations_total[1h])',
              legendFormat: '{{regulation}}',
              refId: 'A',
            },
          ],
        },
      ],
    };
  }

  /**
   * Export all dashboards as JSON
   */
  static exportAll(): Record<string, GrafanaDashboard> {
    return {
      security: this.generateSecurityDashboard(),
      performance: this.generatePerformanceDashboard(),
      cost: this.generateCostDashboard(),
      compliance: this.generateComplianceDashboard(),
    };
  }
}

