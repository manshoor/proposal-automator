// @ts-nocheck — TODO: tighten types in a follow-up iter
import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import TemplatesClient from './templates-client';

export default async function TemplatesPage() {
  await requireSession();
  const templates = await serverFetch('/templates').catch(() => []);
  return <TemplatesClient initialTemplates={Array.isArray(templates) ? templates : []} />;
}