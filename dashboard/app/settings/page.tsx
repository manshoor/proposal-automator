// @ts-nocheck — TODO: tighten types in a follow-up iter
import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import SettingsClient from './settings-client';

export default async function SettingsPage() {
  await requireSession();
  const settings = await serverFetch('/settings').catch(() => ({}));
  return <SettingsClient initialSettings={settings || {}} />;
}