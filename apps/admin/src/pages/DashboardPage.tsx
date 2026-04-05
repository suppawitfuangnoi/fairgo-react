import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { socketClient } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { IMG } from '@/lib/assets';

interface DashboardData {
  totalUsers: number;
  activeDrivers: number;
  totalTripsToday: number;
  revenueToday: number;
}

interface Trip {
  id: string;
  user: { name: string };
  driver: { name: string };
  pickup: string;
  dropoff: string;
  fare: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'CANCELLED';
  createdAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();

    // Connect socket for real-time dashboard updates
    const socket = socketClient.connect();
    
    const handleTripUpdate = (data: any) => {
      // Silently refetch data on update
      apiFetch<DashboardData>('/admin/dashboard').then(setStats).catch(console.error);
      apiFetch<{ trips: Trip[] }>('/admin/trips?limit=10').then(res => setTrips(res.trips || [])).catch(console.error);
      if (data?.status === 'COMPLETED') toast.success('Trip completed');
      else if (data?.type === 'new_request') toast.info('New ride request incoming');
    };

    socket.on('trip:status', handleTripUpdate);
    socket.on('trip:created', handleTripUpdate);
    socket.on('ride:new_request', handleTripUpdate);

    return () => {
      socket.off('trip:status', handleTripUpdate);
      socket.off('trip:created', handleTripUpdate);
      socket.off('ride:new_request', handleTripUpdate);
      // Wait to disconnect until App unmounts ideally, but here we can just clean listeners
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [dashboardRes, tripsRes] = await Promise.all([
        apiFetch<DashboardData>('/admin/dashboard'),
        apiFetch<{ trips: Trip[] }>('/admin/trips?limit=10'),
      ]);
      setStats(dashboardRes);
      setTrips(tripsRes.trips || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
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
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  if (error && !stats) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Overview Dashboard
        </h2>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'Active Trips',
            value: stats?.totalTripsToday || 0,
            icon: 'route',
            trend: '+12.5%',
          },
          {
            label: 'Total Revenue',
            value: `฿${(stats?.revenueToday || 0).toLocaleString('th-TH', { minimumFractionDigits: 0 })}`,
            icon: 'payments',
            trend: '+8.2%',
          },
          {
            label: 'New Users',
            value: stats?.totalUsers || 0,
            icon: 'person_add',
            trend: '-3.1%',
          },
          {
            label: 'Active Drivers',
            value: stats?.activeDrivers || 0,
            icon: 'airline_stops',
            trend: '+5.4%',
          },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">{stat.icon}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                stat.trend.startsWith('-')
                  ? 'text-red-500 bg-red-100 dark:bg-red-500/10'
                  : 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10'
              }`}>
                {stat.trend}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
            <h3 className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white">Trips vs Revenue</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Performance insights over the last 7 days
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Export CSV
            </button>
            <button className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white">
              Daily
            </button>
          </div>
        </div>
        <div className="w-full h-72">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 250">
            <defs>
              <linearGradient id="chart-gradient-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#13c8ec" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#13c8ec" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            <line
              stroke="#f1f5f9"
              strokeWidth="1"
              x1="0"
              x2="800"
              y1="50"
              y2="50"
              className="dark:stroke-slate-800"
            />
            <line
              stroke="#f1f5f9"
              strokeWidth="1"
              x1="0"
              x2="800"
              y1="100"
              y2="100"
              className="dark:stroke-slate-800"
            />
            <line
              stroke="#f1f5f9"
              strokeWidth="1"
              x1="0"
              x2="800"
              y1="150"
              y2="150"
              className="dark:stroke-slate-800"
            />
            <line
              stroke="#f1f5f9"
              strokeWidth="1"
              x1="0"
              x2="800"
              y1="200"
              y2="200"
              className="dark:stroke-slate-800"
            />
            {/* Area Chart */}
            <path
              fill="url(#chart-gradient-fill)"
              d="M0,200 L114,120 L228,150 L342,80 L456,100 L570,50 L684,70 L800,40 L800,250 L0,250 Z"
            />
            {/* Line Chart */}
            <path
              d="M0,200 L114,120 L228,150 L342,80 L456,100 L570,50 L684,70 L800,40"
              fill="none"
              stroke="#13c8ec"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {/* Points */}
            {[114, 228, 342, 456, 570, 684, 800].map((cx, idx) => {
              const cys = [120, 150, 80, 100, 50, 70, 40];
              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={cys[idx]}
                  r="4"
                  fill="#13c8ec"
                  stroke="white"
                  strokeWidth="2"
                />
              );
            })}
          </svg>
          <div className="flex justify-between mt-4 px-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span key={day} className="text-xs font-bold text-slate-400">
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-lg font-bold text-slate-900 dark:text-white">Recent Activity</h4>
          <button className="text-sm font-bold text-primary hover:underline">View All Trips</button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
            </div>
          ) : trips.length > 0 ? (
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Route
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Fare
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {trips.map((trip) => (
                  <tr
                    key={trip.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                      {trip.user.name}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                      {trip.driver.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-400">From</span>
                        <span className="text-sm text-slate-900 dark:text-white">{trip.pickup}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">
                      ฿{trip.fare.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusColor(
                          trip.status
                        )}`}
                      >
                        {trip.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-400">
                      {new Date(trip.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <p>No trips found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
