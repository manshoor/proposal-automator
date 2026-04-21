import { serverFetch } from '../lib/server-api';
import { requireSession } from '../lib/session';
import HomeClient from './home-client';

export default async function HomePage() {
  await requireSession();
  const [analytics, proposals, insights] = await Promise.all([
    serverFetch('/analytics').catch(() => null),
    serverFetch('/proposals?limit=5&sort=created_at&order=desc').catch(() => []),
    serverFetch('/analytics/insights').catch(() => []),
  ]);

  return <HomeClient analytics={analytics} proposals={proposals} insights={insights} />;
}
