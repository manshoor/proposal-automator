import './globals.css';
import Sidebar from '../components/Sidebar';

export const metadata = {
  title: 'Upwork Dashboard',
  description: 'Manage proposals, profile, and templates',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
