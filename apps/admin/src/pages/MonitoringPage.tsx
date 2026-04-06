import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface ActiveTrip {
  id: string;
  status: string;
  passenger: string;
  passengerPhone: string;
  driver: string;
  driverPhone: string;
  pickup: string;
  dropoff: string;
  fare: number;
  hasDispute: boolean;
  updatedAt: string;
  createdAt: string;
  isStale: boolean;
  minutesSinceUpdate: number;
}

interface OnlineDriver {
  id: string;
  userId: string;
  name: string | null;
  phone: string;
  userStatus: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  isFlagged: boolean;
  minutesSinceHeartbeat: number | null;
}

interface StaleNegotiation {
  id: string;
  passenger: string;
  passengerPhone: string;
  vehicleType: string;
  pickup: string;
  dropoff: string;
  fareOffer: number;
  offerCount: number;
  createdAt: string;
  minutesOld: number;
}

interface Dispute {
  id: string;
  subject: string;
  status: string;
  priority: string;
  tripId: string | null;
  createdAt: string;
}

interface MonitoringData {
  summary: {
    activeTrips: number;
    staleTrips: number;
    onlineDrivers: number;
    unresolvedDisputes: number;
    staleNegotiations: number;
  };
  activeTrips: ActiveTrip[];
  onlineDrivers: OnlineDriver[];
  unresolvedDisputes: Dispute[];
  staleNegotiations: StaleNegotiation[];
}

type PanelTab = 'trips' | 'drivers' | 'disputes' | 'negotiations';

const STATUS_LABELS: Record<string, string> = {
  DRIVER_ASSIGNED: 'Assigned',
  DRIVER_EN_ROUTE: 'En Route',
  DRIVER_ARRIVED: 'Arrived',
  PICKUP_CONFIRMED: 'Picked Up',
  IN_PROGRESS: 'In Progress',
  ARRIVED_DESTINATION: 'At Destination',
  AWAITING_CASH_CONFIRMATION: 'Awaiting Payment',
  COMPLETED: 'Completed',
};

