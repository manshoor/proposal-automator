// @ts-nocheck — TODO: tighten types in a follow-up iter
import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import AnalyticsClient from './analytics-client';

export default async function AnalyticsPage() {
  await requireSession();
  const [data, insights] = await Promise.all([
    serverFetch('/analytics').catch(() => null),
    serverFetch('/analytics/insights').catch(() => []),
  ]);

  return <AnalyticsClient initialData={data} initialInsights={insights} />;
}