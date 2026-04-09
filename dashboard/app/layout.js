import { Inter } from 'next/font/google';
import './globals.css';
import AuthLayout from '../components/AuthLayout';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Upwork Dashboard',
  description: 'Manage proposals, profile, and templates',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthLayout>{children}</AuthLayout>
      </body>
    </html>
  );
}
