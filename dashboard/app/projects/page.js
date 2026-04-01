'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

const EMPTY_PROJECT = {
  name: '', description: '', url: '', technologies: '',
  category: '', client_name: '', budget_range: '', duration: '', outcome: '', is_featured: false,
};

const CATEGORIES = ['Web Development', 'Mobile App', 'E-commerce', 'UI/UX Design', 'API/Backend', 'WordPress/CMS', 'Data/Automation', 'Other'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null or project object
  const [form, setForm] = useState(EMPTY_PROJECT);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchProjects = useCallback(() => {
    api.get('/projects').then(data => {
      setProjects(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const openNew = () => {
    setForm(EMPTY_PROJECT);
    setEditing('new');
  };

  const openEdit = (p) => {
    setForm({
      name: p.name || '',
      description: p.description || '',
      url: p.url || '',
      technologies: Array.isArray(p.technologies) ? p.technologies.join(', ') : '',
      category: p.category || '',
      client_name: p.client_name || '',
      budget_range: p.budget_range || '',
      duration: p.duration || '',
      outcome: p.outcome || '',
      is_featured: p.is_featured || false,
    });
    setEditing(p);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setToast({ message: 'Project name is required', type: 'error' }); return; }
    setSaving(true);
    const payload = {
      ...form,
      technologies: form.technologies.split(',').map(s => s.trim()).filter(Boolean),
    };
    try {
      if (editing === 'new') {
        const created = await api.post('/projects', payload);
        setProjects([created, ...projects]);
      } else {
        const updated = await api.put(`/projects/${editing.id}`, payload);
        setProjects(projects.map(p => p.id === editing.id ? updated : p));
      }
      setEditing(null);
      setToast({ message: 'Project saved', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to save', type: 'error' });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this project?')) return;
    try {
      await api.del(`/projects/${id}`);
      setProjects(projects.filter(p => p.id !== id));
      setToast({ message: 'Project deleted', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to delete', type: 'error' });
    }
  };

  if (loading) return <div className="animate-pulse text-gray-400">Loading projects...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + Add Project
        </button>
      </div>

      {/* Editor */}
      {editing !== null && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
          <h2 className="text-lg font-semibold mb-4">{editing === 'new' ? 'New Project' : 'Edit Project'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="E-commerce Platform Rebuild" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Describe what you built, the challenges, and the results..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technologies (comma-separated)</label>
              <input value={form.technologies} onChange={e => setForm({...form, technologies: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="React, Node.js, PostgreSQL" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project URL</label>
              <input value={form.url} onChange={e => setForm({...form, url: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="https://example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
              <input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Acme Corp" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Range</label>
              <input value={form.budget_range} onChange={e => setForm({...form, budget_range: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="$5,000 - $10,000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <input value={form.duration} onChange={e => setForm({...form, duration: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="3 months" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outcome/Results</label>
              <input value={form.outcome} onChange={e => setForm({...form, outcome: e.target.value})}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Increased conversions by 35%" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})}
                className="rounded border-gray-300" />
              <label className="text-sm text-gray-700">Featured project (shown first)</label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Project'}
            </button>
            <button onClick={() => setEditing(null)} className="text-gray-500 text-sm hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Project List */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Add your portfolio projects so the AI can reference them in proposals.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => (
            <div key={p.id} className={`bg-white rounded-lg shadow-sm p-5 ${p.is_featured ? 'ring-2 ring-blue-200' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  {p.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.category}</span>}
                  {p.is_featured && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">Featured</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
              {p.description && <p className="text-sm text-gray-600 mb-2 line-clamp-3">{p.description}</p>}
              {p.technologies && p.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {p.technologies.map(t => (
                    <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-400 space-y-0.5">
                {p.client_name && <div>Client: {p.client_name}</div>}
                {p.budget_range && <div>Budget: {p.budget_range}</div>}
                {p.outcome && <div>Result: {p.outcome}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
