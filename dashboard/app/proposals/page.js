'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import StatusBadge from '../../components/StatusBadge';

const STATUSES = ['all', 'sent', 'hired', 'rejected', 'pending', 'withdrawn'];

export default function ProposalsPage() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.get('/proposals?limit=100&sort=created_at&order=desc')
      .then((data) => { setProposals(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = proposals.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search && !p.job_title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/proposals/${id}`, { status });
      setProposals(proposals.map(p => p.id === id ? { ...p, status } : p));
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatBudget = (p) => {
    if (p.job_budget_amount) return `$${p.job_budget_amount} ${p.job_budget_type || ''}`;
    if (p.job_budget_min && p.job_budget_max) return `$${p.job_budget_min}-$${p.job_budget_max}`;
    return '—';
  };

  if (loading) return (
    <div className="page-container">
      <div className="page-header"><div className="skeleton-line w-48 h-7" /><div className="skeleton-line-xs mt-2" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line-xs" /><div className="skeleton-line w-1/2 h-8 mt-2" /></div></div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Proposals</h1>
        <p className="page-subtitle">Track your sent proposals, win rates, and earnings</p>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input bg-white"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job title..."
          className="flex-1 input"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No proposals yet</p>
          <p className="text-sm">Generate your first proposal from the Chrome extension.</p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-responsive">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 border-b border-gray-200/60 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Job Title</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <Row
                  key={p.id}
                  proposal={p}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  onStatusChange={(s) => updateStatus(p.id, s)}
                  onEarningsUpdate={(earnings) => {
                    api.put(`/proposals/${p.id}`, { earnings }).then((updated) => {
                      setProposals(proposals.map(x => x.id === p.id ? updated : x));
                    }).catch(() => alert('Failed to save earnings'));
                  }}
                  formatDate={formatDate}
                  formatBudget={formatBudget}
                />
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ proposal, expanded, onToggle, onStatusChange, onEarningsUpdate, formatDate, formatBudget }) {
  const p = proposal;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer">
        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.created_at)}</td>
        <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
          {p.job_title || '—'}
          {p.connect_cost && <span className="text-xs text-gray-400 ml-2">{p.connect_cost}C</span>}
        </td>
        <td className="px-4 py-3 text-gray-500">{p.client_location || '—'}</td>
        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatBudget(p)}</td>
        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.hourly_rate ? `$${p.hourly_rate}` : '—'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-gray-50/60 border-b border-gray-200/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Proposal</h4>
                <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white/80 rounded-xl p-3 border border-gray-200/60 max-h-60 overflow-y-auto">
                  {p.proposal_text || 'No proposal text'}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Job Description</h4>
                <div className="text-sm text-gray-600 whitespace-pre-wrap bg-white/80 rounded-xl p-3 border border-gray-200/60 max-h-40 overflow-y-auto">
                  {p.job_description || 'No description'}
                </div>

                <h4 className="text-xs font-medium text-gray-500 uppercase mt-4 mb-2">Client Info</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Location: <span className="text-gray-900">{p.client_location || '—'}</span></div>
                  <div>Total Spent: <span className="text-gray-900">{p.client_total_spent || '—'}</span></div>
                  <div>Hire Rate: <span className="text-gray-900">{p.client_hire_rate || '—'}</span></div>
                </div>

                <h4 className="text-xs font-medium text-gray-500 uppercase mt-4 mb-2">Update Status</h4>
                <select
                  value={p.status}
                  onChange={(e) => { e.stopPropagation(); onStatusChange(e.target.value); }}
                  className="input py-1.5 bg-white"
                >
                  {['sent', 'hired', 'rejected', 'pending', 'withdrawn'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>

                {p.connect_cost > 0 && (
                  <div className="mt-3 text-sm text-gray-500">
                    Connects: <span className="font-medium text-gray-700">{p.connect_cost}</span> (${(p.connect_cost * 0.3).toFixed(2)})
                  </div>
                )}

                {p.status === 'hired' && (
                  <div className="mt-4">
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Earnings from this job</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">$</span>
                      <input
                        type="number"
                        defaultValue={p.earnings || ''}
                        placeholder="0.00"
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (val > 0 && val !== parseFloat(p.earnings)) onEarningsUpdate(val);
                        }}
                        className="w-32 input py-1"
                      />
                      {p.earnings > 0 && p.connect_cost > 0 && (
                        <span className="text-xs text-green-600 font-medium">
                          ROI: {(p.earnings / (p.connect_cost * 0.3)).toFixed(1)}x
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {p.job_url && (
              <a href={p.job_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-3 text-blue-600 text-sm font-medium hover:text-blue-700 hover:underline transition-colors">
                View job on Upwork →
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
