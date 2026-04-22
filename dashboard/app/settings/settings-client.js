'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

export default function SettingsClient({ initialSettings }) {
  const [locations, setLocations] = useState(initialSettings.locations || []);
  const [newLocation, setNewLocation] = useState('');
  const [thresholds, setThresholds] = useState({
    minSpent: initialSettings.min_spent ?? 1000,
    minHireRate: initialSettings.min_hire_rate ?? 30,
    minReviews: initialSettings.min_reviews ?? 3,
  });
  const [filters, setFilters] = useState({
    budgetMin: initialSettings.budget_min ?? '',
    budgetMax: initialSettings.budget_max ?? '',
    skillsInclude: Array.isArray(initialSettings.skills_include) ? initialSettings.skills_include.join(', ') : '',
    keywordsInclude: Array.isArray(initialSettings.keywords_include) ? initialSettings.keywords_include.join(', ') : '',
    keywordsExclude: Array.isArray(initialSettings.keywords_exclude) ? initialSettings.keywords_exclude.join(', ') : '',
    notificationEnabled: initialSettings.notification_enabled ?? false,
    notificationInterval: initialSettings.notification_interval ?? 5,
  });
  const [llm, setLlm] = useState({
    provider: initialSettings.llm_provider || 'anthropic',
    apiKey: '',
    apiKeySet: initialSettings.llm_api_key_set || false,
    apiKeyMasked: initialSettings.llm_api_key_masked || '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure vetting thresholds, filters, and AI settings</p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Target Locations */}
        <div className="card card-body">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Target Client Locations</h2>
          <p className="text-sm text-gray-500 mb-4">Clients outside these locations will trigger a warning in the extension.</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {locations.map(loc => (
              <span key={loc} className="badge badge-blue ring-1 ring-blue-200/50 font-medium">
                {loc}
                <button
                  onClick={() => removeLocation(loc)}
                  className="ml-1.5 text-blue-400 hover:text-blue-700 hover:bg-blue-100 rounded-full w-4 h-4 inline-flex items-center justify-center text-xs leading-none transition-colors"
                  aria-label={`Remove ${loc}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()} placeholder="Add country..."
              className="flex-1 input" />
            <button onClick={addLocation} className="btn-primary">Add</button>
          </div>
        </div>

        {/* Vetting Thresholds */}
        <div className="card card-body">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Vetting Thresholds</h2>
          <p className="text-sm text-gray-500 mb-4">Clients below these thresholds will be flagged in the extension.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block label">Min Spending ($)</label>
              <input type="number" value={thresholds.minSpent}
                onChange={(e) => setThresholds({ ...thresholds, minSpent: parseInt(e.target.value) || 0 })}
                className="w-full input" />
            </div>
            <div>
              <label className="block label">Min Hire Rate (%)</label>
              <input type="number" value={thresholds.minHireRate}
                onChange={(e) => setThresholds({ ...thresholds, minHireRate: parseInt(e.target.value) || 0 })}
                className="w-full input" />
            </div>
            <div>
              <label className="block label">Min Reviews</label>
              <input type="number" value={thresholds.minReviews}
                onChange={(e) => setThresholds({ ...thresholds, minReviews: parseInt(e.target.value) || 0 })}
                className="w-full input" />
            </div>
          </div>
        </div>

        {/* Job Feed Filters */}
        <div className="card card-body">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Job Feed Filters</h2>
          <p className="text-sm text-gray-500 mb-4">Configure filters for the Upwork job feed. Matching jobs trigger notifications.</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block label">Min Budget ($)</label>
                <input type="number" value={filters.budgetMin} placeholder="Any"
                  onChange={(e) => setFilters({ ...filters, budgetMin: e.target.value })}
                  className="w-full input" />
              </div>
              <div>
                <label className="block label">Max Budget ($)</label>
                <input type="number" value={filters.budgetMax} placeholder="Any"
                  onChange={(e) => setFilters({ ...filters, budgetMax: e.target.value })}
                  className="w-full input" />
              </div>
            </div>

            <div>
              <label className="block label">Required Skills (comma-separated)</label>
              <input type="text" value={filters.skillsInclude} placeholder="React, Node.js, Python"
                onChange={(e) => setFilters({ ...filters, skillsInclude: e.target.value })}
                className="w-full input" />
            </div>

            <div>
              <label className="block label">Keywords Include (comma-separated)</label>
              <input type="text" value={filters.keywordsInclude} placeholder="frontend, API, dashboard"
                onChange={(e) => setFilters({ ...filters, keywordsInclude: e.target.value })}
                className="w-full input" />
            </div>

            <div>
              <label className="block label">Keywords Exclude (comma-separated)</label>
              <input type="text" value={filters.keywordsExclude} placeholder="wordpress, shopify"
                onChange={(e) => setFilters({ ...filters, keywordsExclude: e.target.value })}
                className="w-full input" />
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={filters.notificationEnabled}
                  onChange={(e) => setFilters({ ...filters, notificationEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-0 transition-colors" />
                <span className="text-sm font-medium text-gray-700">Enable browser notifications</span>
              </label>

              {filters.notificationEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Check every</span>
                  <select value={filters.notificationInterval}
                    onChange={(e) => setFilters({ ...filters, notificationInterval: parseInt(e.target.value) })}
                    className="input text-sm">
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
        <div className="card card-body">
          <h2 className="text-lg font-bold text-gray-900 mb-2">LLM Configuration</h2>
          <p className="text-sm text-gray-500 mb-4">Configure your AI provider and API key. The key is stored encrypted on the server.</p>

          <div className="space-y-4">
            <div>
              <label className="block label">Provider</label>
              <select value={llm.provider}
                onChange={(e) => setLlm({ ...llm, provider: e.target.value })}
                className="w-full input">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
              </select>
            </div>

            <div>
              <label className="block label">API Key</label>
              <div className="relative">
                <input type="password" value={llm.apiKey}
                  onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                  placeholder={llm.apiKeySet ? `Current key: ${llm.apiKeyMasked}` : 'Enter your API key'}
                  className="w-full input pr-20" />
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
          className="btn-primary">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
