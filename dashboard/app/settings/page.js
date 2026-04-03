'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

export default function SettingsPage() {
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState('');
  const [thresholds, setThresholds] = useState({ minSpent: 1000, minHireRate: 30, minReviews: 3 });
  const [filters, setFilters] = useState({
    budgetMin: '', budgetMax: '',
    skillsInclude: '', keywordsInclude: '', keywordsExclude: '',
    notificationEnabled: false, notificationInterval: 5,
  });
  const [llm, setLlm] = useState({ provider: 'anthropic', apiKey: '', apiKeySet: false, apiKeyMasked: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/settings').then((data) => {
      setLocations(data.locations || []);
      setThresholds({
        minSpent: data.min_spent || 1000,
        minHireRate: data.min_hire_rate || 30,
        minReviews: data.min_reviews || 3,
      });
      setFilters({
        budgetMin: data.budget_min || '',
        budgetMax: data.budget_max || '',
        skillsInclude: Array.isArray(data.skills_include) ? data.skills_include.join(', ') : '',
        keywordsInclude: Array.isArray(data.keywords_include) ? data.keywords_include.join(', ') : '',
        keywordsExclude: Array.isArray(data.keywords_exclude) ? data.keywords_exclude.join(', ') : '',
        notificationEnabled: data.notification_enabled || false,
        notificationInterval: data.notification_interval || 5,
      });
      setLlm({
        provider: data.llm_provider || 'anthropic',
        apiKey: '',
        apiKeySet: data.llm_api_key_set || false,
        apiKeyMasked: data.llm_api_key_masked || '',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addLocation = () => {
    const loc = newLocation.trim();
    if (loc && !locations.includes(loc)) {
      setLocations([...locations, loc]);
      setNewLocation('');
    }
  };

  const removeLocation = (loc) => {
    setLocations(locations.filter(l => l !== loc));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        locations,
        min_spent: thresholds.minSpent,
        min_hire_rate: thresholds.minHireRate,
        min_reviews: thresholds.minReviews,
        budget_min: filters.budgetMin ? parseFloat(filters.budgetMin) : null,
        budget_max: filters.budgetMax ? parseFloat(filters.budgetMax) : null,
        skills_include: filters.skillsInclude ? filters.skillsInclude.split(',').map(s => s.trim()).filter(Boolean) : [],
        keywords_include: filters.keywordsInclude ? filters.keywordsInclude.split(',').map(s => s.trim()).filter(Boolean) : [],
        keywords_exclude: filters.keywordsExclude ? filters.keywordsExclude.split(',').map(s => s.trim()).filter(Boolean) : [],
        notification_enabled: filters.notificationEnabled,
        notification_interval: filters.notificationInterval,
        llm_provider: llm.provider,
      };
      // Only send API key if user entered a new one
      if (llm.apiKey) {
        payload.llm_api_key = llm.apiKey;
      }
      const data = await api.put('/settings', payload);
      setLlm(prev => ({
        ...prev,
        apiKey: '',
        apiKeySet: data.llm_api_key_set || false,
        apiKeyMasked: data.llm_api_key_masked || '',
      }));
      setToast({ message: 'Settings saved successfully', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to save settings', type: 'error' });
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="page-container">
      <div className="page-header"><div className="skeleton-line w-40 h-7" /><div className="skeleton-line-xs mt-2" /></div>
      <div className="space-y-4 max-w-3xl">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line w-1/3 h-5 mb-3" /><div className="skeleton-line-xs" /><div className="skeleton-line w-3/4 h-4 mt-2" /></div></div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure vetting thresholds, filters, and AI settings</p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Target Locations */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Target Client Locations</h2>
          <p className="text-sm text-gray-500 mb-4">Clients outside these locations will trigger a warning in the extension.</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {locations.map(loc => (
              <span key={loc} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                {loc}
                <button onClick={() => removeLocation(loc)} className="text-blue-400 hover:text-blue-600 ml-1">&times;</button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()} placeholder="Add country..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <button onClick={addLocation} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Add</button>
          </div>
        </div>

        {/* Vetting Thresholds */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Vetting Thresholds</h2>
          <p className="text-sm text-gray-500 mb-4">Clients below these thresholds will be flagged in the extension.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Spending ($)</label>
              <input type="number" value={thresholds.minSpent}
                onChange={(e) => setThresholds({ ...thresholds, minSpent: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Hire Rate (%)</label>
              <input type="number" value={thresholds.minHireRate}
                onChange={(e) => setThresholds({ ...thresholds, minHireRate: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Reviews</label>
              <input type="number" value={thresholds.minReviews}
                onChange={(e) => setThresholds({ ...thresholds, minReviews: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Job Feed Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Job Feed Filters</h2>
          <p className="text-sm text-gray-500 mb-4">Configure filters for the Upwork job feed. Matching jobs trigger notifications.</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Budget ($)</label>
                <input type="number" value={filters.budgetMin} placeholder="Any"
                  onChange={(e) => setFilters({ ...filters, budgetMin: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Budget ($)</label>
                <input type="number" value={filters.budgetMax} placeholder="Any"
                  onChange={(e) => setFilters({ ...filters, budgetMax: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required Skills (comma-separated)</label>
              <input type="text" value={filters.skillsInclude} placeholder="React, Node.js, Python"
                onChange={(e) => setFilters({ ...filters, skillsInclude: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keywords Include (comma-separated)</label>
              <input type="text" value={filters.keywordsInclude} placeholder="frontend, API, dashboard"
                onChange={(e) => setFilters({ ...filters, keywordsInclude: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Keywords Exclude (comma-separated)</label>
              <input type="text" value={filters.keywordsExclude} placeholder="wordpress, shopify"
                onChange={(e) => setFilters({ ...filters, keywordsExclude: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={filters.notificationEnabled}
                  onChange={(e) => setFilters({ ...filters, notificationEnabled: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Enable browser notifications</span>
              </label>

              {filters.notificationEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Check every</span>
                  <select value={filters.notificationInterval}
                    onChange={(e) => setFilters({ ...filters, notificationInterval: parseInt(e.target.value) })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm">
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LLM Configuration */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">LLM Configuration</h2>
          <p className="text-sm text-gray-500 mb-4">Configure your AI provider and API key. The key is stored encrypted on the server.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select value={llm.provider}
                onChange={(e) => setLlm({ ...llm, provider: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <div className="relative">
                <input type="password" value={llm.apiKey}
                  onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                  placeholder={llm.apiKeySet ? `Current key: ${llm.apiKeyMasked}` : 'Enter your API key'}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm pr-20" />
                {llm.apiKeySet && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium">
                    Key set
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {llm.provider === 'anthropic'
                  ? 'Get your key at console.anthropic.com'
                  : 'Get your key at platform.openai.com'}
                . Leave blank to keep the existing key.
              </p>
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
