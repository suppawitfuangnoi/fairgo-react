/**
 * NotificationBell — Admin App
 * Polls unread count + shows a dropdown with recent notifications.
 * Admin tokens are stored under the same fg_access_token key.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://fairgo-react-production.up.railway.app/api/v1';

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('fg_access_token');
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, string> = {
  NEW_RIDE_REQUEST:      '🚕',
  NEW_OFFER:             '🤝',
  COUNTER_OFFER:         '🔄',
  OFFER_ACCEPTED:        '✅',
  OFFER_REJECTED:        '❌',
  DRIVER_EN_ROUTE:       '🚗',
  DRIVER_ARRIVED:        '📍',
  TRIP_STARTED:          '🚀',
  AWAITING_CASH_PAYMENT: '💵',
  PAYMENT_CONFIRMED:     '💚',
  TRIP_COMPLETED:        '🏁',
  TRIP_CANCELLED:        '🚫',
  DISPUTE_CREATED:       '⚠️',
  SYSTEM_ALERT:          '📢',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen]           = useState(false);
  const [notifications, setNotifs] = useState<Notification[]>([]);
  const [unreadCount, setUnread]   = useState(0);
  const [loading, setLoading]      = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/notifications?page=1&limit=20');
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      setUnread(data?.unreadCount ?? 0);
      setNotifs(data?.notifications ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // Fetch on mount
  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  // Re-fetch when drawer opens
  useEffect(() => {
    if (open) fetchNotifs();
  }, [open, fetchNotifs]);

  // Poll unread count every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await apiFetch('/notifications/unread-count');
        if (res.ok) {
          const json = await res.json();
          setUnread(json.data?.count ?? 0);
        }
      } catch { /* silent */ }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((c) => Math.max(0, c - 1));
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await apiFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  };

  return (
    <div className="relative" ref={drawerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-primary transition-colors relative"
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white dark:border-slate-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-[480px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-bold text-sm text-slate-900 dark:text-white">
              Notifications{unreadCount > 0 && <span className="ml-1 text-xs text-red-500">({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">No notifications yet</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex gap-3 ${
                    !n.isRead ? 'bg-primary/5' : ''
                  }`}
                >
                  <span className="text-xl shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${!n.isRead ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
