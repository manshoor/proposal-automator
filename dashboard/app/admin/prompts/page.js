import { serverFetch } from '../../../lib/server-api';
import { requireSession } from '../../../lib/session';
import AdminPromptsClient from './admin-prompts-client';

export default async function AdminPromptsPage() {
  await requireSession();
  const prompts = await serverFetch('/admin/prompts').catch(() => []);
  return <AdminPromptsClient initialPrompts={Array.isArray(prompts) ? prompts : []} />;
}
