'use client';

import { useState, useEffect } from 'react';

export default function TemplateEditor({ template, onSave, onClose }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (template) {
      setName(template.name || '');
      setContent(template.content || '');
    }
  }, [template]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!content.trim()) {
      setError('Template content is required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ name: name.trim(), content: content.trim() });
    } catch (err) {
      setError(err.message || 'Failed to save template. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl p-6
                   transition-all duration-200 ease-out"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md
                       hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414
                   1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293
                   4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Template Name */}
          <div className="mb-4">
            <label
              htmlFor="template-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Web Development Proposal"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                         text-gray-900 placeholder-gray-400 bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         transition-colors"
            />
          </div>

          {/* Content */}
          <div className="mb-4">
            <label
              htmlFor="template-content"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              id="template-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="Write your template here. Use variables like {job_title} to personalize each proposal..."
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                         text-gray-900 placeholder-gray-400 bg-white font-mono
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         transition-colors resize-y"
            />
          </div>

          {/* Variable reference guide */}
          <div className="mb-5 px-3 py-3 bg-blue-50 border border-blue-100 rounded-md">
            <p className="text-xs font-medium text-blue-800 mb-1">Available variables</p>
            <p className="text-xs text-blue-700 leading-relaxed font-mono">
              {'{job_title}'}&nbsp;&nbsp;{'{client_name}'}&nbsp;&nbsp;{'{skills}'}
              &nbsp;&nbsp;{'{budget}'}&nbsp;&nbsp;{'{description}'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border
                         border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none
                         focus:ring-2 focus:ring-gray-300 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md
                         hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                         focus:ring-offset-2 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
