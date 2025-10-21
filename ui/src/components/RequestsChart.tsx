'use client';

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api';

async function fetchRequestsHistory() {
  const res = await fetch(`${API_URL}/metrics/timeseries?metric=requests.total&limit=50`);
  if (!res.ok) throw new Error('Failed to fetch requests history');
  return res.json();
}

export function RequestsChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['requests-history'],
    queryFn: fetchRequestsHistory,
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

  const chartData = data?.map((d: { timestamp: number; value: number }) => ({
    time: new Date(d.timestamp).toLocaleTimeString(),
    requests: d.value || 0,
  })) || [];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Activity className="h-5 w-5 mr-2 text-primary-600" />
        Request Volume
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="time" 
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
          <Line 
            type="monotone" 
            dataKey="requests" 
            stroke="#0ea5e9" 
            strokeWidth={2}
            dot={false}
            name="Total Requests"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

