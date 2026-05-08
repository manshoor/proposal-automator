'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

const DIMENSIONS = [
  { key: 'byHookStyle', label: 'By Hook Style', dim: 'hook_style' },
  { key: 'byPersona',   label: 'By Client Persona', dim: 'persona' },
  { key: 'byNiche',     label: 'By Niche', dim: 'niche' },
];

export default function InsightsClient({ initialTracking, initialInsights }) {
  const router = useRouter();
  const [tracking, setTracking] = useState(initialTracking || { enabled: false });
  const [insights, setInsights] = useState(initialInsights || null);
  const [recomputing, setRecomputing] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const minSample = insights?.minConfidenceSample ?? 5;

  async function toggleTracking() {
    setPendingToggle(true);
    setError(null);
    try {
      const next = !tracking.enabled;
      const result = await api.put('/outcomes/tracking', { enabled: next });
      setTracking(result);
    } catch (e) {
      setError(e?.message || 'Failed to update tracking flag');
    } finally {
      setPendingToggle(false);
    }
  }

  async function recompute() {
    setRecomputing(true);
    setError(null);
    try {
      const fresh = await api.post('/insights/recompute', {});
      setInsights(fresh);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e?.message || 'Recompute failed');
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
        <p className="text-gray-600 mt-1">
          What's winning for you. Data accumulates as you submit proposals and outcomes are recorded.
        </p>
      </div>

      {/* Outcome tracking toggle */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Outcome Tracking</div>
          <p className="text-sm text-gray-600 mt-0.5">
            When enabled, the extension watches Upwork message threads and proposal-list pages
            to record views, replies, and archives. Disable any time.
          </p>
        </div>
        <button
          onClick={toggleTracking}
          disabled={pendingToggle}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tracking.enabled
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {pendingToggle ? '...' : tracking.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Recompute */}
      <div className="flex justify-end mb-3">
        <button
          onClick={recompute}
          disabled={recomputing}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {recomputing ? 'Recomputing…' : 'Recompute patterns'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Empty state */}
      {(!insights || (
        (!insights.byHookStyle || insights.byHookStyle.length === 0) &&
        (!insights.byPersona   || insights.byPersona.length === 0) &&
        (!insights.byNiche     || insights.byNiche.length === 0)
      )) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <p className="text-gray-700 font-medium">No patterns yet.</p>
          <p className="text-gray-600 text-sm mt-1">
            Submit a few proposals and mark outcomes (or enable tracking) to start building data. We need at least {minSample} proposals per bucket before we'll recommend anything.
          </p>
        </div>
      )}

      {/* Pattern grids */}
      {insights && DIMENSIONS.map((d) => {
        const rows = insights[d.key] || [];
        if (!rows.length) return null;
        return (
          <section key={d.dim} className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{d.label}</h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-700">
                  <tr>
                    <th className="px-4 py-2 font-medium">{d.dim === 'hook_style' ? 'Hook Style' : d.dim === 'persona' ? 'Persona' : 'Niche'}</th>
                    <th className="px-4 py-2 font-medium text-right">Proposals</th>
                    <th className="px-4 py-2 font-medium text-right">Views</th>
                    <th className="px-4 py-2 font-medium text-right">Wins</th>
                    <th className="px-4 py-2 font-medium text-right">Reply Rate</th>
                    <th className="px-4 py-2 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const confident = r.confident ?? (r.sampleSize >= minSample);
                    return (
                      <tr key={r.key} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-900">{formatKey(d.dim, r.key)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{r.sampleSize}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{r.viewCount ?? 0}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{r.winCount ?? 0}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{Math.round((r.responseRate || 0) * 100)}%</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            confident ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {confident ? 'Confident' : `Need ${minSample - r.sampleSize} more`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function formatKey(dim, key) {
  if (dim === 'hook_style') return key.replace(/-/g, ' ');
  if (dim === 'persona')    return key.replace(/-/g, ' ');
  return key;
}
