'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';

export default function HomePage() {
  const [analytics, setAnalytics] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics').catch(() => null),
      api.get('/proposals?limit=5&sort=created_at&order=desc').catch(() => []),
      api.get('/analytics/insights').catch(() => []),
    ]).then(([a, p, i]) => {
      setAnalytics(a);
      setProposals(Array.isArray(p) ? p : []);
      setInsights(Array.isArray(i) ? i.filter(x => x.is_active) : []);
      setLoading(false);
    });
  }, []);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) return (
    <div className="page-container">
      <div className="page-header"><div className="skeleton-line w-48 h-7" /><div className="skeleton-line-xs mt-2" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line-xs" /><div className="skeleton-line w-1/2 h-8 mt-2" /></div></div>
        ))}
      </div>
    </div>
  );

  const s = analytics?.summary || {};
  const c = analytics?.connects || {};
  const pending = s.sent || 0;
  const winRate = s.winRate || 0;
  const winColor = winRate >= 30 ? 'text-green-600' : winRate >= 15 ? 'text-yellow-600' : 'text-red-500';

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your proposal pipeline at a glance</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Proposals</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{s.total || 0}</div>
          <div className="text-xs text-gray-400 mt-1">{s.hired || 0} hired, {s.rejected || 0} rejected</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</div>
          <div className={`text-2xl font-bold mt-1 ${winColor}`}>{winRate.toFixed(1)}%</div>
          <div className="text-xs text-gray-400 mt-1">hired / (hired + rejected)</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Responses</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{pending}</div>
          <div className="text-xs text-gray-400 mt-1">awaiting client reply</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Connect ROI</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{c.roiMultiplier ? `${c.roiMultiplier.toFixed(1)}x` : '—'}</div>
          <div className="text-xs text-gray-400 mt-1">${c.totalEarnings?.toFixed(0) || 0} earned / ${c.totalConnectCostUsd?.toFixed(0) || 0} spent</div>
        </div>
      </div>

      {/* Recent Proposals */}
      <div className="card mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Recent Proposals</h2>
          <Link href="/proposals" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View All →</Link>
        </div>
        {proposals.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No proposals yet. Generate your first from the Chrome extension.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Job Title</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Rate</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map(p => (
                  <tr key={p.id} className="border-t border-gray-50">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.created_at)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{p.job_title || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {p.response_type && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            p.response_type === 'hired' ? 'bg-green-100 text-green-700' :
                            p.response_type === 'interview' ? 'bg-blue-100 text-blue-700' :
                            p.response_type === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{p.response_type.replace('_', ' ')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{p.hourly_rate ? `$${p.hourly_rate}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom row: Insights + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Insights */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Learned Patterns</h2>
            <Link href="/analytics" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Analyze →</Link>
          </div>
          {insights.length === 0 ? (
            <p className="text-sm text-gray-400">No patterns learned yet. Track proposal outcomes and analyze from the Analytics page.</p>
          ) : (
            <ul className="space-y-2">
              {insights.slice(0, 3).map((r, i) => (
                <li key={r.id} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-gray-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                  <span>{r.insight_text}</span>
                </li>
              ))}
              {insights.length > 3 && (
                <li className="text-xs text-gray-400">+{insights.length - 3} more patterns active</li>
              )}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/profile" className="btn-secondary text-center text-sm py-2.5">Edit Profile</Link>
            <Link href="/projects" className="btn-secondary text-center text-sm py-2.5">Manage Projects</Link>
            <Link href="/templates" className="btn-secondary text-center text-sm py-2.5">View Templates</Link>
            <Link href="/settings" className="btn-secondary text-center text-sm py-2.5">Settings</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
