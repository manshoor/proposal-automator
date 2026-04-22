import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import ProposalsClient from './proposals-client';

const PAGE_SIZE = 25;

export default async function ProposalsPage() {
  await requireSession();
  const proposals = await serverFetch(`/proposals?limit=${PAGE_SIZE}&offset=0&sort=created_at&order=desc`)
    .catch(() => []);
  return <ProposalsClient initialProposals={Array.isArray(proposals) ? proposals : []} />;
}
