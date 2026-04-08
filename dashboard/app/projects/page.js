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
  const [enhancing, setEnhancing] = useState({}); // { [projectId]: true } for per-project loading
  const [enhanced, setEnhanced] = useState({});   // { [projectId]: { outcome, description } }
  const [bulkEnhancing, setBulkEnhancing] = useState(false);
  const [bulkResults, setBulkResults] = useState(null); // array of results or null

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

      const data = await api.upload('/parse-projects', formData);
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

  const getLLMConfig = () => ({
    provider: localStorage.getItem('llm_provider') || 'anthropic',
    apiKey: localStorage.getItem('llm_api_key') || '',
  });

  const handleEnhance = async (id) => {
    setEnhancing(prev => ({ ...prev, [id]: true }));
    try {
      const data = await api.post(`/projects/${id}/enhance`, getLLMConfig());
      setEnhanced(prev => ({ ...prev, [id]: data }));
    } catch (err) {
      setToast({ message: err.message || 'Enhancement failed', type: 'error' });
    }
    setEnhancing(prev => ({ ...prev, [id]: false }));
  };

  const handleAcceptEnhance = async (id) => {
    const data = enhanced[id];
    if (!data) return;
    try {
      const updated = await api.put(`/projects/${id}`, { outcome: data.outcome, description: data.description });
      setProjects(projects.map(p => p.id === id ? updated : p));
      setEnhanced(prev => { const next = { ...prev }; delete next[id]; return next; });
      setToast({ message: 'Enhancement applied!', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to save enhancement', type: 'error' });
    }
  };

  const handleDiscardEnhance = (id) => {
    setEnhanced(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleBulkEnhance = async () => {
    setBulkEnhancing(true);
    setToast({ message: 'Enhancing all projects with AI...', type: 'success' });
    try {
      const data = await api.post('/projects/enhance-all', getLLMConfig());
      if (data.projects.length === 0) {
        setToast({ message: 'All projects already have strong outcomes!', type: 'success' });
      } else {
        setBulkResults(data.projects);
        setToast({ message: `Enhanced ${data.projects.length} projects — review below`, type: 'success' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Bulk enhancement failed', type: 'error' });
    }
    setBulkEnhancing(false);
  };

  const handleAcceptBulkItem = async (item) => {
    try {
      await api.put(`/projects/${item.id}`, { outcome: item.enhancedOutcome, description: item.enhancedDescription });
      setBulkResults(prev => prev.filter(r => r.id !== item.id));
      fetchProjects();
      setToast({ message: `Updated "${item.name}"`, type: 'success' });
    } catch (err) {
      setToast({ message: `Failed to update "${item.name}"`, type: 'error' });
    }
  };

  const handleDismissBulk = () => setBulkResults(null);

  if (loading) return (
    <div className="page-container">
      <div className="page-header"><div className="skeleton-line w-48 h-7" /><div className="skeleton-line-xs mt-2" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line-xs" /><div className="skeleton-line w-1/2 h-8 mt-2" /></div></div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle">Your portfolio projects for proposal references</p>
      </div>
      <div className="flex items-center justify-end mb-6">
        <button onClick={openNew} className="btn-primary">
          + Add Project
        </button>
        <button onClick={handleBulkEnhance} disabled={bulkEnhancing} className="btn-secondary ml-2">
          {bulkEnhancing ? 'Enhancing...' : 'Enhance All Projects'}
        </button>
      </div>

      {/* Bulk Import Card */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
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
                className="text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 file:cursor-pointer disabled:opacity-50"
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

      {/* Bulk Enhancement Review */}
      {bulkResults && bulkResults.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">AI-Enhanced Projects — Review & Accept</h3>
            <button onClick={handleDismissBulk} className="text-xs text-gray-500 hover:text-gray-700">Dismiss All</button>
          </div>
          <div className="space-y-3">
            {bulkResults.map(item => (
              <div key={item.id} className="bg-white rounded-lg p-4 border border-amber-100">
                <h4 className="font-medium text-sm text-gray-900 mb-2">{item.name}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <span className="text-gray-400 block mb-1">Current outcome:</span>
                    <span className="text-gray-600">{item.currentOutcome || 'None'}</span>
                  </div>
                  <div>
                    <span className="text-green-600 block mb-1">Enhanced outcome:</span>
                    <span className="text-gray-900 font-medium">{item.enhancedOutcome}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAcceptBulkItem(item)} className="btn-primary text-xs px-3 py-1">Accept</button>
                  <button onClick={() => setBulkResults(prev => prev.filter(r => r.id !== item.id))} className="btn-secondary text-xs px-3 py-1">Skip</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      {editing !== null && (
        <div className="card card-body mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing === 'new' ? 'New Project' : 'Edit Project'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block label">Project Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full input" placeholder="E-commerce Platform Rebuild" />
            </div>
            <div>
              <label className="block label">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full input">
                <option value="">Select category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block label">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                rows={4} className="w-full input"
                placeholder="Describe what you built, the challenges, and the results..." />
            </div>
            <div>
              <label className="block label">Technologies (comma-separated)</label>
              <input value={form.technologies} onChange={e => setForm({...form, technologies: e.target.value})}
                className="w-full input" placeholder="React, Node.js, PostgreSQL" />
            </div>
            <div>
              <label className="block label">Project URL</label>
              <input value={form.url} onChange={e => setForm({...form, url: e.target.value})}
                className="w-full input" placeholder="https://example.com" />
            </div>
            <div>
              <label className="block label">Client Name</label>
              <input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})}
                className="w-full input" placeholder="Acme Corp" />
            </div>
            <div>
              <label className="block label">Budget Range</label>
              <input value={form.budget_range} onChange={e => setForm({...form, budget_range: e.target.value})}
                className="w-full input" placeholder="$5,000 - $10,000" />
            </div>
            <div>
              <label className="block label">Duration</label>
              <input value={form.duration} onChange={e => setForm({...form, duration: e.target.value})}
                className="w-full input" placeholder="3 months" />
            </div>
            <div>
              <label className="block label">Outcome/Results</label>
              <input value={form.outcome} onChange={e => setForm({...form, outcome: e.target.value})}
                className="w-full input" placeholder="Increased conversions by 35%" />
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
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-2">
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
                  className="flex-1 input"
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
                }} className="btn-secondary text-sm">Add</button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Paste image URLs from Google Drive, Imgur, or any hosting. Up to 10 links. Press Enter to add.</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Project'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Project List */}
      {projects.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Add your portfolio projects so the AI can reference them in proposals.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id} className={`card p-5 ${p.is_featured ? 'ring-2 ring-blue-400/30 shadow-md' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  {p.category && <span className="badge-purple">{p.category}</span>}
                  {p.is_featured && <span className="badge-blue ml-1">Featured</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)} className="btn-secondary text-xs px-2 py-1">Edit</button>
                  <button onClick={() => handleEnhance(p.id)} disabled={enhancing[p.id]} className="btn-secondary text-xs px-2 py-1">
                    {enhancing[p.id] ? '...' : 'Enhance'}
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="btn-danger text-xs px-2 py-1">Delete</button>
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
                    <span key={t} className="badge-blue">{t}</span>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-400 space-y-0.5">
                {p.client_name && <div>Client: {p.client_name}</div>}
                {p.budget_range && <div>Budget: {p.budget_range}</div>}
                {p.outcome && <div>Result: {p.outcome}</div>}
              </div>
              {enhanced[p.id] && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs mb-2">
                    <span className="text-green-600 font-medium block mb-1">Enhanced outcome:</span>
                    <span className="text-gray-900">{enhanced[p.id].outcome}</span>
                  </div>
                  <div className="text-xs mb-2">
                    <span className="text-green-600 font-medium block mb-1">Enhanced description:</span>
                    <span className="text-gray-900">{enhanced[p.id].description}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAcceptEnhance(p.id)} className="btn-primary text-xs px-3 py-1">Accept</button>
                    <button onClick={() => handleDiscardEnhance(p.id)} className="btn-secondary text-xs px-3 py-1">Discard</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
