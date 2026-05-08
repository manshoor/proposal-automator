import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL || 'http://backend:3000';

/**
 * Server-side fetch that forwards the incoming request's cookies to the backend.
 * On 401, redirects to /login. On other errors, throws (caught by app/error.js).
 *
 * Caching behaviour (Next.js ISR / RSC cache):
 *   - Default: `next: { revalidate: 60 }` — RSC output is cached for 60 s, then
 *     stale-while-revalidate. Use for read-only, infrequently-mutated endpoints.
 *   - Pass `{ cache: 'no-store' }` to opt out entirely (auth, mutation-heavy paths).
 *   - Pass `{ revalidate: N }` to override the TTL (seconds).
 *   - Pass `{ tags: ['tag'] }` to enable on-demand revalidation via revalidateTag().
 *
 * Usage in a server component:
 *   // Read-only endpoint — cached 60 s by default:
 *   const projects = await serverFetch('/projects');
 *
 *   // Mutation-sensitive — always fresh:
 *   const proposals = await serverFetch('/proposals?limit=25', { cache: 'no-store' });
 *
 *   // Custom TTL + tag:
 *   const insights = await serverFetch('/insights', { revalidate: 300, tags: ['insights'] });
 */
export async function serverFetch(path, options = {}) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');

  // Separate our custom caching options from any pass-through fetch options.
  const { cache: cacheOverride, revalidate, tags, headers: extraHeaders, ...restOptions } = options;

  const fetchOptions = {
    ...restOptions,
    method: restOptions.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(extraHeaders || {}),
    },
  };

  if (cacheOverride === 'no-store') {
    // Opt-out of all caching — used for auth endpoints and mutation-heavy paths.
    fetchOptions.cache = 'no-store';
  } else {
    // ISR-style revalidation: Next.js caches the RSC payload and revalidates
    // in the background after the TTL expires (stale-while-revalidate).
    fetchOptions.next = {
      revalidate: typeof revalidate === 'number' ? revalidate : 60,
      tags: tags || [],
    };
  }

  const res = await fetch(`${API_URL}/api/v1${path}`, fetchOptions);

  if (res.status === 401) {
    redirect('/login');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Backend returned ${res.status}: ${text}`);
  }

  return res.json();
}
