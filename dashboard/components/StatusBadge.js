'use client';

const COLORS = {
  sent: 'bg-blue-100 text-blue-800',
  hired: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  withdrawn: 'bg-gray-100 text-gray-600',
};

export default function StatusBadge({ status }) {
  const cls = COLORS[status] || COLORS.sent;
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
