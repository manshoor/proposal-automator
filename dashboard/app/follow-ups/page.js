import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import FollowUpsClient from './follow-ups-client';

export default async function FollowUpsPage() {
  await requireSession();
  const [followUps, proposals] = await Promise.all([
    serverFetch('/follow-ups?status=scheduled&limit=50', { cache: 'no-store' }).catch(() => []),
    serverFetch('/proposals?limit=25&sort=created_at&order=desc', { cache: 'no-store' }).catch(() => []),
  ]);
  return (
    <FollowUpsClient
      initialFollowUps={Array.isArray(followUps) ? followUps : []}
      initialProposals={Array.isArray(proposals) ? proposals : []}
    />
  );
}
