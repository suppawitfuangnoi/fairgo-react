import { useState, useEffect } from 'react';
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

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchTrips();
    if (tab === 'active') {
      const interval = setInterval(fetchTrips, 10000);
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    }
  }, [tab]);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const status = tab === 'all' ? '' : tab.toUpperCase();
      const response = await apiFetch<{ trips: Trip[] }>(
        `/admin/trips?${status ? `status=${status}` : ''}&limit=50`
      );
      setTrips(response.trips || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!trips.length) return;
    const headers = ['Trip ID', 'User', 'Driver', 'Pickup', 'Dropoff', 'Fare', 'Status', 'Time'];
    const rows = trips.map((t) => [
      t.id,
      t.user.name,
      t.driver.name,
      t.pickup,
      t.dropoff,
      `฿${t.fare.toFixed(2)}`,
      t.status,
      new Date(t.createdAt).toLocaleString(),
    ]);

    const csv =
      '\ufeff' +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `trips-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getStatusColor = (status: string) => {
    if (['COMPLETED'].includes(status)) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
    if (['IN_PROGRESS', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'PICKUP_CONFIRMED', 'ARRIVED_DESTINATION', 'AWAITING_CASH_CONFIRMATION'].includes(status)) return 'bg-primary/10 text-primary';
    if (['CANCELLED', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_CUSTOMER', 'TIMED_OUT'].includes(status)) return 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
    if (['DRIVER_ASSIGNED', 'PENDING'].includes(status)) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
    return 'bg-slate-100 text-slate-600';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRIVER_ASSIGNED: 'Assigned',
      DRIVER_EN_ROUTE: 'En Route',
      DRIVER_ARRIVED: 'Arrived',
      PICKUP_CONFIRMED: 'Picked Up',
      IN_PROGRESS: 'In Progress',
      ARRIVED_DESTINATION: 'At Destination',
      AWAITING_CASH_CONFIRMATION: 'Awaiting Payment',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      CANCELLED_BY_DRIVER: 'Cancelled (Driver)',
      CANCELLED_BY_CUSTOMER: 'Cancelled (Customer)',
      TIMED_OUT: 'Timed Out',
      DISPUTED: 'Disputed',
    };
    return labels[status] || status;
  };

  const tabCounts = {
    all: trips.length,
    active: trips.filter((t) => t.status === 'IN_PROGRESS').length,
    completed: trips.filter((t) => t.status === 'COMPLETED').length,
    cancelled: trips.filter((t) => t.status === 'CANCELLED').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          All Trips
        </h2>
      </div>

      {/* Filters Section */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {[
          { key: 'all' as const, label: 'All Trips', count: tabCounts.all },
          { key: 'active' as const, label: 'Active', count: tabCounts.active },
          { key: 'completed' as const, label: 'Completed', count: tabCounts.completed },
          { key: 'cancelled' as const, label: 'Cancelled', count: tabCounts.cancelled },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t.label} {t.count !== undefined ? `(${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
          filter_list
        </span>
        <input
          type="text"
          placeholder="Filter by ID or Driver..."
          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary text-slate-900 dark:text-white"
        />
      </div>

      {/* Trips List */}
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
          </div>
        ) : trips.length > 0 ? (
          trips.map((trip) => (
            <div
              key={trip.id}
              className="bg-white dark:bg-slate-900 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer border-l-4 border-transparent hover:border-primary transition-colors"
              onClick={() => setSelectedTrip(trip)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded">
                    ID: {trip.id.slice(0, 4)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {trip.status === 'IN_PROGRESS' ? '12 min elapsed' : 'Completed'}
                  </span>
                </div>
                <span className="text-primary font-bold text-sm">฿{trip.fare.toFixed(2)}</span>
              </div>
              <div className="flex gap-3 mb-3">
                <div className="flex flex-col items-center gap-0.5 pt-1">
                  <div className="size-2 rounded-full border-2 border-primary"></div>
                  <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                  <div className="size-2 rounded-full bg-primary"></div>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-slate-500 truncate">
                    {trip.pickup.split(',')[0] || trip.pickup}
                  </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {trip.dropoff.split(',')[0] || trip.dropoff}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={[IMG.tripDriver1, IMG.tripDriver2, IMG.tripDriver3, IMG.tripDriver4][trips.indexOf(trip) % 4]} className="size-8 rounded-full object-cover" alt={trip.driver.name} />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
                      Driver
                    </p>
                    <p className="text-xs font-bold">{trip.driver.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
                      User
                    </p>
                    <p className="text-xs font-bold">{trip.user.name}</p>
                  </div>
                  <img src={[IMG.tripUser1, IMG.tripUser2, IMG.tripUser3, IMG.tripUser4][trips.indexOf(trip) % 4]} className="size-8 rounded-full object-cover" alt={trip.user.name} />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-slate-500">No trips found</div>
        )}
      </div>

      {/* Trip Detail Modal */}
      {selectedTrip && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedTrip(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Trip Details
              </h3>
              <button
                onClick={() => setSelectedTrip(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Trip ID
                </p>
                <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  {selectedTrip.id}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Passenger
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedTrip.user.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Driver
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedTrip.driver.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pickup
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedTrip.pickup}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Dropoff
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedTrip.dropoff}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Fare
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    ฿{selectedTrip.fare.toFixed(2)}
                  </p>
                </div>
                {selectedTrip.distance && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Distance
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {selectedTrip.distance} km
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Status
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full mt-1 ${getStatusColor(
                    selectedTrip.status
                  )}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {getStatusLabel(selectedTrip.status)}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Time
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {new Date(selectedTrip.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
