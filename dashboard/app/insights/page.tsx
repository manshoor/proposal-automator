// @ts-nocheck — TODO: tighten types in a follow-up iter
import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import InsightsClient from './insights-client';

export default async function InsightsPage() {
  await requireSession();

  const [tracking, insights, connects] = await Promise.all([
    serverFetch('/outcomes/tracking').catch(() => ({ enabled: false })),
    serverFetch('/insights').catch(() => null),
    serverFetch('/connects').catch(() => null),
  ]);

  return (
    <InsightsClient
      initialTracking={tracking || { enabled: false }}
      initialInsights={insights || null}
      initialConnects={connects || null}
    />
  );
}