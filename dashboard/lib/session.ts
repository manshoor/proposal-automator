// @ts-nocheck — TODO: tighten types in a follow-up iter
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from './server-api';

/**
 * Returns the authenticated user, or null if no auth cookie is present.
 * For pages that require auth, prefer requireSession() which redirects.
 *
 * Wrapped in React.cache so that multiple server components calling readSession()
 * within the same render tree share a single result — no duplicate /auth/me fetches.
 */
export const readSession = cache(async function readSession() {
  const cookieStore = cookies();
  if (!cookieStore.get('accessToken')) return null;

  try {
    return await serverFetch('/auth/me', { cache: 'no-store' });
  } catch {
    return null;
  }
});

/**
 * Same as readSession() but redirects to /login if no session.
 * Use in protected server components.
 */
export async function requireSession() {
  const session = await readSession();
  if (!session) redirect('/login');
  return session;
}