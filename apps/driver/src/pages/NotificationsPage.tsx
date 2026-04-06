import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

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
  SYSTEM_ALERT:          '📢',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('th-TH');
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifs] = useState<Notification[]>([]);
  const [unreadCount, setUnread]   = useState(0);
  const [loading, setLoading]      = useState(true);
  const [page, setPage]            = useState(1);
  const [hasMore, setHasMore]      = useState(false);
  const [filter, setFilter]        = useState<'all' | 'unread'>('all');

  const fetchNotifs = useCallback(async (p = 1, append = false, unreadOnly = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (unreadOnly) params.set('unread', 'true');
      const res = await apiFetch(`/notifications?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      setUnread(data?.unreadCount ?? 0);
      setHasMore(p < (data?.meta?.totalPages ?? 1));
      setNotifs((prev) => append ? [...prev, ...data.notifications] : data.notifications ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchNotifs(1, false, filter === 'unread');
  }, [filter, fetchNotifs]);

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

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchNotifs(next, true, filter === 'unread');
  };

  const handleNotifClick = (n: Notification) => {
    if (!n.isRead) markRead(n.id);
    if (n.relatedEntityType === 'trip' && n.relatedEntityId) navigate('/trip-active');
    else if (n.relatedEntityType === 'ride' && n.relatedEntityId) navigate(`/submit-offer/${n.relatedEntityId}`);
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display">
      {/* Header */}
      <div className="bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 pt-12 pb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <span className="material-icons-round text-slate-600 dark:text-slate-300">arrow_back</span>
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-lg text-slate-900 dark:text-white">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm text-primary font-semibold hover:underline px-2"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex border-t border-slate-100 dark:border-slate-800">
          {(['all', 'unread'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-colors border-b-2 ${
                filter === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="pb-24">
        {loading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-5xl mb-4">🔔</span>
            <p className="text-sm font-medium">
              {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
            </p>
            <p className="text-xs mt-1">
              {filter === 'unread' ? 'No unread notifications' : 'Notifications will appear here'}
            </p>
          </div>
        ) : (
          <>
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={`w-full text-left px-4 py-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex gap-3 ${
                  !n.isRead ? 'bg-primary/5' : 'bg-white dark:bg-surface-dark'
                }`}
              >
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-lg">
                  {TYPE_ICON[n.type] ?? '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${!n.isRead ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {n.title}
                    </p>
                    <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{n.body}</p>
                </div>
                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                )}
              </button>
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full py-4 text-sm text-primary font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                {loading ? 'Loading…' : 'Load more notifications'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
