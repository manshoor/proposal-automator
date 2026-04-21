import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL || 'http://backend:3000';

/**
 * Server-side fetch that forwards the incoming request's cookies to the backend.
 * On 401, redirects to /login. On other errors, throws (caught by app/error.js).
 *
 * Usage in a server component:
 *   const proposals = await serverFetch('/proposals?limit=25');
 */
export async function serverFetch(path, options = {}) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Backend returned ${res.status}: ${text}`);
  }

  return res.json();
}
