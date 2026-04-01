'use client';

import { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'error' ? 'bg-red-600' : 'bg-green-600';

  return (
    <div className={`fixed bottom-6 right-6 ${bg} text-white px-5 py-3 rounded-lg shadow-lg text-sm z-50 animate-fade-in`}>
      {message}
    </div>
  );
}
