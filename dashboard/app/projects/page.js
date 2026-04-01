'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

const EMPTY_PROJECT = {
  name: '', description: '', url: '', technologies: '',
  category: '', client_name: '', budget_range: '', duration: '', outcome: '', is_featured: false, screenshots: [],
};

const CATEGORIES = ['Web Development', 'Mobile App', 'E-commerce', 'UI/UX Design', 'API/Backend', 'WordPress/CMS', 'Data/Automation', 'Other'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null or project object
  const [form, setForm] = useState(EMPTY_PROJECT);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setToast({ message: 'Parsing projects with AI...', type: 'success' });

    try {
      let provider = localStorage.getItem('llm_provider') || 'anthropic';
      let apiKey = localStorage.getItem('llm_api_key') || '';

      if (!apiKey) {
        apiKey = prompt('Enter your LLM API key to parse projects:');
        if (!apiKey) { setImporting(false); return; }
        const choice = prompt('Provider? "anthropic" or "openai":', 'anthropic');
        provider = choice === 'openai' ? 'openai' : 'anthropic';
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_api_key', apiKey);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('provider', provider);
      formData.append('apiKey', apiKey);

      const res = await fetch('/api/parse-projects', { method: 'POST', body: formData });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      setToast({ message: `Imported ${data.inserted} projects from ${data.parsed} found!`, type: 'success' });
      fetchProjects();
    } catch (err) {
      setToast({ message: err.message || 'Failed to import projects', type: 'error' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
      screenshots: Array.isArray(p.screenshots) ? p.screenshots : [],
    });
    setEditing(p);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setToast({ message: 'Project name is required', type: 'error' }); return; }
    setSaving(true);
    const payload = {
      ...form,
      technologies: form.technologies.split(',').map(s => s.trim()).filter(Boolean),
      screenshots: form.screenshots || [],
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
        <div className="flex gap-2">
          <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            + Add Project
          </button>
        </div>
      </div>

      {/* Bulk Import Card */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Import Projects from File</h3>
            <p className="text-xs text-gray-600 mb-3">
              Upload a PDF, Word doc, or text file with your project portfolio. AI will extract each project and add them all to your list.
            </p>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.csv"
                onChange={handleFileImport}
                disabled={importing}
                className="text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 file:cursor-pointer disabled:opacity-50"
              />
              {importing && (
                <div className="flex items-center gap-2 text-sm text-indigo-600">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Extracting projects with AI...
                </div>
              )}
            </div>
          </div>
        </div>
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

            {/* Screenshot URLs */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Screenshot / Image URLs</label>

              {/* Existing URLs with previews */}
              {form.screenshots && form.screenshots.length > 0 && (
                <div className="space-y-2 mb-3">
                  {form.screenshots.map((src, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-md p-2">
                      <img src={src} alt="" className="w-12 h-12 object-cover rounded border border-gray-200"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                      <input type="text" value={src} readOnly
                        className="flex-1 text-xs text-gray-500 bg-transparent border-none truncate" />
                      <button onClick={() => setForm({...form, screenshots: form.screenshots.filter((_, j) => j !== i)})}
                        className="text-red-400 hover:text-red-600 text-sm flex-shrink-0">&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new URL */}
              <div className="flex gap-2">
                <input type="url" id="new-screenshot-url" placeholder="https://drive.google.com/... or any image URL"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const url = e.target.value.trim();
                      if (url && (form.screenshots || []).length < 10) {
                        setForm({...form, screenshots: [...(form.screenshots || []), url]});
                        e.target.value = '';
                      }
                    }
                  }} />
                <button type="button" onClick={() => {
                  const input = document.getElementById('new-screenshot-url');
                  const url = input.value.trim();
                  if (url && (form.screenshots || []).length < 10) {
                    setForm({...form, screenshots: [...(form.screenshots || []), url]});
                    input.value = '';
                  }
                }} className="bg-gray-100 text-gray-700 px-3 py-2 rounded-md text-sm hover:bg-gray-200">Add</button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Paste image URLs from Google Drive, Imgur, or any hosting. Up to 10 links. Press Enter to add.</p>
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
              {/* Screenshot thumbnails */}
              {p.screenshots && p.screenshots.length > 0 && (
                <div className="flex gap-2 mb-2 overflow-x-auto">
                  {p.screenshots.slice(0, 4).map((src, i) => (
                    <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded border border-gray-200 flex-shrink-0" />
                  ))}
                  {p.screenshots.length > 4 && (
                    <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                      +{p.screenshots.length - 4}
                    </div>
                  )}
                </div>
              )}
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
