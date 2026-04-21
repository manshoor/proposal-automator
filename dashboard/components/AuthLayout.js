'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

const AUTH_PAGES = ['/login', '/register'];

export default function AuthLayout({ children, session }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isAuthPage) return children;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="text-gray-600 hover:text-gray-900">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="font-semibold text-gray-900 text-sm">Proposal Automator</span>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} session={session} />

      <main className="lg:ml-64 pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}
