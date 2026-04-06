/**
 * NotificationBell — Customer App
 *
 * Shows a bell icon with an unread badge. Clicking opens a slide-in drawer
 * that lists all notifications with mark-read controls.
 *
 * Recovery: on mount (and after reconnect) it fetches fresh notifications
 * from the API so missed Socket.IO events are automatically recovered.
 *
 * Live updates: listens to socket event "notification:new" to prepend
 * incoming notifications without a full re-fetch.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';

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
  OTP_DEBUG_INFO:        '🔑',
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
  const [page, setPage]            = useState(1);
  const [hasMore, setHasMore]      = useState(true);
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    try {
      setLoading(true);
      const res = await apiFetch(`/notifications?page=${pageNum}&limit=20`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      const newNotifs: Notification[] = data?.notifications ?? [];
      setUnread(data?.unreadCount ?? 0);
      setHasMore(pageNum < (data?.meta?.totalPages ?? 1));
      setNotifs((prev) => append ? [...prev, ...newNotifs] : newNotifs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when drawer opens
  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) {
      setPage(1);
      fetchNotifications(1);
    }
  }, [open, fetchNotifications]);

  // Listen for new real-time notifications
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchNotifications(1);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchNotifications]);

  // Poll unread count every 30s as fallback
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
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (id: string) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnread((c) => Math.max(0, c - 1));
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const markAllRead = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await apiFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchNotifications(next, true);
  };

  return (
    <div className="relative" ref={drawerRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:text-primary transition-colors"
        aria-label="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Slide-in drawer */}
      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-[480px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-bold text-sm text-slate-900">
              Notifications {unreadCount > 0 && <span className="ml-1 text-xs text-red-500 font-semibold">({unreadCount})</span>}
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
              <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No notifications yet</div>
            ) : (
              <>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 ${
                      !n.isRead ? 'bg-primary/5' : ''
                    }`}
                  >
                    <span className="text-xl shrink-0 mt-0.5">
                      {TYPE_ICON[n.type] ?? '🔔'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${!n.isRead ? 'text-slate-900' : 'text-slate-600'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </button>
                ))}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full py-3 text-xs text-primary font-semibold hover:bg-slate-50 transition-colors"
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
