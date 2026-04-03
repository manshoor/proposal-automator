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
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
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
    return (
      <div className="page-container">
        <div className="page-header"><div className="skeleton-line w-40 h-7" /><div className="skeleton-line-xs mt-2" /></div>
        <div className="space-y-4 max-w-3xl">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line w-1/4 h-4 mb-2" /><div className="skeleton-line h-9" /></div></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Your Upwork profile data used for proposal generation</p>
      </div>

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

      {/* Hook Generator */}
      <HookGenerator profileTitle={form.title} onApply={(hook) => {
        const current = form.summary || '';
        setForm({...form, summary: hook + (current ? '\n\n' + current : '')});
        setToast({ message: 'Hook applied as the opening of your summary!', type: 'success' });
      }} />

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

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            <button
              onClick={async () => {
                if (!form.summary || form.summary.trim().length < 10) {
                  setToast({ message: 'Add a Summary/Bio first before analyzing', type: 'error' });
                  return;
                }
                setAnalyzing(true);
                setAnalysis(null);
                try {
                  let provider = localStorage.getItem('llm_provider') || 'anthropic';
                  let apiKey = localStorage.getItem('llm_api_key') || '';
                  if (!apiKey) {
                    apiKey = prompt('Enter your LLM API key to analyze profile:');
                    if (!apiKey) { setAnalyzing(false); return; }
                    const choice = prompt('Provider? "anthropic" or "openai":', 'anthropic');
                    provider = choice === 'openai' ? 'openai' : 'anthropic';
                    localStorage.setItem('llm_provider', provider);
                    localStorage.setItem('llm_api_key', apiKey);
                  }
                  const res = await fetch('/api/analyze-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, apiKey, profileDescription: form.summary }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
                    throw new Error(err.error);
                  }
                  const data = await res.json();
                  setAnalysis(data);
                  setToast({ message: `Profile scored ${data.score}/100`, type: data.score >= 70 ? 'success' : 'error' });
                } catch (err) {
                  setToast({ message: err.message || 'Analysis failed', type: 'error' });
                }
                setAnalyzing(false);
              }}
              disabled={analyzing}
              className="bg-purple-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {analyzing ? 'Analyzing...' : 'Analyze Profile'}
            </button>
          </div>
        </div>
      </div>

      {/* Profile Analysis Results */}
      {analysis && (
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6 max-w-3xl border-l-4 border-purple-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Profile Analysis</h2>
            <span className={`text-3xl font-bold px-3 py-1 rounded-lg ${
              analysis.score >= 80 ? 'bg-green-100 text-green-700' :
              analysis.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>{analysis.score}</span>
          </div>

          {/* Headline */}
          {analysis.headline && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-gray-500 uppercase">Headline</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                  analysis.headline.score >= 80 ? 'bg-green-100 text-green-700' :
                  analysis.headline.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>{analysis.headline.score}</span>
              </div>
              <p className="text-sm text-gray-600">{analysis.headline.feedback}</p>
              {analysis.headline.suggestion && (
                <div className="mt-2 p-2 bg-green-50 rounded text-sm text-green-800 border-l-3 border-green-500">
                  <strong>Suggested:</strong> {analysis.headline.suggestion}
                  <button onClick={() => {
                    setForm(prev => ({...prev, title: analysis.headline.suggestion}));
                    setToast({ message: 'Headline applied to Professional Title field!', type: 'success' });
                    setTimeout(() => document.querySelector('input[name="title"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                  }}
                    className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700">Apply</button>
                </div>
              )}
            </div>
          )}

          {/* First Impression */}
          {analysis.first_impression && (
            <div className="mb-4 p-3 bg-amber-50 rounded-lg border-l-3 border-amber-500">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-gray-500 uppercase">First Impression (search preview)</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                  analysis.first_impression.score >= 80 ? 'bg-green-100 text-green-700' :
                  analysis.first_impression.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>{analysis.first_impression.score}</span>
              </div>
              <p className="text-sm text-gray-600">{analysis.first_impression.feedback}</p>
            </div>
          )}

          {/* Overview Strengths & Weaknesses */}
          {analysis.overview && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-50 rounded-lg">
                <span className="text-xs font-bold text-green-700 uppercase">Strengths</span>
                <ul className="text-sm text-green-800 mt-1 list-disc pl-4">
                  {(analysis.overview.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <span className="text-xs font-bold text-red-700 uppercase">Weaknesses</span>
                <ul className="text-sm text-red-800 mt-1 list-disc pl-4">
                  {(analysis.overview.weaknesses || []).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* SEO Keywords */}
          {analysis.seo && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase">SEO / Search Visibility</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                  analysis.seo.score >= 80 ? 'bg-green-100 text-green-700' :
                  analysis.seo.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>{analysis.seo.score}</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{analysis.seo.feedback}</p>
              <div className="flex flex-wrap gap-1">
                {(analysis.seo.keywords_found || []).map(k => (
                  <span key={k} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{k}</span>
                ))}
                {(analysis.seo.keywords_missing || []).map(k => (
                  <span key={k} onClick={() => {
                    setForm(prev => {
                      const current = prev.skills.split(',').map(s => s.trim()).filter(Boolean);
                      if (current.some(s => s.toLowerCase() === k.toLowerCase())) return prev;
                      return { ...prev, skills: [...current, k].join(', ') };
                    });
                    setToast({ message: `Added "${k}" to skills`, type: 'success' });
                  }} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-200 transition-colors">+ {k}</span>
                ))}
              </div>
            </div>
          )}

          {/* Improvements */}
          {analysis.improvements && analysis.improvements.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <span className="text-xs font-bold text-blue-700 uppercase">Top Improvements</span>
              <ol className="text-sm text-blue-800 mt-1 list-decimal pl-4 space-y-1">
                {analysis.improvements.map((imp, i) => <li key={i}>{imp}</li>)}
              </ol>
            </div>
          )}

          {/* Rewritten Profile */}
          {analysis.rewrite && (
            <div className="p-3 bg-purple-50 rounded-lg border-l-3 border-purple-500">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-purple-700 uppercase">AI-Rewritten Profile</span>
                <button onClick={() => {
                  setForm(prev => ({...prev, summary: analysis.rewrite}));
                  setToast({ message: 'Rewritten profile applied to Summary field!', type: 'success' });
                  setTimeout(() => document.querySelector('textarea[name="summary"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }}
                  className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">
                  Apply Rewrite
                </button>
              </div>
              <p className="text-sm text-purple-900 whitespace-pre-wrap">{analysis.rewrite}</p>
            </div>
          )}

          {/* Improved Skills */}
          {analysis.improved_skills && analysis.improved_skills.length > 0 && (
            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border-l-3 border-indigo-500">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-indigo-700 uppercase">Improved Skills</span>
                <button onClick={() => {
                  setForm(prev => ({...prev, skills: analysis.improved_skills.join(', ')}));
                  setToast({ message: 'Improved skills applied!', type: 'success' });
                  setTimeout(() => document.querySelector('input[name="skills"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }}
                  className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700">
                  Apply Skills
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {analysis.improved_skills.map(s => (
                  <span key={s} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Improved Experience */}
          {analysis.improved_experience && (
            <div className="mt-4 p-3 bg-teal-50 rounded-lg border-l-3 border-teal-500">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-teal-700 uppercase">Improved Experience</span>
                <button onClick={() => {
                  setForm(prev => ({...prev, experience: analysis.improved_experience}));
                  setToast({ message: 'Improved experience applied!', type: 'success' });
                  setTimeout(() => document.querySelector('textarea[name="experience"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }}
                  className="text-xs bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700">
                  Apply Experience
                </button>
              </div>
              <p className="text-sm text-teal-900 whitespace-pre-wrap">{analysis.improved_experience}</p>
            </div>
          )}

          {/* Improved Portfolio */}
          {analysis.improved_portfolio && (
            <div className="mt-4 p-3 bg-orange-50 rounded-lg border-l-3 border-orange-500">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-orange-700 uppercase">Improved Portfolio Highlights</span>
                <button onClick={() => {
                  setForm(prev => ({...prev, portfolio: analysis.improved_portfolio}));
                  setToast({ message: 'Improved portfolio applied!', type: 'success' });
                  setTimeout(() => document.querySelector('textarea[name="portfolio"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }}
                  className="text-xs bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700">
                  Apply Portfolio
                </button>
              </div>
              <p className="text-sm text-orange-900 whitespace-pre-wrap">{analysis.improved_portfolio}</p>
            </div>
          )}

          <button onClick={() => setAnalysis(null)} className="text-xs text-gray-400 mt-3 hover:text-gray-600">Dismiss</button>
        </div>
      )}

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

function HookGenerator({ profileTitle, onApply }) {
  const [hooks, setHooks] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [niche, setNiche] = useState('');

  const generate = async () => {
    const title = profileTitle || niche;
    if (!title) return;
    setGenerating(true);
    setHooks(null);
    try {
      let provider = localStorage.getItem('llm_provider') || 'anthropic';
      let apiKey = localStorage.getItem('llm_api_key') || '';
      if (!apiKey) {
        apiKey = prompt('Enter your LLM API key:');
        if (!apiKey) { setGenerating(false); return; }
        const choice = prompt('Provider? "anthropic" or "openai":', 'anthropic');
        provider = choice === 'openai' ? 'openai' : 'anthropic';
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_api_key', apiKey);
      }
      const res = await fetch('/api/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, profileTitle: title, niche: niche || title }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      setHooks(await res.json());
    } catch (err) {
      alert(err.message);
    }
    setGenerating(false);
  };

  const styleIcons = { 'metric-driven': '📊', 'question-based': '❓', 'bold-claim': '🎯' };
  const styleColors = {
    'metric-driven': 'bg-blue-50 border-blue-200',
    'question-based': 'bg-amber-50 border-amber-200',
    'bold-claim': 'bg-purple-50 border-purple-200',
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-5 mb-6 max-w-3xl">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-lg">🪝</div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Profile Hook Generator</h3>
          <p className="text-xs text-gray-600 mb-3">
            Generate catchy opening hooks with quantifiable benefits. The first 1-2 sentences determine if clients click your profile.
          </p>
          <div className="flex gap-2 mb-3">
            <input type="text" value={niche} onChange={e => setNiche(e.target.value)}
              placeholder={profileTitle || 'Enter your niche or title...'}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              onKeyDown={e => e.key === 'Enter' && generate()} />
            <button onClick={generate} disabled={generating}
              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap">
              {generating ? 'Generating...' : 'Generate Hooks'}
            </button>
          </div>

          {hooks && hooks.hooks && (
            <div className="space-y-2">
              {hooks.hooks.map((h, i) => (
                <div key={i} className={`rounded-lg border p-3 ${styleColors[h.style] || 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{styleIcons[h.style] || '✨'}</span>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">{(h.style || '').replace('-', ' ')}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 leading-relaxed">&ldquo;{h.text}&rdquo;</p>
                      <p className="text-[11px] text-gray-500 mt-1 italic">{h.why_it_works}</p>
                    </div>
                    <button onClick={() => onApply(h.text)}
                      className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 flex-shrink-0">
                      Use This
                    </button>
                  </div>
                </div>
              ))}

              {hooks.tips && hooks.tips.length > 0 && (
                <div className="text-[11px] text-gray-500 mt-2 p-2 bg-white/50 rounded">
                  <strong>Tips:</strong> {hooks.tips.join(' • ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
