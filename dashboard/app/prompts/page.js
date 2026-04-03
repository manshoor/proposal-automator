'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

const PLATFORMS = [
  { value: 'all', label: 'All Platforms (Master)' },
  { value: 'upwork', label: 'Upwork' },
  { value: 'fiverr', label: 'Fiverr' },
  { value: 'peopleperhour', label: 'PeoplePerHour' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'freelancer', label: 'Freelancer.com' },
  { value: 'toptal', label: 'Toptal' },
];

const PLATFORM_COLORS = {
  all: 'bg-gray-100 text-gray-800',
  upwork: 'bg-green-100 text-green-800',
  fiverr: 'bg-emerald-100 text-emerald-800',
  peopleperhour: 'bg-blue-100 text-blue-800',
  linkedin: 'bg-sky-100 text-sky-800',
  freelancer: 'bg-orange-100 text-orange-800',
  toptal: 'bg-purple-100 text-purple-800',
};

export default function PromptsPage() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', platform: 'all', prompt_text: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchPrompts = useCallback(() => {
    api.get('/prompts').then(data => {
      setPrompts(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const openNew = () => {
    setForm({ name: '', platform: 'all', prompt_text: '', is_active: true });
    setEditing('new');
  };

  const openEdit = (p) => {
    setForm({ name: p.name, platform: p.platform, prompt_text: p.prompt_text, is_active: p.is_active });
    setEditing(p);
  };

  const handleSave = async () => {
    if (!form.name || !form.prompt_text) { setToast({ message: 'Name and prompt text required', type: 'error' }); return; }
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await api.post('/prompts', form);
        setPrompts([created, ...prompts]);
      } else {
        const updated = await api.put(`/prompts/${editing.id}`, form);
        setPrompts(prompts.map(p => p.id === editing.id ? updated : p));
      }
      setEditing(null);
      setToast({ message: 'Prompt saved', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to save', type: 'error' });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this prompt?')) return;
    try {
      await api.del(`/prompts/${id}`);
      setPrompts(prompts.filter(p => p.id !== id));
      setToast({ message: 'Prompt deleted', type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Cannot delete default prompt', type: 'error' });
    }
  };

  const toggleActive = async (p) => {
    try {
      const updated = await api.put(`/prompts/${p.id}`, { is_active: !p.is_active });
      setPrompts(prompts.map(x => x.id === p.id ? updated : x));
    } catch (err) {
      setToast({ message: 'Failed to toggle', type: 'error' });
    }
  };

  if (loading) return (
    <div className="page-container">
      <div className="page-header"><div className="skeleton-line w-40 h-7" /><div className="skeleton-line-xs mt-2" /></div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line w-1/3 h-5 mb-2" /><div className="skeleton-line-xs" /><div className="skeleton-line w-3/4 h-4 mt-2" /></div></div>
        ))}
      </div>
    </div>
  );

  // Group by platform
  const grouped = {};
  prompts.forEach(p => {
    if (!grouped[p.platform]) grouped[p.platform] = [];
    grouped[p.platform].push(p);
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Prompts</h1>
        <p className="page-subtitle">Custom AI instructions per platform</p>
      </div>
      <div className="flex items-center justify-end mb-6">
        <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + New Prompt
        </button>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
        <strong>How it works:</strong> The AI uses your <span className="font-mono bg-blue-100 px-1 rounded">Master Prompt</span> for all platforms.
        If you add a platform-specific prompt (e.g., Upwork), it will be appended as additional instructions when generating proposals for that platform.
        Only <strong>active</strong> prompts are used.
      </div>

      {/* Editor */}
      {editing !== null && (
        <div className="card card-body mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing === 'new' ? 'New Prompt' : 'Edit Prompt'}</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block label">Prompt Name</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full input" placeholder="e.g., Upwork Technical Proposal" />
              </div>
              <div>
                <label className="block label">Platform</label>
                <select value={form.platform} onChange={e => setForm({...form, platform: e.target.value})}
                  className="w-full input">
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block label">Prompt Instructions</label>
              <textarea value={form.prompt_text} onChange={e => setForm({...form, prompt_text: e.target.value})}
                rows={12} className="w-full input font-mono"
                placeholder="Write the instructions that tell the AI how to write proposals for this platform..." />
              <p className="text-xs text-gray-400 mt-1">These instructions are appended to the system prompt when generating proposals. Be specific about tone, length, format, and style.</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})}
                className="rounded border-gray-300" />
              <label className="text-sm text-gray-700">Active (used when generating proposals)</label>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Prompt'}
              </button>
              <button onClick={() => setEditing(null)} className="text-gray-500 text-sm hover:text-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Prompts grouped by platform */}
      {Object.entries(grouped).length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No prompts yet</p>
          <p className="text-sm">The default prompts will be created when you restart the backend.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([platform, platformPrompts]) => (
            <div key={platform}>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                {PLATFORMS.find(p => p.value === platform)?.label || platform}
              </h3>
              <div className="space-y-2">
                {platformPrompts.map(p => (
                  <div key={p.id} className={`card p-4 border-l-4 ${p.is_active ? 'border-green-500' : 'border-gray-300'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{p.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[p.platform] || PLATFORM_COLORS.all}`}>
                            {p.platform}
                          </span>
                          {p.is_default && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Default</span>}
                          {!p.is_active && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>}
                        </div>
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3 font-mono">{p.prompt_text}</pre>
                      </div>
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        <button onClick={() => toggleActive(p)} className="text-xs text-gray-500 hover:text-gray-700">
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        {!p.is_default && (
                          <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
