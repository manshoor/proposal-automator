'use client';
// @ts-nocheck — TODO: tighten types in a follow-up iter

export default function PageHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {children && <div>{children}</div>}
    </div>
  );
}