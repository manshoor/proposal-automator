import { serverFetch } from '../../lib/server-api';
import { requireSession } from '../../lib/session';
import ProfileCoachClient from './profile-coach-client';

export default async function ProfileCoachPage() {
  await requireSession();
  const history = await serverFetch('/profile-coach/history?limit=10').catch(() => []);
  return <ProfileCoachClient initialHistory={Array.isArray(history) ? history : []} />;
}
