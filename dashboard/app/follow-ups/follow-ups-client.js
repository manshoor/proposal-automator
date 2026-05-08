'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sent', label: 'Sent' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE = {
  scheduled: 'badge badge-blue',
  sent: 'badge badge-green',
  cancelled: 'badge badge-gray',
  expired: 'badge badge-yellow',
};

const INTERVAL_OPTIONS = [
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: 'custom', label: 'Custom date' },
];

function formatScheduledDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date - now;
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffHrs >= 0 && diffHrs < 24) {
    const hrs = Math.round(diffHrs);
    if (hrs === 0) return 'In less than an hour';
    return `In ${hrs} hour${hrs === 1 ? '' : 's'}`;
  }
  if (diffHrs < 0 && diffHrs > -24) {
    const hrs = Math.round(-diffHrs);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getJobTitle(proposalId, proposals) {
  const p = proposals.find((x) => String(x.id) === String(proposalId));
  return p?.job_title || 'Unknown';
}

// ---------------------------------------------------------------------------
// Edit Modal
// ---------------------------------------------------------------------------
function EditModal({ followUp, proposals, onClose, onSave }) {
  const [messageText, setMessageText] = useState(followUp.messageText || '');
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue(followUp.scheduledAt));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.patch(`/follow-ups/${followUp.id}`, {
        messageText,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      onSave(updated);
      onClose();
    } catch (e) {
      setErr(e?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Edit Follow-up</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
              {getJobTitle(followUp.proposalId, proposals)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          <div>
            <label className="label">Scheduled date &amp; time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Message text</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={6}
              className="input resize-none"
              placeholder="Your follow-up message…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Default intervals for the sequence preset (in days)
const SEQUENCE_INTERVALS = [3, 7, 14];

// ---------------------------------------------------------------------------
// New Follow-up Modal
// ---------------------------------------------------------------------------
function NewFollowUpModal({ proposals, onClose, onCreate }) {
  const [proposalId, setProposalId] = useState(proposals[0]?.id ?? '');
  const [scheduleMode, setScheduleMode] = useState('single'); // 'single' | 'sequence'
  const [interval, setInterval] = useState('7');
  const [customDate, setCustomDate] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState(null);

  const isSequence = scheduleMode === 'sequence';

  const handleCreate = async () => {
    setErr(null);

    if (!proposalId) {
      setErr('Please select a proposal.');
      return;
    }

    if (isSequence) {
      // Sequence mode: POST to /follow-ups/sequence; autoGenerate is always true
      setCreating(true);
      try {
        const rows = await api.post('/follow-ups/sequence', {
          proposalId: Number(proposalId),
          intervals: SEQUENCE_INTERVALS,
          autoGenerate: true,
        });
        // rows is an array; surface each one, or surface as a group
        if (Array.isArray(rows)) {
          rows.forEach((row) => onCreate(row));
        }
        onClose();
      } catch (e) {
        setErr(e?.message || 'Failed to schedule sequence');
      } finally {
        setCreating(false);
      }
      return;
    }

    // Single mode — original behavior
    if (interval === 'custom' && !customDate) {
      setErr('Please select a custom date and time.');
      return;
    }

    if (!autoGenerate && !messageText.trim()) {
      setErr('Please enter a message or enable auto-generate.');
      return;
    }

    const body = { proposalId: Number(proposalId), autoGenerate };

    if (interval === 'custom') {
      body.scheduledAt = new Date(customDate).toISOString();
    } else {
      body.intervalDays = parseInt(interval, 10);
    }

    if (!autoGenerate) {
      body.messageText = messageText.trim();
    }

    setCreating(true);
    try {
      const created = await api.post('/follow-ups', body);
      onCreate(created);
      onClose();
    } catch (e) {
      setErr(e?.message || 'Failed to create follow-up');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">New Follow-up</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          {/* Proposal picker */}
          <div>
            <label className="label">Proposal</label>
            {proposals.length === 0 ? (
              <p className="text-sm text-gray-500">No recent proposals found.</p>
            ) : (
              <select
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
                className="input bg-white"
              >
                {proposals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.job_title || `Proposal #${p.id}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Schedule mode toggle: Single vs Sequence */}
          <div>
            <label className="label">Schedule mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScheduleMode('single')}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                  !isSequence
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                Single follow-up
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('sequence')}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                  isSequence
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                Sequence (3 + 7 + 14 days)
              </button>
            </div>
            {isSequence && (
              <p className="mt-2 text-xs text-gray-500">
                Schedules 3 AI-generated follow-ups at 3, 7, and 14 days from the proposal date.
                Manual message entry is not available in sequence mode.
              </p>
            )}
          </div>

          {/* Single mode: interval picker */}
          {!isSequence && (
            <div>
              <label className="label">Schedule in</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setInterval(opt.value)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                      interval === opt.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {interval === 'custom' && (
                <div className="mt-3">
                  <label className="label">Custom date &amp; time</label>
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>
          )}

          {/* Auto-generate toggle — hidden in sequence mode (always auto) */}
          {!isSequence && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoGenerate}
                onClick={() => setAutoGenerate((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoGenerate ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    autoGenerate ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">
                Auto-generate message with AI
              </span>
            </div>
          )}

          {/* Manual message — only in single mode with autoGenerate off */}
          {!isSequence && !autoGenerate && (
            <div>
              <label className="label">Message text</label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={5}
                className="input resize-none"
                placeholder="Write your follow-up message…"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || proposals.length === 0}
            className="btn-primary"
          >
            {creating
              ? 'Scheduling…'
              : isSequence
                ? 'Schedule sequence'
                : 'Schedule follow-up'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function FollowUpsClient({ initialFollowUps, initialProposals }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [proposals] = useState(initialProposals);
  const [activeTab, setActiveTab] = useState('all');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [loadingTab, setLoadingTab] = useState(false);

  // Modals
  const [editTarget, setEditTarget] = useState(null);   // followUp object
  const [showNew, setShowNew] = useState(false);

  // Per-row loading states
  const [rowLoading, setRowLoading] = useState({});

  const setRowBusy = useCallback((id, busy) => {
    setRowLoading((prev) => ({ ...prev, [id]: busy }));
  }, []);

  // ---- Tab switch ----
  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    setError(null);
    setLoadingTab(true);
    try {
      const qs = tab === 'all' ? '' : `?status=${tab}`;
      const data = await api.get(`/follow-ups${qs}&limit=50`);
      setFollowUps(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load follow-ups');
    } finally {
      setLoadingTab(false);
    }
  };

  // ---- Edit save ----
  const handleEditSave = useCallback((updated) => {
    setFollowUps((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    setToast({ message: 'Follow-up updated', type: 'success' });
    startTransition(() => router.refresh());
  }, [router, startTransition]);

  // ---- Mark sent ----
  const handleMarkSent = useCallback(async (id) => {
    setRowBusy(id, 'markSent');
    setError(null);
    try {
      const updated = await api.patch(`/follow-ups/${id}`, { status: 'sent' });
      setFollowUps((prev) => prev.map((f) => (f.id === id ? updated : f)));
      setToast({ message: 'Marked as sent', type: 'success' });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e?.message || 'Failed to mark as sent');
    } finally {
      setRowBusy(id, null);
    }
  }, [router, startTransition, setRowBusy]);

  // ---- Regenerate ----
  const handleRegenerate = useCallback(async (id) => {
    setRowBusy(id, 'regenerate');
    setError(null);
    try {
      const updated = await api.post(`/follow-ups/${id}/regenerate`, {});
      setFollowUps((prev) => prev.map((f) => (f.id === id ? updated : f)));
      setToast({ message: 'Message regenerated', type: 'success' });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e?.message || 'Failed to regenerate message');
    } finally {
      setRowBusy(id, null);
    }
  }, [router, startTransition, setRowBusy]);

  // ---- Cancel ----
  const handleCancel = useCallback(async (id) => {
    if (!confirm('Cancel this follow-up? It will be marked as cancelled.')) return;
    setRowBusy(id, 'cancel');
    setError(null);
    try {
      await api.del(`/follow-ups/${id}`);
      // Backend sets status to cancelled; update row locally
      setFollowUps((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: 'cancelled' } : f))
      );
      setToast({ message: 'Follow-up cancelled', type: 'success' });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e?.message || 'Failed to cancel follow-up');
    } finally {
      setRowBusy(id, null);
    }
  }, [router, startTransition, setRowBusy]);

  // ---- New follow-up created ----
  // Called once per created row (single mode = 1 call; sequence mode = N calls)
  const handleCreated = useCallback((created) => {
    // Only surface in the list if the active tab would include it
    if (activeTab === 'all' || activeTab === 'scheduled') {
      setFollowUps((prev) => [...prev, created]);
    }
    setToast({ message: 'Follow-up scheduled', type: 'success' });
    startTransition(() => router.refresh());
  }, [activeTab, router, startTransition]);

  const displayedFollowUps = activeTab === 'all'
    ? followUps
    : followUps.filter((f) => f.status === activeTab);

  // Build a set of proposalIds that appear more than once in the displayed list
  // (with distinct sequenceIndex values). These rows belong to a sequence.
  const sequenceProposalIds = (() => {
    const countByProposal = {};
    for (const f of displayedFollowUps) {
      countByProposal[f.proposalId] = (countByProposal[f.proposalId] || 0) + 1;
    }
    return new Set(
      Object.keys(countByProposal).filter((pid) => countByProposal[pid] > 1).map(Number)
    );
  })();

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Follow-Ups</h1>
          <p className="page-subtitle">
            Scheduled follow-up messages for your Upwork proposals
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="btn-primary self-start sm:self-auto"
        >
          + New follow-up
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-3 text-red-500 hover:text-red-700 transition-colors"
            aria-label="Dismiss"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100/70 rounded-xl p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            disabled={loadingTab}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 disabled:opacity-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table or empty state */}
      {loadingTab ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : displayedFollowUps.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-gray-400 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <p className="text-gray-700 font-medium text-base mb-1">No follow-ups yet.</p>
          <p className="text-gray-500 text-sm">
            Click &ldquo;New follow-up&rdquo; to schedule one.
          </p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-responsive">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Job title</th>
                  <th>Scheduled</th>
                  <th className="hidden md:table-cell">Message preview</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedFollowUps.map((f) => {
                  const busy = rowLoading[f.id];
                  const jobTitle = getJobTitle(f.proposalId, proposals);
                  const preview = f.messageText
                    ? f.messageText.length > 120
                      ? f.messageText.slice(0, 120) + '…'
                      : f.messageText
                    : '—';
                  const isSent = f.status === 'sent';
                  const isCancelled = f.status === 'cancelled';
                  const isScheduled = f.status === 'scheduled';
                  const isPartOfSequence = sequenceProposalIds.has(Number(f.proposalId));
                  const isSequenceChild = isPartOfSequence && f.sequenceIndex > 0;

                  return (
                    <tr key={f.id}>
                      {/* Job title — indent child rows in a sequence */}
                      <td className="font-medium text-gray-900 max-w-[160px] sm:max-w-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          {isSequenceChild && (
                            <span className="text-gray-400 shrink-0" aria-hidden="true">&#8627;</span>
                          )}
                          <span className={`truncate ${isSequenceChild ? 'pl-0' : ''}`}>
                            {jobTitle}
                          </span>
                          {isPartOfSequence && (
                            <span
                              className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium"
                              style={{ background: '#ede9fe', color: '#5b21b6' }}
                            >
                              Sequence
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Scheduled date */}
                      <td className="text-gray-600 whitespace-nowrap">
                        {formatScheduledDate(f.scheduledAt)}
                      </td>

                      {/* Message preview — hidden on small screens */}
                      <td className="hidden md:table-cell text-gray-500 max-w-xs">
                        <span title={f.messageText || ''}>{preview}</span>
                      </td>

                      {/* Status badge */}
                      <td>
                        <span className={`${STATUS_BADGE[f.status] || 'badge badge-gray'} capitalize`}>
                          {f.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Edit — only when not cancelled/sent */}
                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() => setEditTarget(f)}
                              disabled={!!busy}
                              className="btn-secondary text-xs px-2.5 py-1"
                              title="Edit"
                            >
                              Edit
                            </button>
                          )}

                          {/* Mark sent — only scheduled */}
                          {isScheduled && (
                            <button
                              type="button"
                              onClick={() => handleMarkSent(f.id)}
                              disabled={!!busy}
                              className="btn-secondary text-xs px-2.5 py-1"
                              title="Mark as sent"
                            >
                              {busy === 'markSent' ? '…' : 'Mark sent'}
                            </button>
                          )}

                          {/* Regenerate — only when not cancelled */}
                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleRegenerate(f.id)}
                              disabled={!!busy}
                              className="btn-secondary text-xs px-2.5 py-1"
                              title="Regenerate message with AI"
                            >
                              {busy === 'regenerate' ? '…' : 'Regenerate'}
                            </button>
                          )}

                          {/* Cancel — only when not already cancelled/sent */}
                          {!isCancelled && !isSent && (
                            <button
                              type="button"
                              onClick={() => handleCancel(f.id)}
                              disabled={!!busy}
                              className="btn-danger text-xs px-2.5 py-1"
                              title="Cancel follow-up"
                            >
                              {busy === 'cancel' ? '…' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          followUp={editTarget}
          proposals={proposals}
          onClose={() => setEditTarget(null)}
          onSave={handleEditSave}
        />
      )}

      {/* New follow-up modal */}
      {showNew && (
        <NewFollowUpModal
          proposals={proposals}
          onClose={() => setShowNew(false)}
          onCreate={handleCreated}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
