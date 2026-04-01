'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/profile', label: 'Profile', icon: '👤' },
  { href: '/projects', label: 'Projects', icon: '💼' },
  { href: '/proposals', label: 'Proposals', icon: '📄' },
  { href: '/templates', label: 'Templates', icon: '📝' },
  { href: '/analytics', label: 'Analytics', icon: '📊' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 w-64 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="px-5 py-6 border-b border-gray-800">
        <h1 className="text-lg font-bold tracking-tight">Proposal Automator</h1>
        <p className="text-xs text-gray-400 mt-1">Upwork Dashboard</p>
      </div>

      <nav className="flex-1 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                active
                  ? 'bg-gray-800 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-800 text-xs text-gray-500">
        v1.0.0
      </div>
    </aside>
  );
}