const STATUS_COLOR: Record<string, string> = {
  DRIVER_ASSIGNED: 'bg-amber-100 text-amber-700',
  DRIVER_EN_ROUTE: 'bg-blue-100 text-blue-700',
  DRIVER_ARRIVED: 'bg-violet-100 text-violet-700',
  PICKUP_CONFIRMED: 'bg-sky-100 text-sky-700',
  IN_PROGRESS: 'bg-primary/10 text-primary',
  ARRIVED_DESTINATION: 'bg-emerald-100 text-emerald-700',
  AWAITING_CASH_CONFIRMATION: 'bg-orange-100 text-orange-700',
};

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<PanelTab>('trips');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [forceCancelId, setForceCancelId] = useState<string | null>(null);
  const [forceCancelNote, setForceCancelNote] = useState('');
  const [forceCancelLoading, setForceCancelLoading] = useState(false);
  const [actionToast, setActionToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setActionToast({ msg, type });
    setTimeout(() => setActionToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch<MonitoringData>('/admin/monitoring');
      setData(res);
      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // auto-refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleForceCancel = async () => {
    if (!forceCancelId || !forceCancelNote.trim()) return;
    setForceCancelLoading(true);
    try {
      await apiFetch(`/admin/trips/${forceCancelId}/force-status`, {
        method: 'POST',
        body: { status: 'CANCELLED', note: forceCancelNote.trim() },
      });
      showToast('Trip force-cancelled successfully');
      setForceCancelId(null);
      setForceCancelNote('');
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel trip', 'error');
    } finally {
      setForceCancelLoading(false);
    }
  };

  const statCards = data
    ? [
        { label: 'Active Trips', value: data.summary.activeTrips, icon: 'route', color: 'text-primary', bg: 'bg-primary/10' },
        { label: 'Stale Trips', value: data.summary.staleTrips, icon: 'warning', color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Online Drivers', value: data.summary.onlineDrivers, icon: 'drive_eta', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Open Disputes', value: data.summary.unresolvedDisputes, icon: 'support_agent', color: 'text-red-600', bg: 'bg-red-50' },
        { label: 'Stale Negotiations', value: data.summary.staleNegotiations, icon: 'hourglass_top', color: 'text-violet-600', bg: 'bg-violet-50' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Live Operations Monitor
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Auto-refreshes every 15 s{lastRefresh ? ` · Last: ${lastRefresh.toLocaleTimeString()}` : ''}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh Now
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Stat Cards */}
      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
                <span className={`material-symbols-outlined text-base ${card.color}`}>{card.icon}</span>
              </div>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{card.value}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Panel Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'trips' as const, label: 'Active Trips', count: data?.summary.activeTrips },
          { key: 'drivers' as const, label: 'Online Drivers', count: data?.summary.onlineDrivers },
          { key: 'disputes' as const, label: 'Disputes', count: data?.summary.unresolvedDisputes },
          { key: 'negotiations' as const, label: 'Stale Negotiations', count: data?.summary.staleNegotiations },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === t.key
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                tab === t.key ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Active Trips Panel ── */}
      {tab === 'trips' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <p className="font-bold text-slate-900 dark:text-white text-sm">Active Trips</p>
          </div>
          {!data?.activeTrips.length ? (
            <div className="p-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">check_circle</span>
              No active trips right now
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.activeTrips.map((trip) => (
                <div key={trip.id} className={`px-6 py-4 flex items-start gap-4 ${trip.isStale ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {trip.id.slice(0, 8)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[trip.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABELS[trip.status] ?? trip.status}
                      </span>
                      {trip.isStale && (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                          <span className="material-symbols-outlined text-[10px]">warning</span>
                          Stale {trip.minutesSinceUpdate}m
                        </span>
                      )}
                      {trip.hasDispute && (
                        <span className="flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                          <span className="material-symbols-outlined text-[10px]">report</span>
                          Dispute
                        </span>
                      )}
                    </div>
                    <div className="flex gap-6 text-xs text-slate-600 dark:text-slate-400">
                      <span><span className="font-bold text-slate-800 dark:text-slate-200">P:</span> {trip.passenger}</span>
                      <span><span className="font-bold text-slate-800 dark:text-slate-200">D:</span> {trip.driver}</span>
                      <span className="font-bold text-primary">฿{trip.fare}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {trip.pickup.split(',')[0]} → {trip.dropoff.split(',')[0]}
                    </p>
                  </div>
                  <button
                    onClick={() => setForceCancelId(trip.id)}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Force Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Online Drivers Panel ── */}
      {tab === 'drivers' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <p className="font-bold text-slate-900 dark:text-white text-sm">Currently Online Drivers</p>
          </div>
          {!data?.onlineDrivers.length ? (
            <div className="p-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">drive_eta</span>
              No drivers currently online
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.onlineDrivers.map((driver) => (
                <div key={driver.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-emerald-600 text-base">person</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{driver.name ?? 'Unknown'}</span>
                      {driver.isFlagged && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Flagged</span>
                      )}
                      {driver.userStatus === 'SUSPENDED' && (
                        <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold">Suspended User</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{driver.phone} · {driver.vehicleType ?? '—'} {driver.vehiclePlate ? `· ${driver.vehiclePlate}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {driver.minutesSinceHeartbeat !== null ? (
                      <span className={`text-xs font-bold ${
                        driver.minutesSinceHeartbeat > 5 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {driver.minutesSinceHeartbeat === 0 ? 'Just now' : `${driver.minutesSinceHeartbeat}m ago`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No heartbeat</span>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">Last seen</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Disputes Panel ── */}
      {tab === 'disputes' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <p className="font-bold text-slate-900 dark:text-white text-sm">Unresolved Disputes</p>
          </div>
          {!data?.unresolvedDisputes.length ? (
            <div className="p-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">verified</span>
              No open disputes — all clear!
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.unresolvedDisputes.map((d) => (
                <div key={d.id} className="px-6 py-4 flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    d.priority === 'HIGH' || d.priority === 'URGENT' ? 'bg-red-500' :
                    d.priority === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{d.subject}</p>
                    {d.tripId && <p className="text-xs text-slate-400 font-mono">Trip: {d.tripId.slice(0, 12)}…</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      d.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>{d.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      d.priority === 'HIGH' || d.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                      d.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                    }`}>{d.priority}</span>
                    <p className="text-[11px] text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Stale Negotiations Panel ── */}
      {tab === 'negotiations' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <p className="font-bold text-slate-900 dark:text-white text-sm">Stale Ride Negotiations (&gt;10 min)</p>
          </div>
          {!data?.staleNegotiations.length ? (
            <div className="p-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">check_circle</span>
              No stale negotiations
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.staleNegotiations.map((neg) => (
                <div key={neg.id} className="px-6 py-4 flex items-center gap-4">
                  <span className="text-amber-500 material-symbols-outlined text-xl shrink-0">hourglass_top</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {neg.id.slice(0, 8)}
                      </span>
                      <span className="text-xs font-bold text-amber-700">{neg.minutesOld} min old</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {neg.passenger} · {neg.vehicleType} · ฿{neg.fareOffer} · {neg.offerCount} offer{neg.offerCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {neg.pickup.split(',')[0]} → {neg.dropoff.split(',')[0]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Force Cancel Modal ── */}
      {forceCancelId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-red-500 text-2xl">cancel</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Force Cancel Trip</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Trip <span className="font-mono font-bold">{forceCancelId.slice(0, 12)}…</span> will be immediately cancelled. This action is irreversible.
            </p>
            <textarea
              value={forceCancelNote}
              onChange={(e) => setForceCancelNote(e.target.value)}
              placeholder="Admin note / reason (required)…"
              rows={3}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm mb-4 focus:ring-2 focus:ring-red-400 focus:border-red-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setForceCancelId(null); setForceCancelNote(''); }}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Abort
              </button>
              <button
                onClick={handleForceCancel}
                disabled={forceCancelLoading || !forceCancelNote.trim()}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-red-600 transition-colors"
              >
                {forceCancelLoading ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {actionToast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-bold ${
          actionToast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {actionToast.msg}
        </div>
      )}
    </div>
  );
}
