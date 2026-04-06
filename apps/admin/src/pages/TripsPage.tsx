import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { IMG } from '@/lib/assets';

interface Trip {
  id: string;
  user: { name: string };
  driver: { name: string };
  pickup: string;
  dropoff: string;
  fare: number;
  status: string;
  distance?: number;
  duration?: number;
  createdAt: string;
}

interface TimelineStep {
  toStatus: string;
  toStatusLabel: string;
  toStatusEmoji: string;
  toStatusColor: string;
  changedByType: string;
  changedById: string | null;
  actorName: string | null;
  note: string | null;
  durationLabel: string | null;
  isTerminalStep: boolean;
  createdAt: string;
}

interface PaymentDetail {
  id: string;
  amount: number;
  status: string;
  method: string;
  driverConfirmedAt: string | null;
  passengerConfirmedAt: string | null;
  paidAt: string | null;
  disputeFlag: boolean;
  disputeReason: string | null;
  disputeRaisedAt: string | null;
  disputeResolvedAt: string | null;
  disputeResolutionNote: string | null;
}

interface TripDetail {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  lockedFare: number;
  actualDistance: number | null;
  actualDuration: number | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
  completedAt: string | null;
  passenger: { name: string; phone: string } | null;
  driver: { name: string; phone: string } | null;
  vehicle: { type: string; plateNumber: string } | null;
  timeline: TimelineStep[];
  payment: PaymentDetail | null;
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [search, setSearch] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [forceCancelNote, setForceCancelNote] = useState('');
  const [forceCancelLoading, setForceCancelLoading] = useState(false);
  const [showForceCancelConfirm, setShowForceCancelConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTrips = useCallback(async () => {
    try {
      setLoading(true);
      const statusParam = tab === 'all' ? '' : tab.toUpperCase();
      const response = await apiFetch<{ trips: Trip[] }>(
        `/admin/trips?${statusParam ? `status=${statusParam}` : ''}&limit=100`
      );
      setTrips(response.trips || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchTrips();
    if (tab === 'active') {
      const interval = setInterval(fetchTrips, 10000);
      return () => clearInterval(interval);
    }
  }, [fetchTrips, tab]);

  const openTripDetail = async (tripId: string) => {
    setDetailLoading(true);
    setSelectedTrip(null);
    setShowForceCancelConfirm(false);
    setForceCancelNote('');
    try {
      const res = await apiFetch<TripDetail>(`/admin/trips/${tripId}`);
      setSelectedTrip(res);
    } catch (err) {
      showToast('Failed to load trip detail', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleForceCancel = async () => {
    if (!selectedTrip || !forceCancelNote.trim()) return;
    setForceCancelLoading(true);
    try {
      await apiFetch(`/admin/trips/${selectedTrip.id}/force-status`, {
        method: 'POST',
        body: { status: 'CANCELLED', note: forceCancelNote.trim() },
      });
      showToast('Trip force-cancelled');
      setSelectedTrip(null);
      fetchTrips();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Force cancel failed', 'error');
    } finally {
      setForceCancelLoading(false);
      setShowForceCancelConfirm(false);
    }
  };

  const exportCSV = () => {
    if (!trips.length) return;
    const headers = ['Trip ID', 'Passenger', 'Driver', 'Pickup', 'Dropoff', 'Fare', 'Status', 'Time'];
    const rows = trips.map((t) => [
      t.id, t.user.name, t.driver.name, t.pickup, t.dropoff,
      `฿${t.fare.toFixed(2)}`, t.status, new Date(t.createdAt).toLocaleString(),
    ]);
    const csv = '\ufeff' + [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `trips-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const ACTIVE_STATUSES = new Set([
    'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED',
    'PICKUP_CONFIRMED', 'IN_PROGRESS', 'ARRIVED_DESTINATION', 'AWAITING_CASH_CONFIRMATION',
  ]);

  const getStatusColor = (status: string) => {
    if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
    if (ACTIVE_STATUSES.has(status)) return 'bg-primary/10 text-primary';
    if (['CANCELLED', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_PASSENGER', 'NO_SHOW_PASSENGER', 'NO_SHOW_DRIVER'].includes(status))
      return 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
    if (['DRIVER_ASSIGNED', 'PENDING'].includes(status)) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const STATUS_LABELS: Record<string, string> = {
    DRIVER_ASSIGNED: 'Assigned', DRIVER_EN_ROUTE: 'En Route', DRIVER_ARRIVED: 'Arrived',
    PICKUP_CONFIRMED: 'Picked Up', IN_PROGRESS: 'In Progress', ARRIVED_DESTINATION: 'At Destination',
    AWAITING_CASH_CONFIRMATION: 'Awaiting Payment', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
    CANCELLED_BY_DRIVER: 'Driver Cancelled', CANCELLED_BY_PASSENGER: 'Passenger Cancelled',
    NO_SHOW_PASSENGER: 'Passenger No-Show', NO_SHOW_DRIVER: 'Driver No-Show',
  };

  const isTerminalStatus = (s: string) =>
    ['COMPLETED', 'CANCELLED', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_PASSENGER', 'NO_SHOW_PASSENGER', 'NO_SHOW_DRIVER'].includes(s);

  const isCancellable = selectedTrip && !isTerminalStatus(selectedTrip.status);

  // Filter trips by search
  const filteredTrips = trips.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.user.name.toLowerCase().includes(q) ||
      t.driver.name.toLowerCase().includes(q) ||
      t.pickup.toLowerCase().includes(q) ||
      t.dropoff.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Trips</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Full trip timeline, payment details, force-cancel, and more.
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base">file_download</span>
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'active' as const, label: 'Active' },
          { key: 'completed' as const, label: 'Completed' },
          { key: 'cancelled' as const, label: 'Cancelled' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              tab === t.key ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, passenger, driver, address…"
          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      {/* Trips List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No trips found</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredTrips.map((trip, i) => (
              <div
                key={trip.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer flex items-start gap-4 transition-colors"
                onClick={() => openTripDetail(trip.id)}
              >
                <img
                  src={[IMG.tripDriver1, IMG.tripDriver2, IMG.tripDriver3, IMG.tripDriver4][i % 4]}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                  alt={trip.driver.name}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                      {trip.id.slice(0, 10)}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getStatusColor(trip.status)}`}>
                      {STATUS_LABELS[trip.status] ?? trip.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{trip.user.name}</span>
                    {' → '}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{trip.driver.name}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{trip.pickup.split(',')[0]} → {trip.dropoff.split(',')[0]}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-primary text-sm">฿{trip.fare.toFixed(2)}</p>
                  <p className="text-[11px] text-slate-400">{new Date(trip.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer (right-side slide-in) */}
      {(detailLoading || selectedTrip) && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={() => setSelectedTrip(null)} />

          {/* Panel */}
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-xl overflow-y-auto flex flex-col">
            {/* Panel header */}
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Trip Detail</h3>
              <button onClick={() => setSelectedTrip(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : selectedTrip ? (
              <div className="p-6 space-y-6">

                {/* Core info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${getStatusColor(selectedTrip.status)}`}>
                      {STATUS_LABELS[selectedTrip.status] ?? selectedTrip.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Trip ID</p>
                    <p className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all">{selectedTrip.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Passenger</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedTrip.passenger?.name ?? '—'}</p>
                    {selectedTrip.passenger?.phone && <p className="text-xs text-slate-400">{selectedTrip.passenger.phone}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Driver</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedTrip.driver?.name ?? '—'}</p>
                    {selectedTrip.driver?.phone && <p className="text-xs text-slate-400">{selectedTrip.driver.phone}</p>}
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Route</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{selectedTrip.pickupAddress}</p>
                    <p className="text-[10px] text-slate-400 my-0.5">→</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{selectedTrip.dropoffAddress}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fare</p>
                    <p className="text-lg font-extrabold text-primary">฿{selectedTrip.lockedFare.toFixed(2)}</p>
                  </div>
                  {selectedTrip.vehicle && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedTrip.vehicle.type}</p>
                      <p className="text-xs text-slate-400">{selectedTrip.vehicle.plateNumber}</p>
                    </div>
                  )}
                  {selectedTrip.actualDistance && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Distance</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedTrip.actualDistance.toFixed(1)} km</p>
                    </div>
                  )}
                </div>

                {/* Cancellation / No-Show info */}
                {(selectedTrip.cancelReason || selectedTrip.cancelledAt) && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-red-500 text-base">cancel</span>
                      <p className="text-sm font-bold text-red-700 dark:text-red-400">Cancellation Details</p>
                    </div>
                    {selectedTrip.cancelledAt && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        At: {new Date(selectedTrip.cancelledAt).toLocaleString()}
                      </p>
                    )}
                    {selectedTrip.cancelReason && (
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1 font-medium">
                        Reason: {selectedTrip.cancelReason}
                      </p>
                    )}
                    {selectedTrip.cancelledBy && (
                      <p className="text-[11px] text-red-500 mt-0.5">By: {selectedTrip.cancelledBy}</p>
                    )}
                  </div>
                )}

                {/* No-show badge */}
                {['NO_SHOW_PASSENGER', 'NO_SHOW_DRIVER'].includes(selectedTrip.status) && (
                  <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
                    <span className="material-symbols-outlined text-orange-500 text-xl">person_off</span>
                    <div>
                      <p className="text-sm font-bold text-orange-700">
                        {selectedTrip.status === 'NO_SHOW_PASSENGER' ? 'Passenger No-Show' : 'Driver No-Show'}
                      </p>
                      <p className="text-xs text-orange-600">Driver waited but {selectedTrip.status === 'NO_SHOW_PASSENGER' ? 'passenger did not appear' : 'driver did not arrive'}</p>
                    </div>
                  </div>
                )}

                {/* Payment Timeline */}
                {selectedTrip.payment && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Payment</p>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">฿{selectedTrip.payment.amount.toFixed(2)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          selectedTrip.payment.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>{selectedTrip.payment.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {selectedTrip.payment.passengerConfirmedAt && (
                          <div>
                            <p className="text-slate-400">Passenger confirmed</p>
                            <p className="font-medium">{new Date(selectedTrip.payment.passengerConfirmedAt).toLocaleString()}</p>
                          </div>
                        )}
                        {selectedTrip.payment.driverConfirmedAt && (
                          <div>
                            <p className="text-slate-400">Driver confirmed</p>
                            <p className="font-medium">{new Date(selectedTrip.payment.driverConfirmedAt).toLocaleString()}</p>
                          </div>
                        )}
                        {selectedTrip.payment.paidAt && (
                          <div>
                            <p className="text-slate-400">Paid at</p>
                            <p className="font-medium">{new Date(selectedTrip.payment.paidAt).toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                      {selectedTrip.payment.disputeFlag && (
                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 rounded-lg p-3 mt-2">
                          <p className="text-xs font-bold text-red-700 mb-1">⚠ Active Dispute</p>
                          {selectedTrip.payment.disputeReason && (
                            <p className="text-xs text-red-600">Reason: {selectedTrip.payment.disputeReason}</p>
                          )}
                          {selectedTrip.payment.disputeRaisedAt && (
                            <p className="text-[11px] text-red-500 mt-0.5">Raised: {new Date(selectedTrip.payment.disputeRaisedAt).toLocaleString()}</p>
                          )}
                        </div>
                      )}
                      {selectedTrip.payment.disputeResolvedAt && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 rounded-lg p-3 mt-2">
                          <p className="text-xs font-bold text-emerald-700 mb-1">✓ Dispute Resolved</p>
                          {selectedTrip.payment.disputeResolutionNote && (
                            <p className="text-xs text-emerald-700">{selectedTrip.payment.disputeResolutionNote}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Status Timeline */}
                {selectedTrip.timeline?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Status Timeline</p>
                    <div className="relative pl-6">
                      {/* Vertical line */}
                      <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
                      <div className="space-y-4">
                        {selectedTrip.timeline.map((step, i) => (
                          <div key={i} className="relative">
                            <div className={`absolute -left-4 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                              step.isTerminalStep ? 'bg-emerald-500' : 'bg-primary'
                            }`} />
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  {step.toStatusEmoji} {step.toStatusLabel}
                                </span>
                                {step.durationLabel && (
                                  <span className="text-[10px] text-slate-400">{step.durationLabel}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                                  step.changedByType === 'ADMIN_OVERRIDE' ? 'bg-amber-100 text-amber-700' :
                                  step.changedByType === 'DRIVER' ? 'bg-blue-100 text-blue-700' :
                                  step.changedByType === 'CUSTOMER' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                                }`}>{step.changedByType}</span>
                                {step.actorName && <span>{step.actorName}</span>}
                                <span className="ml-auto">{new Date(step.createdAt).toLocaleString()}</span>
                              </div>
                              {step.note && (
                                <p className="text-[11px] text-slate-500 italic mt-1">"{step.note}"</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Force Cancel Action */}
                {isCancellable && (
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                    {!showForceCancelConfirm ? (
                      <button
                        onClick={() => setShowForceCancelConfirm(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">cancel</span>
                        Force Cancel Trip
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-bold text-red-600">Confirm force cancellation</p>
                        <textarea
                          value={forceCancelNote}
                          onChange={(e) => setForceCancelNote(e.target.value)}
                          placeholder="Admin note / reason (required)…"
                          rows={3}
                          className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowForceCancelConfirm(false); setForceCancelNote(''); }}
                            className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Abort
                          </button>
                          <button
                            onClick={handleForceCancel}
                            disabled={forceCancelLoading || !forceCancelNote.trim()}
                            className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-red-600 transition-colors"
                          >
                            {forceCancelLoading ? 'Cancelling…' : 'Force Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-bold ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
