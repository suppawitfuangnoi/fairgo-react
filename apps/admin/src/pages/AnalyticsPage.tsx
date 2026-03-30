import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface AnalyticsData {
  revenue: Array<{ date: string; amount: number }>;
  trips: Array<{ date: string; count: number }>;
  topDrivers: Array<{
    id: string;
    name: string;
    trips: number;
    revenue: number;
    rating: number;
  }>;
  summary: {
    totalRevenue: number;
    totalTrips: number;
    avgRating: number;
    activeUsers: number;
  };
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiFetch<AnalyticsData>('/admin/analytics');
      setAnalytics(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (error && !analytics) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate chart heights based on data
  const maxRevenue = analytics?.revenue ? Math.max(...analytics.revenue.map((r) => r.amount)) : 0;
  const maxTrips = analytics?.trips ? Math.max(...analytics.trips.map((t) => t.count)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Analytics
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Platform performance metrics and insights
        </p>
      </div>

      {/* Summary Stats */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              label: 'Total Revenue',
              value: `฿${analytics.summary.totalRevenue.toLocaleString('th-TH', {
                minimumFractionDigits: 2,
              })}`,
              icon: 'payments',
              color: 'from-amber-500 to-amber-400',
            },
            {
              label: 'Total Trips',
              value: analytics.summary.totalTrips.toLocaleString(),
              icon: 'route',
              color: 'from-primary to-cyan-400',
            },
            {
              label: 'Avg Rating',
              value: analytics.summary.avgRating.toFixed(2),
              icon: 'star',
              color: 'from-yellow-500 to-amber-400',
            },
            {
              label: 'Active Users',
              value: analytics.summary.activeUsers.toLocaleString(),
              icon: 'group',
              color: 'from-emerald-500 to-teal-400',
            },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center text-white`}>
                  <span className="material-symbols-outlined">{stat.icon}</span>
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
        </div>
      ) : (
        <>
          {/* Revenue Chart */}
          {analytics?.revenue && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                Revenue Trend (Last 30 Days)
              </h3>
              <div className="flex items-end justify-between gap-2 h-64">
                {analytics.revenue.slice(-30).map((item, idx) => {
                  const height = (item.amount / maxRevenue) * 100;
                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center gap-2 group"
                    >
                      <div className="w-full bg-gradient-to-t from-primary to-cyan-400 rounded-t-lg" style={{ height: `${height}%` }} />
                      <span className="text-xs text-slate-500 dark:text-slate-400 group-hover:font-bold transition-all">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-4">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </div>
          )}

          {/* Trips Chart */}
          {analytics?.trips && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                Trip Volume (Last 30 Days)
              </h3>
              <div className="flex items-end justify-between gap-2 h-64">
                {analytics.trips.slice(-30).map((item, idx) => {
                  const height = (item.count / maxTrips) * 100;
                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center gap-2 group"
                    >
                      <div
                        className="w-full bg-gradient-to-t from-emerald-500 to-green-400 rounded-t-lg"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400 group-hover:font-bold transition-all">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-4">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </div>
          )}

          {/* Top Drivers */}
          {analytics?.topDrivers && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Top Drivers This Month
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Driver
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                        Trips
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                        Revenue
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                        Rating
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {analytics.topDrivers.map((driver, idx) => (
                      <tr
                        key={driver.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm">
                              {idx + 1}
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {driver.name}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">
                          {driver.trips}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                          ฿{driver.revenue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {driver.rating}
                            </span>
                            <span
                              className="material-symbols-outlined text-yellow-400 text-sm"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              star
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
