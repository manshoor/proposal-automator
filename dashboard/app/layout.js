import { Inter } from 'next/font/google';
import './globals.css';
import AuthLayout from '../components/AuthLayout';
import { readSession } from '../lib/session';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Upwork Dashboard',
  description: 'Manage proposals, profile, and templates',
};

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
