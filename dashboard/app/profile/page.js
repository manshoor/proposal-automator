'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import Toast from '../../components/Toast';

export default function ProfilePage() {
  const [form, setForm] = useState({
    full_name: '', title: '', summary: '', skills: '',
    experience: '', portfolio: '', default_hourly_rate: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

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

  if (loading) {
    return <div className="animate-pulse text-gray-400">Loading profile...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>

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
