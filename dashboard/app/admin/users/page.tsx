// @ts-nocheck — TODO: tighten types in a follow-up iter
import { serverFetch } from '../../../lib/server-api';
import { requireSession } from '../../../lib/session';
import UsersClient from './users-client';

export default async function AdminUsersPage() {
  await requireSession();
  const users = await serverFetch('/admin/users').catch(() => []);
  return <UsersClient initialUsers={Array.isArray(users) ? users : []} />;
}