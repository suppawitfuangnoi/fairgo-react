import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { IMG } from '@/lib/assets';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import NotificationBell from '@/components/NotificationBell';

interface Trip {
  id: string;
  route: string;
  fare: number;
  date: string;
  driverName: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { position } = useGeolocation();
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Check for active trip on mount and redirect if found
  useEffect(() => {
    const checkActiveTrip = async () => {
      try {
        const active = await apiFetch<any>('/trips/active');
        const trip = active?.data ?? active;
        if (trip?.id) {
          navigate(`/trip-active/${trip.id}`, { replace: true });
          return;
        }
      } catch {
        // No active trip — stay on home
      }
    };
    checkActiveTrip();
  }, []);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const data = await apiFetch<any>('/trips?limit=5');
        // Handle array or { trips: [] } envelope
        const list = Array.isArray(data) ? data : (data?.trips || data?.data || []);
        setRecentTrips(list.slice(0, 5).map((o: any) => ({
          id: o.id,
          route: (o.dropoffAddress || o.rideRequest?.dropoffAddress || 'ปลายทาง'),
          fare: Number(o.lockedFare ?? o.offer?.fareAmount ?? o.fare ?? 0),
          date: o.startedAt || o.createdAt || '',
          driverName: o.driverProfile?.user?.name || o.driverName || '',
        })));
      } catch (err) {
        console.error('Failed to fetch trips:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, []);

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark overflow-hidden relative flex flex-col font-display">
      {/* Map Background */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <GoogleMap
          center={position}
          zoom={15}
          markers={[{ lat: position.lat, lng: position.lng, color: 'blue', pulse: true, label: 'คุณอยู่ที่นี่' }]}
          className="absolute inset-0 w-full h-full"
          showTraffic={true}
        />
      </div>

      {/* UI Overlay Layer */}
      <div className="relative z-10 flex flex-col justify-between h-full pointer-events-none">
        {/* Top Area: Header */}
        <div className="pt-14 px-5 pointer-events-auto">
          <div className="bg-white dark:bg-bg-dark shadow-float rounded-full p-2 flex items-center gap-3 pr-4 border border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-slate-700 dark:text-white text-xl">
                menu
              </span>
            </button>
            <button
              onClick={() => navigate('/ride-request')}
              className="flex-1 flex items-center gap-2 text-left"
            >
              <span className="material-symbols-outlined text-primary text-base">search</span>
              <span className="text-slate-400 dark:text-slate-500 font-medium text-sm">
                ไปไหนดี?
              </span>
            </button>
            <NotificationBell />
            <button
              onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary/20 shadow-sm shrink-0"
            >
              <img src={IMG.userAvatar} className="w-full h-full object-cover rounded-full" alt="avatar" />
            </button>
          </div>
        </div>

        {/* Bottom Sheet Area */}
        <div className="pointer-events-auto w-full bg-white dark:bg-bg-dark rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.10)] pb-8 pt-2">
          {/* Drag Handle */}
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
          </div>

          <div className="px-6 py-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">
              วางแผนการเดินทาง
            </h2>

            {/* Inputs Container */}
            <div className="relative flex flex-col gap-4 mb-6">
              {/* Connecting Line */}
              <div className="absolute left-[22px] top-[40px] bottom-[40px] w-0.5 border-l-2 border-dashed border-slate-200 dark:border-slate-700 z-0"></div>

              {/* Pickup Input */}
              <div className="relative z-10">
                <div className="bg-background-light dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all">
                  <div className="w-4 h-4 rounded-full border-[3px] border-slate-700 dark:border-white shrink-0 bg-transparent"></div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                      ต้นทาง
                    </label>
                    <input
                      type="text"
                      value="ตำแหน่งปัจจุบัน"
                      readOnly
                      className="w-full bg-transparent border-none p-0 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:ring-0 cursor-default"
                    />
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-lg">
                    my_location
                  </span>
                </div>
              </div>

              {/* Destination Input */}
              <div className="relative z-10">
                <div
                  onClick={() => navigate('/ride-request')}
                  className="bg-background-light dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3 border border-transparent hover:border-primary/30 dark:hover:border-primary/40 transition-all cursor-pointer active:bg-primary/5"
                >
                  <span className="material-symbols-outlined text-primary text-lg shrink-0">
                    location_on
                  </span>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 cursor-pointer">
                      ปลายทาง
                    </label>
                    <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                      เลือกปลายทาง
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-lg">
                    chevron_right
                  </span>
                </div>
              </div>
            </div>

            {/* Horizontal Shortcuts Scroller */}
            <div className="mb-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                ไปที่ไหน
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {[
                  { icon: 'home', label: 'บ้าน', color: 'text-primary' },
                  { icon: 'work', label: 'ที่ทำงาน', color: 'text-slate-600' },
                  { icon: 'local_taxi', label: 'แท็กซี่', color: 'text-amber-500' },
                  { icon: 'two_wheeler', label: 'มอเตอร์', color: 'text-orange-500' },
                  { icon: 'directions_car', label: 'ตุ๊กตุ๊ก', color: 'text-emerald-500' },
                  { icon: 'local_offer', label: 'โปรโมชั่น', color: 'text-pink-500' },
                ].map(({ icon, label, color }) => (
                  <button
                    key={label}
                    onClick={() => navigate('/ride-request')}
                    className="flex-shrink-0 flex flex-col items-center gap-2 py-3 px-4 bg-background-light dark:bg-slate-800/60 hover:bg-primary/5 rounded-xl transition-colors border border-transparent hover:border-primary/20 min-w-[68px]"
                  >
                    <div className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center">
                      <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Trips */}
            {!loading && recentTrips.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  การเดินทางล่าสุด
                </h3>
                <div className="space-y-2">
                  {recentTrips.map((trip) => (
                    <button
                      key={trip.id}
                      onClick={() => navigate('/ride-request')}
                      className="w-full p-3 bg-background-light dark:bg-slate-800/60 rounded-xl hover:bg-primary/5 dark:hover:bg-slate-800 transition-colors text-left flex items-center gap-3 active:scale-[0.98]"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-sm">history</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {trip.route}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {trip.fare > 0 ? `฿${trip.fare.toFixed(0)}` : ''}{trip.driverName ? ` • ${trip.driverName}` : ''}
                        </p>
                      </div>
                      <span className="material-symbols-outlined text-slate-400 text-base">chevron_right</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom safe area spacer */}
          <div className="h-6 w-full"></div>
        </div>
      </div>

      {/* Side Drawer Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[80vw] bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-br from-primary/20 to-transparent px-6 pt-14 pb-6">
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
              <div className="w-16 h-16 rounded-full overflow-hidden border-3 border-white shadow-md mb-3">
                <img src={IMG.userAvatar} className="w-full h-full object-cover" alt="avatar" />
              </div>
              <p className="font-bold text-gray-900 dark:text-white text-lg">บัญชีของฉัน</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">FairGo Customer</p>
            </div>

            {/* Menu Items */}
            <div className="flex-1 px-4 py-4 space-y-1">
              {[
                { icon: 'person', label: 'โปรไฟล์ของฉัน', path: '/profile' },
                { icon: 'directions_car', label: 'เรียกรถ', path: '/ride-request' },
                { icon: 'history', label: 'ประวัติการเดินทาง', path: '/history' },
                { icon: 'local_offer', label: 'โปรโมชั่นและส่วนลด', path: '/ride-request' },
                { icon: 'payment', label: 'วิธีการชำระเงิน', path: '/profile' },
                { icon: 'notifications', label: 'การแจ้งเตือน', path: '/notifications' },
                { icon: 'help_outline', label: 'ความช่วยเหลือ', path: '/profile' },
                { icon: 'settings', label: 'ตั้งค่า', path: '/profile' },
              ].map(({ icon, label, path }) => (
                <button
                  key={label}
                  onClick={() => { setDrawerOpen(false); navigate(path); }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <span className="material-icons-round text-sm">{icon}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
                  <span className="material-icons-round text-gray-300 dark:text-gray-600 text-sm ml-auto">chevron_right</span>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-6 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => {
                  localStorage.removeItem('fg_access_token');
                  localStorage.removeItem('fg_refresh_token');
                  localStorage.removeItem('fg_user');
                  setDrawerOpen(false);
                  navigate('/login', { replace: true });
                }}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-100 transition-colors"
              >
                <span className="material-icons-round">logout</span>
                ออกจากระบบ
              </button>
              <p className="text-center text-xs text-gray-400 mt-4">FAIRGO v2.0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
