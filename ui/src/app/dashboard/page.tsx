'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  Globe,
  Smartphone,
  Monitor,
  Code,
  Clock,
  XCircle,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

interface DashboardMetrics {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  piiDetections: number;
  complianceViolations: number;
  activeUsers: number;
  avgResponseTime: number;
  uptime: number;
  deviceBreakdown: {
    mobile: number;
    browser: number;
    api: number;
  };
  topThreats: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
  complianceScores: Record<string, number>;
  recentBlocks: Array<{
    id: string;
    timestamp: number;
    user: string;
    device: string;
    threat: string;
    severity: string;
  }>;
}

async function fetchDashboardMetrics(timeRange: string): Promise<DashboardMetrics> {
  const res = await fetch(`${API_URL}/metrics/dashboard?range=${timeRange}`);
  if (!res.ok) {
    // Return mock data for development
    return {
      totalRequests: 45678,
      blockedRequests: 1234,
      allowedRequests: 44444,
      piiDetections: 892,
      complianceViolations: 342,
      activeUsers: 156,
      avgResponseTime: 45,
      uptime: 99.97,
      deviceBreakdown: {
        mobile: 12456,
        browser: 28934,
        api: 4288,
      },
      topThreats: [
        { type: 'SSN Detected', count: 234, severity: 'CRITICAL' },
        { type: 'Credit Card', count: 189, severity: 'CRITICAL' },
        { type: 'Email Address', count: 156, severity: 'MEDIUM' },
        { type: 'Phone Number', count: 123, severity: 'LOW' },
        { type: 'IP Address', count: 98, severity: 'LOW' },
      ],
      complianceScores: {
        'HIPAA': 98.5,
        'PCI-DSS': 99.2,
        'GDPR': 97.8,
        'CCPA': 98.1,
        'SOX': 99.5,
      },
      recentBlocks: [
        {
          id: '1',
          timestamp: Date.now() - 120000,
          user: 'john.doe@company.com',
          device: 'Mobile (iOS)',
          threat: 'SSN Detected',
          severity: 'CRITICAL',
        },
        {
          id: '2',
          timestamp: Date.now() - 300000,
          user: 'jane.smith@company.com',
          device: 'Browser (Chrome)',
          threat: 'Credit Card Number',
          severity: 'CRITICAL',
        },
        {
          id: '3',
          timestamp: Date.now() - 450000,
          user: 'api-service',
          device: 'API',
          threat: 'Email Address',
          severity: 'MEDIUM',
        },
      ],
    };
  }
  return res.json();
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', timeRange],
    queryFn: () => fetchDashboardMetrics(timeRange),
    refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30 seconds
  });

  const blockRate = metrics ? ((metrics.blockedRequests / metrics.totalRequests) * 100).toFixed(2) : '0';
  const threatDetectionRate = metrics ? ((metrics.piiDetections / metrics.totalRequests) * 100).toFixed(2) : '0';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Security Dashboard</h1>
                <p className="text-sm text-gray-500">Real-time AI security monitoring across all devices</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as '24h' | '7d' | '30d')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>

              {/* Auto-refresh Toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  autoRefresh
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Activity className={`h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
                  <span>{autoRefresh ? 'Live' : 'Paused'}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : metrics ? (
          <div className="space-y-6">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Requests */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Total Requests</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {metrics.totalRequests.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Across all devices</p>
                  </div>
                  <Activity className="h-12 w-12 text-blue-500" />
                </div>
              </div>

              {/* Blocked Requests */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Blocked Requests</p>
                    <p className="text-3xl font-bold text-red-600 mt-2">
                      {metrics.blockedRequests.toLocaleString()}
                    </p>
                    <p className="text-xs text-red-400 mt-1">{blockRate}% block rate</p>
                  </div>
                  <XCircle className="h-12 w-12 text-red-500" />
                </div>
              </div>

              {/* PII Detections */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-orange-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">PII Detections</p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">
                      {metrics.piiDetections.toLocaleString()}
                    </p>
                    <p className="text-xs text-orange-400 mt-1">{threatDetectionRate}% of requests</p>
                  </div>
                  <AlertTriangle className="h-12 w-12 text-orange-500" />
                </div>
              </div>

              {/* Active Users */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Active Users</p>
                    <p className="text-3xl font-bold text-green-600 mt-2">
                      {metrics.activeUsers.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-400 mt-1">Protected users</p>
                  </div>
                  <Users className="h-12 w-12 text-green-500" />
                </div>
              </div>
            </div>

            {/* Device Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Mobile */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Mobile Devices</h3>
                  <Smartphone className="h-6 w-6 text-purple-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.deviceBreakdown.mobile.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {((metrics.deviceBreakdown.mobile / metrics.totalRequests) * 100).toFixed(1)}% of traffic
                </p>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-600">✓ Enforced via MDM policies</p>
                  <p className="text-xs text-gray-600">✓ iOS & Android support</p>
                </div>
              </div>

              {/* Browser */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Browser Traffic</h3>
                  <Monitor className="h-6 w-6 text-blue-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.deviceBreakdown.browser.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {((metrics.deviceBreakdown.browser / metrics.totalRequests) * 100).toFixed(1)}% of traffic
                </p>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-600">✓ MITM proxy interception</p>
                  <p className="text-xs text-gray-600">✓ All major browsers</p>
                </div>
              </div>

              {/* API */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">API Calls</h3>
                  <Code className="h-6 w-6 text-green-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics.deviceBreakdown.api.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {((metrics.deviceBreakdown.api / metrics.totalRequests) * 100).toFixed(1)}% of traffic
                </p>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-600">✓ Programmatic access</p>
                  <p className="text-xs text-gray-600">✓ SDK integration</p>
                </div>
              </div>
            </div>

            {/* Top Threats and Compliance Scores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Threats */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Threats Detected</h3>
                <div className="space-y-3">
                  {metrics.topThreats.map((threat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{threat.type}</p>
                          <p className="text-xs text-gray-500">{threat.count} detections</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          threat.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-800'
                            : threat.severity === 'HIGH'
                            ? 'bg-orange-100 text-orange-800'
                            : threat.severity === 'MEDIUM'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {threat.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance Scores */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Scores</h3>
                <div className="space-y-4">
                  {Object.entries(metrics.complianceScores).map(([standard, score]) => (
                    <div key={standard}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{standard}</span>
                        <span className="text-sm font-bold text-gray-900">{score}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            score >= 95
                              ? 'bg-green-500'
                              : score >= 90
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${score}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Blocks */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Blocked Requests</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Device
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Threat
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Severity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {metrics.recentBlocks.map((block) => (
                      <tr key={block.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(block.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{block.user}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{block.device}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{block.threat}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              block.severity === 'CRITICAL'
                                ? 'bg-red-100 text-red-800'
                                : block.severity === 'HIGH'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {block.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* System Health */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Avg Response Time</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{metrics.avgResponseTime}ms</p>
                  </div>
                  <Clock className="h-8 w-8 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">System Uptime</p>
                    <p className="text-2xl font-bold text-green-600 mt-2">{metrics.uptime}%</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Deployment</p>
                    <p className="text-2xl font-bold text-purple-600 mt-2">Global</p>
                    <p className="text-xs text-gray-400 mt-1">Cloudflare Workers</p>
                  </div>
                  <Globe className="h-8 w-8 text-purple-500" />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

