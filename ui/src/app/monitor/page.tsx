'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  Shield,
  XCircle,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8787/monitor';

interface BlockedRequest {
  id: string;
  timestamp: string;
  userId: string;
  provider: string;
  threatLevel: string;
  reason: string;
  patterns: string[];
}

interface Alert {
  id: string;
  timestamp: string;
  type: 'security' | 'compliance' | 'system';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  details?: any;
}

interface LiveMetrics {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  activeUsers: number;
  avgResponseTime: number;
  piiDetections: number;
  complianceViolations: number;
}

export default function MonitorPage() {
  const [connected, setConnected] = useState(false);
  const [blockedRequests, setBlockedRequests] = useState<BlockedRequest[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>({
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    activeUsers: 0,
    avgResponseTime: 0,
    piiDetections: 0,
    complianceViolations: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'blocked_request':
        setBlockedRequests((prev) => [data.payload, ...prev].slice(0, 50));
        break;
      case 'alert':
        setAlerts((prev) => [data.payload, ...prev].slice(0, 20));
        break;
      case 'metrics':
        setMetrics(data.payload);
        break;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'text-red-700 bg-red-100';
      case 'HIGH':
        return 'text-orange-700 bg-orange-100';
      case 'MEDIUM':
        return 'text-yellow-700 bg-yellow-100';
      case 'LOW':
        return 'text-blue-700 bg-blue-100';
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Activity className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Real-Time Monitor</h1>
                <p className="text-sm text-gray-500">Live security and compliance monitoring</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                  connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm font-medium">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Total Requests</span>
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics.totalRequests}</div>
            <div className="mt-2 text-sm text-gray-500">
              {metrics.allowedRequests} allowed, {metrics.blockedRequests} blocked
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Blocked Requests</span>
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-red-600">{metrics.blockedRequests}</div>
            <div className="mt-2 text-sm text-gray-500">
              {metrics.totalRequests > 0
                ? ((metrics.blockedRequests / metrics.totalRequests) * 100).toFixed(1)
                : 0}
              % block rate
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Active Users</span>
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics.activeUsers}</div>
            <div className="mt-2 text-sm text-gray-500">Currently connected</div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">PII Detections</span>
              <Shield className="h-5 w-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-orange-600">{metrics.piiDetections}</div>
            <div className="mt-2 text-sm text-gray-500">
              {metrics.complianceViolations} compliance violations
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Blocked Requests */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <span>Blocked Requests</span>
              </h2>
            </div>
            <div className="p-6">
              {blockedRequests.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                  <p className="text-gray-600">No blocked requests</p>
                  <p className="text-sm text-gray-500 mt-2">All requests are passing security checks</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {blockedRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-4 border border-red-200 bg-red-50 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(
                              request.threatLevel
                            )}`}
                          >
                            {request.threatLevel}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {request.provider}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(request.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{request.reason}</p>
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Users className="h-3 w-3" />
                        <span>{request.userId}</span>
                      </div>
                      {request.patterns.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {request.patterns.map((pattern, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 text-xs bg-white border border-red-200 rounded"
                            >
                              {pattern}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <span>Security Alerts</span>
              </h2>
            </div>
            <div className="p-6">
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                  <p className="text-gray-600">No active alerts</p>
                  <p className="text-sm text-gray-500 mt-2">System is operating normally</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 border rounded-lg ${
                        alert.severity === 'CRITICAL'
                          ? 'border-red-200 bg-red-50'
                          : alert.severity === 'HIGH'
                          ? 'border-orange-200 bg-orange-50'
                          : 'border-yellow-200 bg-yellow-50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <AlertCircle
                            className={`h-4 w-4 ${
                              alert.severity === 'CRITICAL'
                                ? 'text-red-600'
                                : alert.severity === 'HIGH'
                                ? 'text-orange-600'
                                : 'text-yellow-600'
                            }`}
                          />
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(
                              alert.severity
                            )}`}
                          >
                            {alert.severity}
                          </span>
                          <span className="text-xs text-gray-600">{alert.type}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

