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
        const response = await apiFetch<{ trips: HistoryTrip[]; hasMore: boolean }>(
          `/trips?limit=20&page=${page}`
        );
        if (page === 1) {
          setTrips(response.trips || []);
        } else {
          setTrips((prev) => [...prev, ...(response.trips || [])]);
        }
        setHasMore(response.hasMore || false);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
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
