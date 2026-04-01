'use client';

import { useState } from 'react';
import Toast from '../../components/Toast';

const DEFAULT_LOCATIONS = [
  'United Kingdom', 'United States', 'Canada', 'Singapore', 'Malaysia',
  'United Arab Emirates', 'Abu Dhabi', 'Dubai', 'Saudi Arabia', 'Qatar', 'Bahrain',
];

export default function SettingsPage() {
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [newLocation, setNewLocation] = useState('');
  const [thresholds, setThresholds] = useState({ minSpent: 1000, minHireRate: 30, minReviews: 3 });
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

  const handleSave = () => {
    localStorage.setItem('upwork_settings', JSON.stringify({ locations, thresholds }));
    setToast({ message: 'Settings saved', type: 'success' });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="space-y-6 max-w-3xl">
        {/* Target Locations */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Target Client Locations</h2>
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
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()}
              placeholder="Add country..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button onClick={addLocation} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Add</button>
          </div>
        </div>

        {/* Vetting Thresholds */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vetting Thresholds</h2>
          <p className="text-sm text-gray-500 mb-4">Clients below these thresholds will be flagged in the extension.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Spending ($)</label>
              <input
                type="number"
                value={thresholds.minSpent}
                onChange={(e) => setThresholds({ ...thresholds, minSpent: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Hire Rate (%)</label>
              <input
                type="number"
                value={thresholds.minHireRate}
                onChange={(e) => setThresholds({ ...thresholds, minHireRate: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Reviews</label>
              <input
                type="number"
                value={thresholds.minReviews}
                onChange={(e) => setThresholds({ ...thresholds, minReviews: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* LLM Config Note */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">LLM Configuration</h2>
          <p className="text-sm text-gray-600">
            API keys and LLM provider settings are configured in the Chrome extension settings page.
            Click the extension icon → Settings to manage your API key.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Save Settings
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
