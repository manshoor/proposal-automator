'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import dynamic from 'next/dynamic';

const Charts = dynamic(() => import('../../components/AnalyticsCharts'), { ssr: false });

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-400">Loading analytics...</div>;
  if (!data) return <div className="text-gray-500">Failed to load analytics.</div>;

  const s = data.summary || {};

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card label="Total Proposals" value={s.total || 0} />
        <Card label="Win Rate" value={`${s.winRate || 0}%`} color="text-green-600" />
        <Card label="Avg Hourly Rate" value={`$${s.avgHourlyRate || 0}`} />
        <Card label="Total Hired" value={s.hired || 0} color="text-green-600" />
      </div>

      <Charts data={data} />
    </div>
  );
}

function Card({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
