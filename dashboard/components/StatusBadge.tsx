'use client';
// @ts-nocheck — TODO: tighten types in a follow-up iter

const BADGE_MAP = {
  sent: 'badge badge-blue',
  hired: 'badge badge-green',
  rejected: 'badge badge-red',
  pending: 'badge badge-yellow',
  withdrawn: 'badge badge-gray',
};

export default function StatusBadge({ status }) {
  const cls = BADGE_MAP[status] || BADGE_MAP.sent;
  return (
    <span className={`${cls} capitalize`}>
      {status}
    </span>
  );
}