// @ts-nocheck — TODO: tighten types in a follow-up iter
import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  await requireSession();
  const profile = await serverFetch('/profile').catch(() => null);
  return <ProfileClient initialProfile={profile} />;
}