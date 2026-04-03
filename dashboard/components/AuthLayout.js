'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

const AUTH_PAGES = ['/login', '/register'];

export default function AuthLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  useEffect(() => {
    if (isAuthPage) {
      setChecked(true);
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
    } else {
      setChecked(true);
    }
  }, [pathname, isAuthPage, router]);

  if (isAuthPage) {
    return children;
  }

  // Don't render protected pages until auth check completes
  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
