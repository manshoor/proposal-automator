import './globals.css';
import AuthLayout from '../components/AuthLayout';

export const metadata = {
  title: 'Upwork Dashboard',
  description: 'Manage proposals, profile, and templates',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthLayout>{children}</AuthLayout>
      </body>
    </html>
  );
}
