'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import dynamic from 'next/dynamic';
import Toast from '../../components/Toast';

const Charts = dynamic(() => import('../../components/AnalyticsCharts'), { ssr: false });

const STAT_ICONS = {
  total: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  win: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.996.178-1.768-.767-1.768-1.768 0-1.001.772-1.945 1.768-1.768m0 3.536h13.5" /></svg>,
  rate: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  hired: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  connects: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
  cost: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  roi: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
};

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState('');
  const [toast, setToast] = useState(null);

  const fetchInsights = () =>
    api.get('/analytics/insights').then(setInsights).catch(() => {});

  useEffect(() => {
    Promise.all([
      api.get('/analytics').then(setData).catch(() => {}),
      fetchInsights(),
    ]).finally(() => setLoading(false));
  }, []);

  const toggleInsight = async (insight) => {
    try {
      const updated = await api.put(`/analytics/insights/${insight.id}`, { is_active: !insight.is_active });
      setInsights(insights.map(i => i.id === insight.id ? { ...i, ...updated } : i));
    } catch {
      setToast({ message: 'Failed to update insight', type: 'error' });
    }
  };

  const analyzePatterns = async () => {
    setAnalyzing(true);
    setAnalyzeMessage('');
    try {
      const result = await api.post('/analytics/learn', {});
      setAnalyzeMessage(result.message || 'Analysis complete.');
      await fetchInsights();
    } catch (err) {
      setAnalyzeMessage('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return (
    <div className="page-container">
      <div className="page-header"><div className="skeleton-line w-48 h-7" /><div className="skeleton-line-xs mt-2" /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton-card"><div className="skeleton-body"><div className="skeleton-line-xs" /><div className="skeleton-line w-1/2 h-8 mt-2" /></div></div>
        ))}
      </div>
    </div>
  );
  if (!data) return <div className="text-gray-500">Failed to load analytics.</div>;

  const s = data.summary || {};
  const c = data.connects || {};

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">Track your proposal performance and ROI over time</p>
      </div>

      {/* Proposal Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={STAT_ICONS.total} label="Total Proposals" value={s.total || 0} gradient="from-blue-500 to-blue-600" />
        <StatCard icon={STAT_ICONS.win} label="Win Rate" value={`${s.winRate || 0}%`} gradient="from-emerald-500 to-emerald-600" />
        <StatCard icon={STAT_ICONS.rate} label="Avg Rate" value={`$${s.avgHourlyRate || 0}/hr`} gradient="from-purple-500 to-purple-600" />
        <StatCard icon={STAT_ICONS.hired} label="Total Hired" value={s.hired || 0} gradient="from-green-500 to-green-600" />
      </div>

      {/* Connect Budget Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={STAT_ICONS.connects} label="Connects Spent" value={c.totalConnects || 0} sub={`${c.weeklyConnects || 0} this week`} gradient="from-orange-500 to-orange-600" />
        <StatCard icon={STAT_ICONS.cost} label="Cost per Hire" value={c.connectsPerHire ? `${c.connectsPerHire}` : '—'} sub={c.connectsPerHire ? `$${(c.connectsPerHire * 0.3).toFixed(2)} USD` : 'No hires yet'} gradient="from-amber-500 to-amber-600" />
        <StatCard icon={STAT_ICONS.rate} label="Total Earnings" value={`$${c.totalEarnings || 0}`} gradient="from-green-500 to-teal-600" />
        <StatCard icon={STAT_ICONS.roi} label="ROI" value={c.roiMultiplier ? `${c.roiMultiplier}x` : '—'} sub="earnings / connect cost" gradient={c.roiMultiplier > 1 ? 'from-green-500 to-emerald-600' : 'from-gray-400 to-gray-500'} />
      </div>

      <Charts data={data} />

      {/* Proposal Insights */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Proposal Insights</h2>
            <p className="text-xs text-gray-500 mt-0.5">AI-derived patterns from your proposal history</p>
          </div>
          <button
            onClick={analyzePatterns}
            disabled={analyzing}
            className="btn-primary text-sm px-4 py-2"
          >
            {analyzing ? 'Analyzing…' : 'Analyze My Patterns'}
          </button>
        </div>

        {analyzeMessage && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200/60 text-sm text-blue-800">
            {analyzeMessage}
          </div>
        )}

        {insights.length === 0 ? (
          <div className="card p-8 text-center text-gray-500 text-sm">
            No insights yet. Click "Analyze My Patterns" to generate them.
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div key={insight.id} className="card">
                <div className="card-body flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {insight.category && (
                        <span className="badge-blue capitalize">{insight.category}</span>
                      )}
                      {insight.confidence_score != null && (
                        <span className="badge-purple">
                          {Math.round(insight.confidence_score * 100)}% confidence
                        </span>
                      )}
                    </div>
                    <p className={`text-sm ${insight.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                      {insight.insight_text}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleInsight(insight)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      insight.is_active ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={insight.is_active}
                    title={insight.is_active ? 'Disable insight' : 'Enable insight'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        insight.is_active ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function StatCard({ icon, label, value, sub, gradient }) {
  return (
    <div className="card group hover:scale-[1.02] transition-all duration-200">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg`}
            style={{ boxShadow: `0 4px 14px rgba(0,0,0,0.15)` }}>
            {icon}
          </div>
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1 tracking-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1 font-medium">{sub}</p>}
      </div>
    </div>
  );
}
