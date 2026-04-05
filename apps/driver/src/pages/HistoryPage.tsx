import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import BottomNav from '@/components/BottomNav';

interface Trip {
  id: string;
  status: string;
  fare: number;
  distance: number;
  pickupAddress: string;
  dropoffAddress: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  customer?: { name: string; avatarUrl?: string };
}

const STATUS_FILTERS = ['All', 'Completed', 'Cancelled'];

export default function HistoryPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchTrips(1, filter);
  }, [filter]);

  async function fetchTrips(p: number, f: string) {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const statusParam = f === 'All' ? '' : `&status=${f.toUpperCase()}`;
      const res = await apiFetch<any>(`/trips?page=${p}&limit=15${statusParam}`);
      const rawList: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.trips) ? res.trips
        : Array.isArray(res?.data) ? res.data
        : [];
      const tripList: Trip[] = rawList.map((o: any) => ({
        id: o.id,
        status: o.status,
        fare: Number(o.lockedFare ?? o.offer?.fareAmount ?? o.fare ?? 0),
        distance: o.actualDistance ? Number(o.actualDistance) : o.estimatedDistance ? Number(o.estimatedDistance) : Number(o.distance ?? 0),
        pickupAddress: o.pickupAddress || o.rideRequest?.pickupAddress || 'ต้นทาง',
        dropoffAddress: o.dropoffAddress || o.rideRequest?.dropoffAddress || 'ปลายทาง',
        completedAt: o.completedAt,
        cancelledAt: o.cancelledAt,
        createdAt: o.createdAt || o.startedAt,
        customer: o.customer || (o.rideRequest?.customerProfile?.user ? {
          name: o.rideRequest.customerProfile.user.name || o.rideRequest.customerProfile.user.phone || 'ผู้โดยสาร',
          avatarUrl: o.rideRequest.customerProfile.user.avatarUrl,
        } : undefined),
      }));
      if (p === 1) setTrips(tripList);
      else setTrips(prev => [...prev, ...tripList]);
      setHasMore(tripList.length === 15);
      setPage(p);
    } catch {
      if (p === 1) setTrips([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function handleFilterChange(f: string) {
    setFilter(f);
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    if (diffDays < 7) return `${diffDays} days ago, ${timeStr}`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-600';
      case 'CANCELLED':
        return 'bg-red-100 text-red-500';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-600';
      default:
        return 'bg-slate-100 text-slate-500';
    }
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[#f6f8f8] flex flex-col relative">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/home')}
            className="p-2 rounded-full hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-600">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-slate-800">Trip History</h1>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === f
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Trip List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-28">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white p-4 rounded-xl shadow-sm animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                  </div>
                  <div className="w-16 h-5 bg-slate-100 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-slate-400 text-4xl">route</span>
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No trips found</h3>
            <p className="text-sm text-slate-400">
              {filter === 'All' ? 'Your trip history will appear here.' : `No ${filter.toLowerCase()} trips yet.`}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {trips.map((trip) => {
                const date = trip.completedAt || trip.cancelledAt || trip.createdAt;
                const isCompleted = trip.status === 'COMPLETED';
                return (
                  <button
                    key={trip.id}
                    onClick={() => isCompleted && navigate(`/trip-summary/${trip.id}`)}
                    className="w-full bg-white p-4 rounded-xl shadow-sm flex items-start gap-4 hover:shadow-md active:scale-[0.99] transition-all text-left"
                  >
                    {/* Icon */}
                    <div className={`p-2.5 rounded-xl ${isCompleted ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                      <span className="material-symbols-outlined text-xl">
                        {isCompleted ? 'local_taxi' : 'cancel'}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-bold text-slate-800 truncate">
                          {trip.pickupAddress?.split(',')[0] || 'Pickup'}
                          <span className="text-slate-300 mx-1">→</span>
                          {trip.dropoffAddress?.split(',')[0] || 'Dropoff'}
                        </h4>
                        {isCompleted && (
                          <span className="text-sm font-bold text-primary shrink-0">
                            {`+\u0E3F${trip.fare?.toFixed(2) ?? '0.00'}`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{formatDate(date)}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${getStatusStyle(trip.status)}`}>
                          {trip.status.replace('_', ' ')}
                        </span>
                        {trip.distance > 0 && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {trip.distance.toFixed(1)} km
                          </span>
                        )}
                      </div>
                    </div>

                    {isCompleted && (
                      <span className="material-symbols-outlined text-slate-300 text-sm shrink-0 mt-1">chevron_right</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => fetchTrips(page + 1, filter)}
                  disabled={loadingMore}
                  className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                      Loading...
                    </span>
                  ) : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
