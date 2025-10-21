'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Shield } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

async function fetchSecurityMetrics() {
  const res = await fetch(`${API_URL}/metrics/current`);
  if (!res.ok) throw new Error('Failed to fetch security metrics');
  return res.json();
}

export function SecurityChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['security-metrics'],
    queryFn: fetchSecurityMetrics,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  const chartData = [
    {
      name: 'PII Findings',
      count: data?.security?.piiFindings || 0,
    },
    {
      name: 'Injection Attempts',
      count: data?.security?.injectionAttempts || 0,
    },
    {
      name: 'Anomalies',
      count: data?.security?.anomalies || 0,
    },
    {
      name: 'Critical Alerts',
      count: data?.security?.criticalAlerts || 0,
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Shield className="h-5 w-5 mr-2 text-red-600" />
        Security Threats
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="name" 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Bar 
            dataKey="count" 
            fill="#ef4444" 
            name="Threats Detected"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

