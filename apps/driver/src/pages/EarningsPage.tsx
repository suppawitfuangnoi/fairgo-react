import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';
import BottomNav from '@/components/BottomNav';

interface WalletData {
  balance: number;
  totalEarnings: number;
  totalTrips: number;
  onlineHours: number;
}

interface Trip {
  id: string;
  status: string;
  fare: number;
  distance: number;
  pickupAddress: string;
  dropoffAddress: string;
  completedAt: string;
  hasTip?: boolean;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function EarningsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [period, setPeriod] = useState<'weekly' | 'daily'>('weekly');
  const [chartData, setChartData] = useState<number[]>([45, 60, 30, 85, 100, 75, 20]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [walletRes, tripsRes] = await Promise.all([
        apiFetch<{ data: WalletData }>('/api/v1/wallet'),
        apiFetch<{ data: Trip[] }>('/api/v1/trips?status=COMPLETED&limit=10'),
      ]);
      if (walletRes.data) setWallet(walletRes.data);
      if (tripsRes.data) setTrips(tripsRes.data);
    } catch {
      // Use mock data if API unavailable
      setWallet({ balance: 845.50, totalEarnings: 2340.00, totalTrips: 42, onlineHours: 38.5 });
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) return;
    setWithdrawing(true);
    try {
      await apiFetch('/api/v1/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      await fetchData();
      setShowWithdrawModal(false);
      setWithdrawAmount('');
    } catch (err: any) {
      alert(err?.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const maxBar = Math.max(...chartData, 1);

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[#f6f8f8] flex flex-col relative overflow-hidden">
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 px-5 pt-4">
        {/* Header */}
        <header className="mb-6">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm">
                <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-lg">person</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Welcome back,</p>
                <h2 className="text-sm font-bold text-slate-800">{user?.name || 'Driver'}</h2>
              </div>
            </div>
            <button
              onClick={() => navigate('/home')}
              className="p-2 rounded-full bg-white shadow-sm text-slate-400 hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-lg">notifications</span>
            </button>
          </div>

          {/* Balance Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-2xl"></div>
            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl"></div>
            <div className="relative z-10 text-center">
              <p className="text-sm font-medium text-slate-400 mb-1">Total Balance</p>
              {loading ? (
                <div className="h-10 w-32 bg-slate-100 animate-pulse rounded-lg mx-auto mb-6"></div>
              ) : (
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-6">
                  ${(wallet?.balance ?? 0).toFixed(2)}
                </h1>
              )}
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="w-full bg-primary hover:bg-[#0ea5c6] text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span>Withdraw Funds</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </header>

        {/* Earnings Chart Section */}
        <section className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">Earnings</h3>
            <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-semibold">
              <button
                onClick={() => setPeriod('weekly')}
                className={`px-4 py-1.5 rounded-md transition-all ${period === 'weekly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
              >
                Weekly
              </button>
              <button
                onClick={() => setPeriod('daily')}
                className={`px-4 py-1.5 rounded-md transition-all ${period === 'daily' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
              >
                Daily
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm">
            {/* Stats */}
            <div className="flex justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="text-center w-1/2 border-r border-slate-100">
                <p className="text-xs text-slate-400 mb-1">Total Trips</p>
                <p className="text-lg font-bold text-slate-800">{wallet?.totalTrips ?? 42}</p>
              </div>
              <div className="text-center w-1/2">
                <p className="text-xs text-slate-400 mb-1">Online Hours</p>
                <p className="text-lg font-bold text-slate-800">{wallet?.onlineHours ?? 38.5}h</p>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="h-40 flex items-end justify-between gap-2 pt-2 px-1">
              {chartData.map((val, i) => {
                const heightPct = Math.round((val / maxBar) * 100);
                const isToday = i === new Date().getDay() - 1;
                return (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1 group">
                    <div className="w-full bg-primary/20 rounded-t-md relative h-32 flex items-end overflow-hidden">
                      <div
                        className={`w-full bg-primary rounded-t-md transition-colors group-hover:bg-[#0ea5c6] ${isToday ? 'shadow-[0_0_15px_rgba(19,200,236,0.5)]' : ''}`}
                        style={{ height: `${heightPct}%` }}
                      ></div>
                    </div>
                    <span className={`text-[10px] font-medium ${isToday ? 'text-primary font-bold' : 'text-slate-400'}`}>
                      {DAYS[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Recent Trips */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">Recent Trips</h3>
            <button
              onClick={() => navigate('/history')}
              className="text-xs font-semibold text-primary hover:text-[#0ea5c6]"
            >
              View All
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white p-4 rounded-xl shadow-sm animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
              <p className="text-sm">No completed trips yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2.5 rounded-lg text-primary">
                      <span className="material-symbols-outlined text-xl">local_taxi</span>
                    </div>
                    <div>
                      <div className="flex flex-col gap-0.5 mb-1.5">
                        <h4 className="text-sm font-bold text-slate-800">
                          {trip.pickupAddress?.split(',')[0] || 'Pickup'}
                          <span className="text-slate-300 mx-1">→</span>
                          {trip.dropoffAddress?.split(',')[0] || 'Dropoff'}
                        </h4>
                        <p className="text-xs text-slate-400">{formatTime(trip.completedAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Paid
                        </span>
                        {trip.hasTip && (
                          <span className="bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[10px]">star</span> Tip
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary mb-1">+${trip.fare?.toFixed(2) ?? '0.00'}</p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {trip.distance ? `${trip.distance.toFixed(1)} km` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="h-8"></div>
      </main>

      {/* Bottom Nav */}
      <BottomNav />

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 pb-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-800">Withdraw Funds</h2>
              <button onClick={() => setShowWithdrawModal(false)} className="text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1">Available Balance</p>
              <p className="text-2xl font-bold text-primary">${(wallet?.balance ?? 0).toFixed(2)}</p>
            </div>
            <div className="mb-6">
              <label className="text-sm font-medium text-slate-700 mb-2 block">Amount to Withdraw</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAmount}
              className="w-full bg-primary text-white font-semibold py-4 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {withdrawing ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Confirm Withdrawal</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
