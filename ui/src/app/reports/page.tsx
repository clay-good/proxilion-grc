'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
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
  trendsLast24h: {
    requests: number[];
    blocks: number[];
    timestamps: string[];
  };
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
      trendsLast24h: {
        requests: [1200, 1350, 1100, 1450, 1600, 1800, 2100, 2400, 2200, 1900, 1700, 1500],
        blocks: [45, 52, 38, 61, 58, 72, 89, 95, 87, 76, 68, 54],
        timestamps: ['12am', '2am', '4am', '6am', '8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm'],
      },
    };
  }
  return res.json();
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: metrics, isLoading, refetch } = useQuery({
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
            <button className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              <Download className="h-4 w-4" />
              <span>Export Report</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="compliance">Compliance Report</option>
                <option value="security">Security Report</option>
                <option value="executive">Executive Summary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Report Content */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Generating report...</p>
          </div>
        ) : (
          <>
            {/* Compliance Report */}
            {reportType === 'compliance' && complianceReport && (
              <div className="space-y-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Total Violations</span>
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                      {complianceReport.summary.totalViolations}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Critical</span>
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="text-3xl font-bold text-red-600">
                      {complianceReport.summary.criticalViolations}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Compliance Score</span>
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="text-3xl font-bold text-green-600">
                      {complianceReport.summary.complianceScore}%
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Standards</span>
                      <Shield className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                      {Object.keys(complianceReport.byStandard).length}
                    </div>
                  </div>
                </div>

                {/* By Standard */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Compliance by Standard</h2>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {Object.entries(complianceReport.byStandard).map(([standard, data]: [string, any]) => (
                        <div key={standard} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <span className="text-lg font-medium text-gray-900 uppercase">{standard}</span>
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                data.score >= 90 ? 'text-green-700 bg-green-100' :
                                data.score >= 75 ? 'text-yellow-700 bg-yellow-100' :
                                'text-red-700 bg-red-100'
                              }`}>
                                Score: {data.score}%
                              </span>
                            </div>
                            <div className="text-sm text-gray-600">{data.violations} violations</div>
                          </div>
                          <div className="w-32">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  data.score >= 90 ? 'bg-green-600' :
                                  data.score >= 75 ? 'bg-yellow-600' :
                                  'bg-red-600'
                                }`}
                                style={{ width: `${data.score}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top Violations */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Top Violations</h2>
                  </div>
                  <div className="p-6">
                    <div className="space-y-3">
                      {complianceReport.topViolations.map((violation, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                          <div className="flex items-center space-x-4">
                            <span className="text-2xl font-bold text-gray-400">{idx + 1}</span>
                            <div>
                              <div className="font-medium text-gray-900">{violation.type}</div>
                              <div className="text-sm text-gray-600">{violation.count} occurrences</div>
                            </div>
                          </div>
                          <span className={`px-3 py-1 text-sm font-medium rounded ${
                            violation.severity === 'CRITICAL' ? 'text-red-700 bg-red-100' :
                            violation.severity === 'HIGH' ? 'text-orange-700 bg-orange-100' :
                            'text-yellow-700 bg-yellow-100'
                          }`}>
                            {violation.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security Report */}
            {reportType === 'security' && securityReport && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Report</h2>
                <pre className="text-sm text-gray-700 overflow-auto">
                  {JSON.stringify(securityReport, null, 2)}
                </pre>
              </div>
            )}

            {/* Executive Report */}
            {reportType === 'executive' && executiveReport && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Executive Summary</h2>
                <pre className="text-sm text-gray-700 overflow-auto">
                  {JSON.stringify(executiveReport, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

