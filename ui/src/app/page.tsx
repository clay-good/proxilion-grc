'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  Shield,
  DollarSign,
  Zap,
  AlertTriangle,
  TrendingUp,
  Server,
  Settings,
} from 'lucide-react';
import { MetricsCard } from '@/components/MetricsCard';
import { RequestsChart } from '@/components/RequestsChart';
import { SecurityChart } from '@/components/SecurityChart';
import { AlertsList } from '@/components/AlertsList';
import { ProvidersStatus } from '@/components/ProvidersStatus';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

async function fetchMetrics() {
  const res = await fetch(`${API_URL}/metrics/current`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

async function fetchAlerts() {
  const res = await fetch(`${API_URL}/alerts?acknowledged=false`);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

async function fetchSystemStatus() {
  const res = await fetch(`${API_URL}/system/status`);
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

export default function Dashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 5000,
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 10000,
  });

  const { data: systemStatus } = useQuery({
    queryKey: ['system'],
    queryFn: fetchSystemStatus,
    refetchInterval: 30000,
  });

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const criticalAlerts = alerts?.filter((a: { severity: string }) => a.severity === 'critical').length || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Proxilion</h1>
                <p className="text-sm text-gray-500">Enterprise AI Security Proxy</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/monitor"
                className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Activity className="h-4 w-4" />
                <span>Live Monitor</span>
              </Link>
              <Link
                href="/policies"
                className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Shield className="h-4 w-4" />
                <span>Policies</span>
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <TrendingUp className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/security"
                className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span>Security Controls</span>
              </Link>
              <div className="text-right">
                <p className="text-sm text-gray-500">Uptime</p>
                <p className="text-lg font-semibold text-gray-900">
                  {systemStatus ? Math.floor(systemStatus.uptime / 3600) : 0}h
                </p>
              </div>
              <div className="h-10 w-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-700">Online</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Critical Alerts Banner */}
        {criticalAlerts > 0 && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-red-800">
                  {criticalAlerts} Critical Alert{criticalAlerts > 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  Immediate attention required. Check alerts below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricsCard
            title="Total Requests"
            value={metrics?.requests?.total || 0}
            change={`${metrics?.requests?.ratePerSecond || 0}/s`}
            icon={Activity}
            color="blue"
          />
          <MetricsCard
            title="Threats Blocked"
            value={metrics?.security?.threatsDetected || 0}
            change={`${metrics?.security?.criticalAlerts || 0} critical`}
            icon={Shield}
            color="red"
          />
          <MetricsCard
            title="Total Cost"
            value={`$${(metrics?.cost?.totalSpent || 0).toFixed(2)}`}
            change={`$${(metrics?.cost?.avgCostPerRequest || 0).toFixed(4)}/req`}
            icon={DollarSign}
            color="green"
          />
          <MetricsCard
            title="Avg Latency"
            value={`${metrics?.performance?.avgLatency || 0}ms`}
            change={`P95: ${metrics?.performance?.p95Latency || 0}ms`}
            icon={Zap}
            color="yellow"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <RequestsChart />
          <SecurityChart />
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProvidersStatus providers={metrics?.providers || {}} />
          <AlertsList alerts={alerts || []} loading={alertsLoading} />
        </div>

        {/* Performance Metrics */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-primary-600" />
            Performance Metrics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Cache Hit Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {((metrics?.performance?.cacheHitRate || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {((metrics?.performance?.errorRate || 0) * 100).toFixed(2)}%
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {metrics?.requests?.total > 0
                  ? ((metrics.requests.success / metrics.requests.total) * 100).toFixed(1)
                  : 0}
                %
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">P99 Latency</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {metrics?.performance?.p99Latency || 0}ms
              </p>
            </div>
          </div>
        </div>

        {/* Top Models */}
        {metrics?.cost?.topModels && metrics.cost.topModels.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Server className="h-5 w-5 mr-2 text-primary-600" />
              Top Models by Cost
            </h2>
            <div className="space-y-3">
              {metrics.cost.topModels.slice(0, 5).map((model: { model: string; cost: number; percentage: number; count: number }, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary-700">{index + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{model.model}</p>
                      <p className="text-sm text-gray-500">{model.count} requests</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">${model.cost.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">
                      ${(model.cost / model.count).toFixed(4)}/req
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            Proxilion v1.0.0 - Enterprise AI Security Network Proxy
          </p>
        </div>
      </footer>
    </div>
  );
}

