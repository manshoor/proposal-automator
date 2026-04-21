'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import PageHeader from '../../components/PageHeader';
import TemplateEditor from '../../components/TemplateEditor';
import Toast from '../../components/Toast';

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state: null = closed, 'create' = new template, object = editing that template
  const [editorTarget, setEditorTarget] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function openCreate() {
    setEditorTarget(null);
    setEditorOpen(true);
  }

  function openEdit(template) {
    setEditorTarget(template);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorTarget(null);
  }

  async function handleSave({ name, content }) {
    if (editorTarget) {
      const updated = await api.put('/templates/' + editorTarget.id, { name, content });
      setTemplates((prev) =>
        prev.map((t) => (t.id === editorTarget.id ? updated : t))
      );
    } else {
      const created = await api.post('/templates', { name, content });
      setTemplates((prev) => [created, ...prev]);
    }
    closeEditor();
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this template? This action cannot be undone.'
    );
    if (!confirmed) return;

    setDeletingId(id);
    try {
      await api.del('/templates/' + id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setToast({ message: err.message || 'Failed to delete template. Please try again.', type: 'error' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page-container">
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Templates">
          <button
            type="button"
            onClick={openCreate}
            className="btn-primary"
          >
            Create Template
          </button>
        </PageHeader>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <svg
              className="animate-spin h-8 w-8 text-blue-500"
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
            <span className="ml-3 text-sm text-gray-500">Loading templates...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              type="button"
              onClick={fetchTemplates}
              className="btn-secondary"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && templates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-7 w-7 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
                     01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-gray-600 text-sm max-w-xs leading-relaxed">
              No templates yet. Create your first template to speed up proposal writing.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 btn-primary"
            >
              Create Template
            </button>
          </div>
        )}

        {/* Template grid */}
        {!loading && !error && templates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="card card-body flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div className="mb-4">
                  {/* Card header row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                      {template.name}
                    </h3>
                    {template.is_default && (
                      <span className="shrink-0 inline-block px-2 py-0.5 text-xs font-medium
                                       bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
                        Default
                      </span>
                    )}
                  </div>

                  {/* Content preview */}
                  <p className="text-xs text-gray-500 leading-relaxed font-mono whitespace-pre-wrap break-words">
                    {truncate(template.content, 120)}
                  </p>
                </div>

                {/* Card footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {formatDate(template.created_at)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(template)}
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                      className="btn-danger text-xs px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === template.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Editor Modal */}
      {editorOpen && (
        <TemplateEditor
          template={editorTarget}
          onSave={handleSave}
          onClose={closeEditor}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
