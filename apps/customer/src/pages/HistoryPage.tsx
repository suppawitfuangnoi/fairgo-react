import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

interface HistoryTrip {
  id: string;
  route: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  date: string;
  time: string;
  driverName: string;
  status: 'COMPLETED' | 'CANCELLED';
  distance: number;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<HistoryTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const response = await apiFetch<any>(`/trips?limit=20&page=${page}`);
        // API may return array directly, or { trips: [...], hasMore: bool }, or { data: [...] }
        const rawTrips: any[] = Array.isArray(response)
          ? response
          : Array.isArray(response?.trips)
          ? response.trips
          : Array.isArray(response?.data)
          ? response.data
          : [];
        const mapped: HistoryTrip[] = rawTrips.map((o: any) => {
          const dropoff =
            o.dropoffAddress ||
            o.rideRequest?.dropoffAddress ||
            o.rideRequest?.customerProfile?.dropoffAddress ||
            'ปลายทาง';
          const pickup =
            o.pickupAddress ||
            o.rideRequest?.pickupAddress ||
            o.rideRequest?.customerProfile?.pickupAddress ||
            'ต้นทาง';
          const fare = o.lockedFare ?? o.offer?.fareAmount ?? o.fare ?? 0;
          const distance = o.actualDistance
            ? Number(o.actualDistance)
            : o.estimatedDistance
            ? Number(o.estimatedDistance)
            : (o.distance ?? 0);
          const dateStr = o.startedAt || o.createdAt || o.date || new Date().toISOString();
          const driverName =
            o.driverProfile?.user?.name ||
            o.driver?.name ||
            o.driverName ||
            '';
          return {
            id: o.id,
            route: `${pickup} → ${dropoff}`,
            pickupAddress: pickup,
            dropoffAddress: dropoff,
            fare: Number(fare),
            date: dateStr,
            time: dateStr,
            driverName,
            status: o.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
            distance: Number(distance),
          };
        });
        if (page === 1) {
          setTrips(mapped);
        } else {
          setTrips((prev) => [...prev, ...mapped]);
        }
        const hasMoreVal =
          response?.hasMore ??
          response?.pagination?.hasMore ??
          response?.meta?.hasMore ??
          false;
        setHasMore(Boolean(hasMoreVal));
      } catch (err) {
        console.error('Failed to fetch trips:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, [page]);

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch { return '—'; }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch { return '—'; }
  };

  if (loading && trips.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-background-light dark:bg-background-dark font-display">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-6 py-4 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-primary hover:text-primary-dark transition-colors mb-3 font-semibold"
        >
          <span className="material-icons-round">arrow_back</span>
          <span>กลับ</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          ประวัติการเดินทาง
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          การเดินทางทั้งหมด {trips.length}
        </p>
      </div>

      {/* Trip List */}
      <div className="px-6 py-4 space-y-3">
        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="material-icons-round text-6xl text-slate-300 dark:text-slate-600 mb-4">
              history
            </span>
            <p className="text-slate-500 dark:text-slate-400 text-center">
              ไม่มีประวัติการเดินทาง
            </p>
          </div>
        ) : (
          trips.map((trip) => (
            <button
              key={trip.id}
              onClick={() => navigate(`/trip-summary/${trip.id}`)}
              className="w-full flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left shadow-sm border border-slate-100 dark:border-slate-700"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-primary">
                  {trip.status === 'COMPLETED'
                    ? 'check_circle'
                    : 'cancel'}
                </span>
              </div>

              {/* Trip Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {trip.dropoffAddress}
                  </p>
                  <p className="text-lg font-bold text-primary shrink-0">
                    ฿{trip.fare.toFixed(0)}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{formatDate(trip.date)}</span>
                  <span>•</span>
                  <span>{formatTime(trip.time)}</span>
                  <span>•</span>
                  <span>{trip.distance.toFixed(1)} km</span>
                </div>

                {trip.driverName && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {trip.driverName}
                  </p>
                )}
              </div>

              {/* Arrow */}
              <span className="material-icons-round text-slate-400 shrink-0">
                arrow_forward
              </span>
            </button>
          ))
        )}

        {/* Load More Button */}
        {hasMore && trips.length > 0 && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="px-6 py-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
            >
              {loading ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Safe Area */}
      <div className="h-8"></div>
    </div>
  );
}
