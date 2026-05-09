// @ts-nocheck — TODO: tighten types in a follow-up iter
import { Inter } from 'next/font/google';
import './globals.css';
import AuthLayout from '../components/AuthLayout';
import { readSession } from '../lib/session';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Upwork Dashboard',
  description: 'Manage proposals, profile, and templates',
};

// All pages are auth-gated via cookies() — none can be statically prerendered.
// Forcing dynamic skips Next.js's static-generation phase which was crashing
// with `Cannot read properties of null (reading 'useContext')` for every page.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const session = await readSession();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthLayout session={session}>{children}</AuthLayout>
      </body>
    </html>
  );
}