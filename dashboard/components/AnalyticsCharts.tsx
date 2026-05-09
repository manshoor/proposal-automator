'use client';
// @ts-nocheck — TODO: tighten types in a follow-up iter

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';

const STATUS_COLORS = {
  sent: '#3b82f6',
  hired: '#10b981',
  rejected: '#ef4444',
  pending: '#f59e0b',
  withdrawn: '#6b7280',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.9)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '12px',
      padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
          {p.value} {p.name || ''}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsCharts({ data }) {
  const weekly = (data.weeklyProposals || []).map(w => ({
    week: new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: parseInt(w.count, 10),
  }));

  const statusData = (data.statusBreakdown || []).map(s => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: parseInt(s.count, 10),
    fill: STATUS_COLORS[s.status] || '#6b7280',
  }));

  const skills = (data.topSkills || []).slice(0, 10).map(s => ({
    name: s.skill,
    count: parseInt(s.count, 10),
  }));

  const connectWeekly = (data.weeklyConnects || []).map(w => ({
    week: new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    connects: parseInt(w.connects, 10),
  }));

  return (
    <div className="space-y-6">
      {/* Proposals per Week - Area Chart */}
      {weekly.length > 0 && (
        <div className="card">
          <div className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">Proposals per Week</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={weekly}>
                <defs>
                  <linearGradient id="proposalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#proposalGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Breakdown - Donut */}
        {statusData.length > 0 && (
          <div className="card">
            <div className="p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">Status Breakdown</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100} paddingAngle={3} cornerRadius={6}>
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#64748b' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top Skills */}
        {skills.length > 0 && (
          <div className="card">
            <div className="p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">Top Skills</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={skills} layout="vertical" barSize={16}>
                  <defs>
                    <linearGradient id="skillGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="url(#skillGradient)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Connect Spending - Area Chart */}
      {connectWeekly.length > 0 && (
        <div className="card">
          <div className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">Connect Spending per Week</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={connectWeekly}>
                <defs>
                  <linearGradient id="connectGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="connects" stroke="#f59e0b" strokeWidth={2.5} fill="url(#connectGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}