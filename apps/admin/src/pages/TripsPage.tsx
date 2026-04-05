import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface Trip {
  id: string;
  user: { name: string };
  driver: { name: string };
  pickup: string;
  dropoff: string;
  fare: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'PENDING';
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
      const response = await apiFetch<{ data: Trip[] }>(
        `/admin/trips?${status ? `status=${status}` : ''}&limit=50`
      );
      setTrips(response.data || []);
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
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
      case 'IN_PROGRESS':
        return 'bg-primary/10 text-primary';
      case 'CANCELLED':
        return 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
      case 'PENDING':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      default:
        return 'bg-slate-100 text-slate-600';
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Trip Monitoring
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Monitor live and historical trip data
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">download</span>
          Export Trips
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {[
          { key: 'all' as const, label: 'All', count: tabCounts.all },
          { key: 'active' as const, label: 'Active', count: tabCounts.active },
          { key: 'completed' as const, label: 'Completed', count: tabCounts.completed },
          { key: 'cancelled' as const, label: 'Cancelled', count: tabCounts.cancelled },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-primary text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            </div>
          ) : trips.length > 0 ? (
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Trip ID
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Passenger
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Pickup
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Dropoff
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Fare
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {trips.map((trip) => (
                  <tr
                    key={trip.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {trip.id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                      {trip.user.name}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                      {trip.driver.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {trip.pickup.split(',')[0]}
                        </p>
                        <p className="text-xs text-slate-500">{trip.pickup.split(',')[1]}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {trip.dropoff.split(',')[0]}
                        </p>
                        <p className="text-xs text-slate-500">{trip.dropoff.split(',')[1]}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">
                      ฿{trip.fare.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full inline-block ${getStatusColor(
                          trip.status
                        )}`}
                      >
                        {trip.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-400">
                      {new Date(trip.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedTrip(trip)}
                        className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                        title="View Details"
                      >
                        <span className="material-symbols-outlined text-xl">visibility</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-500">No trips found</div>
          )}
        </div>
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
                  {selectedTrip.status}
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
