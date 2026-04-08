'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import Toast from '../../../components/Toast';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchUsers = useCallback(() => {
    api.get('/admin/users').then(data => {
      setUsers(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (id, role) => {
    setUpdatingId(id);
    try {
      await api.put(`/admin/users/${id}/role`, { role });
      setUsers(users.map(u => u.id === id ? { ...u, role } : u));
      setToast({ message: 'Role updated', type: 'success' });
    } catch {
      setToast({ message: 'Failed to update role', type: 'error' });
    }
    setUpdatingId(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading) return (
    <div className="page-container">
      <div className="page-header">
        <div className="skeleton-line w-48 h-7" />
        <div className="skeleton-line-xs mt-2" />
      </div>
      <div className="card">
        <div className="space-y-3 p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-line h-10" />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle">Manage users and their roles</p>
      </div>

      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-lg mb-2">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-800 font-medium">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">{u.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={updatingId === u.id}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        className="input text-xs py-1 px-2 h-auto w-auto disabled:opacity-50 cursor-pointer"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="text-[11px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium ring-1 ring-green-200/50">Active</span>
                      ) : (
                        <span className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium ring-1 ring-red-200/50">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
