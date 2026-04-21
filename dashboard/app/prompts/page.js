import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import PromptsClient from './prompts-client';

export default async function PromptsPage() {
  await requireSession();
  const prompts = await serverFetch('/prompts').catch(() => []);
  return <PromptsClient initialPrompts={Array.isArray(prompts) ? prompts : []} />;
}
