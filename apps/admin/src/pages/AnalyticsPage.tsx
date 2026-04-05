import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

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

function mergeChartData(
  revenue: Array<{ date: string; amount: number }>,
  trips: Array<{ date: string; count: number }>
) {
  const map = new Map<string, { date: string; revenue: number; trips: number }>();
  revenue.forEach(r => {
    const label = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    map.set(label, { date: label, revenue: r.amount, trips: 0 });
  });
  trips.forEach(t => {
    const label = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const existing = map.get(label);
    if (existing) existing.trips = t.count;
    else map.set(label, { date: label, revenue: 0, trips: t.count });
  });
  return Array.from(map.values()).slice(-30);
}

const PRIMARY = '#13c8ec';
const EMERALD = '#10b981';
const AMBER = '#f59e0b';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'revenue' | 'trips' | 'combined'>('revenue');

  useEffect(() => { fetchAnalytics(); }, []);

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
        <button onClick={fetchAnalytics} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">Retry</button>
      </div>
    );
  }

  const chartData = analytics ? mergeChartData(analytics.revenue, analytics.trips) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Analytics</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Platform performance metrics and insights</p>
        </div>
        <button onClick={fetchAnalytics} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          <span className="material-symbols-outlined text-sm">refresh</span>Refresh
        </button>
      </div>

      {/* Summary Stats */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Total Revenue', value: `฿${analytics.summary.totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, icon: 'payments', color: 'from-amber-500 to-amber-400', change: '+12.4%' },
            { label: 'Total Trips', value: analytics.summary.totalTrips.toLocaleString(), icon: 'route', color: 'from-primary to-cyan-400', change: '+8.1%' },
            { label: 'Avg Rating', value: analytics.summary.avgRating.toFixed(2), icon: 'star', color: 'from-yellow-500 to-amber-400', change: '+0.3' },
            { label: 'Active Users', value: analytics.summary.activeUsers.toLocaleString(), icon: 'group', color: 'from-emerald-500 to-teal-400', change: '+5.7%' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center text-white`}>
                  <span className="material-symbols-outlined">{stat.icon}</span>
                </div>
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">{stat.change}</span>
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {loading ? (
        <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div></div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-5">
              {(['revenue', 'trips', 'combined'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`mr-6 pb-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
                    activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}>
                  {tab === 'combined' ? 'Revenue & Trips' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 uppercase tracking-wider font-semibold">Last 30 Days</p>

              {activeTab === 'revenue' && (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
                      formatter={(v: number) => [`฿${v.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, 'Revenue']} />
                    <Area type="monotone" dataKey="revenue" stroke={PRIMARY} strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: PRIMARY }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'trips' && (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
                      formatter={(v: number) => [v, 'Trips']} cursor={{ fill: '#f0fdff' }} />
                    <Bar dataKey="trips" fill={EMERALD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'combined' && (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis yAxisId="rev" orientation="left" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="trp" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                    <Line yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue (฿)" stroke={PRIMARY} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                    <Line yAxisId="trp" type="monotone" dataKey="trips" name="Trips" stroke={EMERALD} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top Drivers */}
          {analytics?.topDrivers && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Top Drivers This Month</h3>
                <span className="text-xs text-slate-400 font-medium">by Revenue</span>
              </div>
              <div className="p-6 pb-4">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart
                    data={analytics.topDrivers.slice(0, 5).map(d => ({ name: d.name.split(' ')[0], revenue: d.revenue }))}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    barSize={32}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                      formatter={(v: number) => [`฿${v.toFixed(2)}`, 'Revenue']} />
                    <Bar dataKey="revenue" fill={AMBER} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['Driver', 'Trips', 'Revenue', 'Rating'].map(h => (
                        <th key={h} className={`px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider ${h !== 'Driver' ? 'text-center' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {analytics.topDrivers.map((driver, idx) => (
                      <tr key={driver.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">{idx + 1}</div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{driver.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">{driver.trips}</td>
                        <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">฿{driver.revenue.toFixed(2)}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{driver.rating}</span>
                            <span className="material-symbols-outlined text-yellow-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
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
