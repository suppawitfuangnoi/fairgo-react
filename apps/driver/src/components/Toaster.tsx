import { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';

interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

const ICONS = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
  warning: 'warning',
};
const COLORS = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-primary',
  warning: 'bg-amber-500',
};

let idCounter = 0;

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toast.subscribe((msg, opts) => {
      const id = ++idCounter;
      const type = opts.type ?? 'info';
      setItems(prev => [...prev, { id, msg, type }]);
      setTimeout(() => {
        setItems(prev => prev.filter(t => t.id !== id));
      }, opts.duration ?? 3500);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-[9999] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map(item => (
        <div
          key={item.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-semibold shadow-lg max-w-sm w-full animate-fade-in ${COLORS[item.type]}`}
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
            {ICONS[item.type]}
          </span>
          <span className="flex-1">{item.msg}</span>
        </div>
      ))}
    </div>
  );
}
