'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

export default function ProfilePage() {
  const [form, setForm] = useState({
    full_name: '', title: '', summary: '', skills: '',
    experience: '', portfolio: '', default_hourly_rate: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [detectedProjects, setDetectedProjects] = useState([]);
  const [savingProjects, setSavingProjects] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/profile').then((data) => {
      setForm({
        full_name: data.full_name || '',
        title: data.title || '',
        summary: data.summary || '',
        skills: Array.isArray(data.skills) ? data.skills.join(', ') : '',
        experience: data.experience || '',
        portfolio: data.portfolio || '',
        default_hourly_rate: data.default_hourly_rate || 50,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/profile', {
        ...form,
        skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
        default_hourly_rate: parseFloat(form.default_hourly_rate) || 50,
      });
      setToast({ message: 'Profile saved successfully', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to save profile', type: 'error' });
    }
    setSaving(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.pdf') && !ext.endsWith('.docx') && !ext.endsWith('.doc') && !ext.endsWith('.txt')) {
      setToast({ message: 'Please upload a PDF, DOCX, or TXT file', type: 'error' });
      return;
    }

    setParsing(true);
    setToast({ message: 'Parsing your resume with AI...', type: 'success' });

    try {
      // Get LLM settings from the extension's storage endpoint
      // Since dashboard can't access chrome.storage, we'll use localStorage or prompt
      let provider = localStorage.getItem('llm_provider') || 'anthropic';
      let apiKey = localStorage.getItem('llm_api_key') || '';

      // If no key stored, prompt the user
      if (!apiKey) {
        apiKey = prompt('Enter your LLM API key (Anthropic or OpenAI) to parse the resume:');
        if (!apiKey) {
          setParsing(false);
          return;
        }
        const providerChoice = prompt('Which provider? Type "anthropic" or "openai":', 'anthropic');
        provider = providerChoice === 'openai' ? 'openai' : 'anthropic';
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_api_key', apiKey);
      }

      const formData = new FormData();
      formData.append('resume', file);
      formData.append('provider', provider);
      formData.append('apiKey', apiKey);
      formData.append('autoSave', 'true');

      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      const p = data.profile;

      setForm({
        full_name: p.full_name || form.full_name,
        title: p.title || form.title,
        summary: p.summary || form.summary,
        skills: Array.isArray(p.skills) ? p.skills.join(', ') : form.skills,
        experience: p.experience || form.experience,
        portfolio: p.portfolio || form.portfolio,
        default_hourly_rate: p.default_hourly_rate || form.default_hourly_rate,
      });

      // Show detected projects
      if (data.projects && data.projects.length > 0) {
        setDetectedProjects(data.projects);
        setToast({ message: `Profile updated! Found ${data.projects.length} projects — review below.`, type: 'success' });
      } else {
        setToast({ message: 'Resume parsed and profile updated!', type: 'success' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Failed to parse resume', type: 'error' });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) {
    return <div className="animate-pulse text-gray-400">Loading profile...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>

      {/* Resume Upload Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5 mb-6 max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Import from Resume</h3>
            <p className="text-xs text-gray-600 mb-3">
              Upload your CV/resume (PDF, DOCX, or TXT) and AI will automatically extract your profile information.
            </p>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileUpload}
                disabled={parsing}
                className="text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer disabled:opacity-50"
              />
              {parsing && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Parsing with AI...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-white rounded-lg shadow-sm p-6 max-w-3xl">
        <div className="space-y-5">
          <Field label="Full Name" name="full_name" value={form.full_name} onChange={handleChange} />
          <Field label="Professional Title" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Full-Stack Developer" />
          <Field label="Summary / Bio" name="summary" value={form.summary} onChange={handleChange} textarea rows={4} placeholder="Brief description of your expertise..." />
          <Field label="Skills (comma-separated)" name="skills" value={form.skills} onChange={handleChange} placeholder="React, Node.js, PHP, Python" />
          <Field label="Experience" name="experience" value={form.experience} onChange={handleChange} textarea rows={6} placeholder="Describe your relevant experience..." />
          <Field label="Portfolio Highlights" name="portfolio" value={form.portfolio} onChange={handleChange} textarea rows={4} placeholder="Links or descriptions of past work..." />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Hourly Rate</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                name="default_hourly_rate"
                value={form.default_hourly_rate}
                onChange={handleChange}
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-gray-500 text-sm">/hr</span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Detected Projects from Resume */}
      {detectedProjects.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mt-6 max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Projects Found in Resume</h2>
              <p className="text-sm text-gray-600">We detected {detectedProjects.length} projects. Select the ones you want to add to your portfolio.</p>
            </div>
            <button
              onClick={async () => {
                const selected = detectedProjects.filter((_, i) => {
                  const cb = document.getElementById(`proj-check-${i}`);
                  return cb && cb.checked;
                });
                if (selected.length === 0) { setToast({ message: 'No projects selected', type: 'error' }); return; }
                setSavingProjects(true);
                try {
                  let saved = 0;
                  for (const p of selected) {
                    await api.post('/projects', {
                      name: p.name,
                      description: p.description,
                      technologies: p.technologies || [],
                      category: p.category || 'Other',
                      client_name: p.client_name || '',
                      outcome: p.outcome || '',
                      url: p.url || '',
                    });
                    saved++;
                  }
                  setToast({ message: `${saved} projects added to your portfolio!`, type: 'success' });
                  setDetectedProjects([]);
                } catch (err) {
                  setToast({ message: 'Failed to save projects', type: 'error' });
                }
                setSavingProjects(false);
              }}
              disabled={savingProjects}
              className="bg-amber-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
            >
              {savingProjects ? 'Saving...' : 'Add Selected'}
            </button>
          </div>

          <div className="space-y-3">
            {detectedProjects.map((p, i) => (
              <label key={i} className="flex items-start gap-3 bg-white rounded-md p-3 border border-amber-100 cursor-pointer hover:border-amber-300">
                <input type="checkbox" id={`proj-check-${i}`} defaultChecked className="mt-1 rounded border-gray-300" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                  {p.description && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{p.description}</div>}
                  {p.technologies && p.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.technologies.map(t => (
                        <span key={t} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
                    {p.category}{p.client_name ? ` • ${p.client_name}` : ''}{p.outcome ? ` • ${p.outcome}` : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={() => setDetectedProjects([])}
            className="text-sm text-gray-500 mt-3 hover:text-gray-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Field({ label, name, value, onChange, textarea, rows, placeholder }) {
  const cls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {textarea ? (
        <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder} className={cls} />
      ) : (
        <input type="text" name={name} value={value} onChange={onChange} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
