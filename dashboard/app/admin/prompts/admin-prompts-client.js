'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import Toast from '../../../components/Toast';

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
  all: 'bg-gray-100 text-gray-800 ring-1 ring-gray-200/50',
  upwork: 'bg-green-100 text-green-800 ring-1 ring-green-200/50',
  fiverr: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/50',
  peopleperhour: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200/50',
  linkedin: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200/50',
  freelancer: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200/50',
  toptal: 'bg-purple-100 text-purple-800 ring-1 ring-purple-200/50',
};

const PLACEHOLDERS = [
  '{profile.full_name}',
  '{profile.title}',
  '{profile.skills}',
  '{profile.summary}',
  '{profile.experience}',
  '{profile.portfolio}',
  '{profile.default_hourly_rate}',
];

export default function AdminPromptsClient({ initialPrompts }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState(initialPrompts);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', platform: 'all', prompt_text: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const openNew = () => {
    setForm({ name: '', platform: 'all', prompt_text: '', is_active: true });
    setEditing('new');
  };

  const openEdit = (p) => {
    setForm({ name: p.name, platform: p.platform, prompt_text: p.prompt_text, is_active: p.is_active });
    setEditing(p);
  };

  const cancelEdit = () => setEditing(null);

  const handleSave = async () => {
    if (!form.name || !form.prompt_text) {
      setToast({ message: 'Name and prompt text are required', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await api.post('/admin/prompts', { ...form, type: 'system' });
        setPrompts([created, ...prompts]);
      } else {
        const updated = await api.put(`/admin/prompts/${editing.id}`, form);
        setPrompts(prompts.map(p => p.id === editing.id ? updated : p));
      }
      setEditing(null);
      setToast({ message: 'Prompt saved', type: 'success' });
      router.refresh();
    } catch {
      setToast({ message: 'Failed to save prompt', type: 'error' });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this global prompt?')) return;
    try {
      await api.del(`/admin/prompts/${id}`);
      setPrompts(prompts.filter(p => p.id !== id));
      setToast({ message: 'Prompt deleted', type: 'success' });
      router.refresh();
    } catch (err) {
      setToast({ message: err.message || 'Failed to delete', type: 'error' });
    }
  };

  const toggleActive = async (p) => {
    try {
      const updated = await api.put(`/admin/prompts/${p.id}`, { is_active: !p.is_active });
      setPrompts(prompts.map(x => x.id === p.id ? updated : x));
      router.refresh();
    } catch {
      setToast({ message: 'Failed to toggle', type: 'error' });
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Master Prompts</h1>
        <p className="page-subtitle">Global system prompts used as defaults for all users</p>
      </div>

      {/* Info card */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4 text-sm text-purple-800">
        <strong>Admin only:</strong> These prompts control the base behavior of proposal generation. Users can override with their own system prompts, but these serve as the global default for everyone.
      </div>

      {/* Available placeholders */}
      <div className="card card-body mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Available Placeholders</p>
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS.map(ph => (
            <span key={ph} className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md border border-gray-200">
              {ph}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">These are automatically replaced with the user's profile data at generation time.</p>
      </div>

      <div className="flex items-center justify-end mb-6">
        <button onClick={openNew} className="btn-primary">+ New Global Prompt</button>
      </div>

      {/* Editor */}
      {editing !== null && (
        <div className="card card-body mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing === 'new' ? 'New Global Prompt' : 'Edit Global Prompt'}</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block label">Prompt Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full input"
                  placeholder="e.g., Default System Prompt"
                />
              </div>
              <div>
                <label className="block label">Platform</label>
                <select
                  value={form.platform}
                  onChange={e => setForm({ ...form, platform: e.target.value })}
                  className="w-full input"
                >
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block label">Prompt Text</label>
              <textarea
                value={form.prompt_text}
                onChange={e => setForm({ ...form, prompt_text: e.target.value })}
                rows={14}
                className="w-full input font-mono"
                placeholder="Write the global system prompt. Use placeholders like {profile.full_name} to personalise per user."
              />
              <p className="text-xs text-gray-400 mt-1">Use placeholders from the panel above. This prompt is the base for all users unless overridden.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="admin-prompt-active"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="admin-prompt-active" className="text-sm text-gray-700">Active</label>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Prompt'}
              </button>
              <button onClick={cancelEdit} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt list */}
      {prompts.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No global prompts yet</p>
          <p className="text-sm">Create a master prompt to set the default behaviour for all users.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map(p => (
            <div key={p.id} className={`card p-4 border-l-4 ${p.is_active ? 'border-purple-500' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[p.platform] || PLATFORM_COLORS.all}`}>
                      {p.platform}
                    </span>
                    {!p.is_active && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3 font-mono">{p.prompt_text}</pre>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(p)} className="btn-secondary text-xs px-2 py-1">
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => openEdit(p)} className="btn-secondary text-xs px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="btn-danger text-xs px-2 py-1">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
