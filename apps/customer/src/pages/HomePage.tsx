import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { IMG } from '@/lib/assets';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';

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
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-full p-2 flex items-center gap-3 pr-4 ring-1 ring-black/5 border border-gray-100 dark:border-gray-700">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <span className="material-icons-round text-gray-800 dark:text-white">
                menu
              </span>
            </button>
            <div className="flex-1">
              <button
                onClick={() => navigate('/ride-request')}
                className="flex items-center gap-2 w-full text-left"
              >
                <div className="w-2 h-2 rounded-full bg-primary"></div>
                <span className="text-gray-400 dark:text-gray-500 font-medium text-sm">
                  ไปไหนดี?
                </span>
              </button>
            </div>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white dark:border-gray-600 shadow-sm">
              <img src={IMG.userAvatar} className="w-full h-full object-cover rounded-full" alt="avatar" />
            </div>
          </div>
        </div>

        {/* Bottom Sheet Area */}
        <div className="pointer-events-auto w-full bg-white dark:bg-gray-900 rounded-t-3xl shadow-lg shadow-black/10 pb-8 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* Drag Handle */}
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
          </div>

          <div className="px-6 py-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              วางแผนการเดินทาง
            </h2>

            {/* Inputs Container */}
            <div className="relative flex flex-col gap-4 mb-6">
              {/* Connecting Line */}
              <div className="absolute left-[22px] top-[40px] bottom-[40px] w-0.5 border-l-2 border-dashed border-gray-300 dark:border-gray-700 z-0"></div>

              {/* Pickup Input */}
              <div className="relative z-10 group">
                <div className="bg-background-light dark:bg-background-dark rounded-xl p-4 flex items-center gap-4 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                  <div className="w-5 h-5 rounded-full border-[3px] border-gray-800 dark:border-white shrink-0 bg-transparent"></div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                      Pick-up
                    </label>
                    <input
                      type="text"
                      value="ตำแหน่งปัจจุบัน"
                      readOnly
                      className="w-full bg-transparent border-none p-0 text-sm font-semibold text-gray-800 dark:text-gray-200 focus:ring-0"
                    />
                  </div>
                  <span className="material-icons-round text-gray-400 text-lg">
                    my_location
                  </span>
                </div>
              </div>

              {/* Destination Input */}
              <div className="relative z-10 group">
                <div className="bg-background-light dark:bg-background-dark rounded-xl p-4 flex items-center gap-4 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-all shadow-sm cursor-text">
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                    <span className="material-icons-round text-primary text-2xl">
                      location_on
                    </span>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">
                      ไปไหนดี?
                    </label>
                    <button
                      onClick={() => navigate('/ride-request')}
                      className="w-full text-left bg-transparent border-none p-0 text-base font-semibold text-gray-400 hover:text-gray-900 dark:hover:text-white focus:ring-0 transition-colors"
                    >
                      เลือกปลายทาง
                    </button>
                  </div>
                  <button className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500">
                    <span className="material-icons-round text-sm">add</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                ระเบียบการเลือกรถ
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button className="py-3 px-2 bg-background-light dark:bg-background-dark hover:bg-primary/10 rounded-xl transition-colors border border-transparent hover:border-primary/30 text-center">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-1">
                    <span className="material-icons-round text-sm">
                      local_taxi
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">
                    แท็กซี่
                  </div>
                </button>
                <button className="py-3 px-2 bg-background-light dark:bg-background-dark hover:bg-primary/10 rounded-xl transition-colors border border-transparent hover:border-primary/30 text-center">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-1">
                    <span className="material-icons-round text-sm">
                      two_wheeler
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">
                    มอเตอร์
                  </div>
                </button>
                <button className="py-3 px-2 bg-background-light dark:bg-background-dark hover:bg-primary/10 rounded-xl transition-colors border border-transparent hover:border-primary/30 text-center">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-1">
                    <span className="material-icons-round text-sm">
                      directions_car
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">
                    ตุ๊กตุ๊ก
                  </div>
                </button>
              </div>
            </div>

            {/* Recent Trips */}
            {!loading && recentTrips.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  การเดินทางล่าสุด
                </h3>
                <div className="space-y-2">
                  {recentTrips.map((trip) => (
                    <button
                      key={trip.id}
                      onClick={() => navigate('/ride-request')}
                      className="w-full p-3 bg-background-light dark:bg-background-dark rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {trip.route}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {trip.fare > 0 ? `฿${trip.fare.toFixed(0)}` : ''}{trip.driverName ? ` • ${trip.driverName}` : ''}
                      </p>
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
    </div>
  );
}
