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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Actual API response shape
interface ApiAnalytics {
  period: string;
  overview: {
    totalTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    completionRate: number;
    newUsers: number;
    newDrivers: number;
    avgRating: number;
    totalRatings: number;
  };
  revenue: {
    totalGMV: number;
    totalCommission: number;
    totalDriverEarnings: number;
  };
  vehicleTypes: Array<{ type: string; count: number }>;
  paymentMethods: Array<{ method: string; count: number }>;
  tripsByDay: Array<{ date: string; count: number; revenue?: number }>;
  topZones: Array<{ zone: string; count: number }>;
}

const PRIMARY = '#13c8ec';
const EMERALD = '#10b981';
const AMBER = '#f59e0b';
const COLORS = ['#13c8ec', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<ApiAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'trips' | 'vehicle' | 'zones'>('trips');

  useEffect(() => { fetchAnalytics(); }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiFetch<ApiAnalytics>('/admin/analytics');
      setAnalytics(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (error && !analytics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-red-500 text-2xl">error</span>
        </div>
        <p className="text-slate-700 dark:text-slate-300 font-semibold mb-1">เกิดข้อผิดพลาด</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
        <button onClick={fetchAnalytics} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  const tripsByDay = analytics?.tripsByDay ?? [];
  const chartData = tripsByDay.map(t => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    trips: t.count,
    revenue: t.revenue ?? 0,
  }));

  const vehicleData = analytics?.vehicleTypes ?? [];
  const zoneData = (analytics?.topZones ?? []).slice(0, 5);

  const summary = analytics ? [
    { label: 'Total Revenue (GMV)', value: `฿${(analytics.revenue.totalGMV || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, icon: 'payments', color: 'from-amber-500 to-amber-400', change: '+12.4%' },
    { label: 'Total Trips', value: (analytics.overview.totalTrips || 0).toLocaleString(), icon: 'route', color: 'from-primary to-cyan-400', change: `${analytics.overview.completionRate.toFixed(0)}% done` },
    { label: 'Avg Rating', value: (analytics.overview.avgRating || 0).toFixed(2), icon: 'star', color: 'from-yellow-500 to-amber-400', change: `${analytics.overview.totalRatings} ratings` },
    { label: 'New Users', value: (analytics.overview.newUsers || 0).toLocaleString(), icon: 'group', color: 'from-emerald-500 to-teal-400', change: `+${analytics.overview.newDrivers} drivers` },
  ] : [];

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
          {summary.map((stat, idx) => (
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
          {/* Trip/Revenue Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-5">
              {(['trips', 'vehicle', 'zones'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`mr-6 pb-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
                    activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}>
                  {tab === 'trips' ? 'Trips by Day' : tab === 'vehicle' ? 'Vehicle Types' : 'Top Zones'}
                </button>
              ))}
            </div>
            <div className="p-6">
              {activeTab === 'trips' && (
                chartData.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-slate-400">No trip data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
                        formatter={(v: number) => [v, 'Trips']} cursor={{ fill: '#f0fdff' }} />
                      <Bar dataKey="trips" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              )}

              {activeTab === 'vehicle' && (
                vehicleData.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-slate-400">No vehicle data</div>
                ) : (
                  <div className="flex items-center justify-center gap-12">
                    <ResponsiveContainer width="50%" height={280}>
                      <PieChart>
                        <Pie data={vehicleData} cx="50%" cy="50%" outerRadius={100} dataKey="count" nameKey="type" label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}>
                          {vehicleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [v, 'Count']} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3">
                      {vehicleData.map((v, i) => (
                        <div key={v.type} className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }}></span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{v.type}</span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white ml-auto">{v.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              {activeTab === 'zones' && (
                zoneData.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-slate-400">No zone data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={zoneData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="zone" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={75} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                        formatter={(v: number) => [v, 'Trips']} />
                      <Bar dataKey="count" fill={AMBER} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              )}
            </div>
          </div>

          {/* Completion Stats */}
          {analytics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Completed Trips', value: analytics.overview.completedTrips, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                { label: 'Cancelled Trips', value: analytics.overview.cancelledTrips, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
                { label: 'Completion Rate', value: `${analytics.overview.completionRate.toFixed(1)}%`, color: 'text-primary', bg: 'bg-primary/10' },
              ].map((stat, i) => (
                <div key={i} className={`${stat.bg} rounded-xl p-6`}>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{stat.label}</p>
                  <p className={`text-3xl font-extrabold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Revenue Breakdown */}
          {analytics && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Revenue Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Total GMV', value: analytics.revenue.totalGMV, icon: 'payments' },
                  { label: 'Commission', value: analytics.revenue.totalCommission, icon: 'percent' },
                  { label: 'Driver Earnings', value: analytics.revenue.totalDriverEarnings, icon: 'drive_eta' },
                ].map((r, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary">{r.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{r.label}</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">฿{(r.value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
