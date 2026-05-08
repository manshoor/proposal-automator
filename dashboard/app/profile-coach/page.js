import { requireSession } from '../../lib/session';
import ProfileCoachClient from './profile-coach-client';

export default async function ProfileCoachPage() {
  await requireSession();
  return <ProfileCoachClient />;
}
