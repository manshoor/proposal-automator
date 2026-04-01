'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const STATUS_COLORS = {
  sent: '#3b82f6',
  hired: '#22c55e',
  rejected: '#ef4444',
  pending: '#eab308',
  withdrawn: '#9ca3af',
};

export default function AnalyticsCharts({ data }) {
  const weekly = (data.weeklyProposals || []).map(w => ({
    week: new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: parseInt(w.count, 10),
  }));

  const statusData = (data.statusBreakdown || []).map(s => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: parseInt(s.count, 10),
    fill: STATUS_COLORS[s.status] || '#9ca3af',
  }));

  const skills = (data.topSkills || []).slice(0, 10).map(s => ({
    name: s.skill,
    count: parseInt(s.count, 10),
  }));

  return (
    <div className="space-y-8">
      {weekly.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">Proposals per Week</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {statusData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {skills.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">Top Skills</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={skills} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
