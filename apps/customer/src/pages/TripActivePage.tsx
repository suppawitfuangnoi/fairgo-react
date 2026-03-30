import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

interface ActiveTrip {
  id: string;
  status: 'DRIVER_EN_ROUTE' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';
  driverName: string;
  driverRating: number;
  driverPhone: string;
  vehiclePlate: string;
  fare: number;
  estimatedArrival: number;
}

export default function TripActivePage() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const response = await apiFetch('/trips/active');
        if (response.status === 'COMPLETED') {
          navigate(`/trip-summary/${response.id}`, { replace: true });
        } else {
          setTrip(response);
        }
      } catch (err) {
        console.error('Failed to fetch active trip:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
    pollIntervalRef.current = setInterval(fetchTrip, 5000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [navigate]);

  const handleCancelTrip = async () => {
    if (!trip) return;
    try {
      await apiFetch(`/trips/${trip.id}/status`, {
        method: 'PATCH',
        body: { status: 'CANCELLED' },
      });
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Failed to cancel trip:', err);
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'DRIVER_EN_ROUTE':
        return 'คนขับกำลังมา';
      case 'DRIVER_ARRIVED':
        return 'คนขับมาถึงแล้ว!';
      case 'IN_PROGRESS':
        return 'กำลังเดินทาง';
      default:
        return 'กำลังเตรียมการ';
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center px-6">
          <span className="material-icons-round text-6xl text-slate-400 mb-4">
            info
          </span>
          <p className="text-slate-600 dark:text-slate-400">ไม่พบการเดินทางที่ใช้งานอยู่</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark overflow-hidden relative flex flex-col">
      {/* Map Background */}
      <div className="absolute inset-0 z-0 map-bg w-full h-full relative bg-gray-200 dark:bg-gray-700">
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        >
          <path
            className="drop-shadow-md opacity-80"
            d="M-50 200 Q 150 400 200 350 T 450 600"
            fill="none"
            stroke="#13c8ec"
            strokeDasharray="10 0"
            strokeLinecap="round"
            strokeWidth="6"
          ></path>
          <circle cx="200" cy="350" fill="#13c8ec" fillOpacity="0.2" r="10">
            <animate
              attributeName="r"
              dur="1.5s"
              from="10"
              repeatCount="indefinite"
              to="30"
            ></animate>
            <animate
              attributeName="opacity"
              dur="1.5s"
              from="0.6"
              repeatCount="indefinite"
              to="0"
            ></animate>
          </circle>
        </svg>

        {/* Driver Car Icon */}
        <div className="absolute top-[330px] left-[180px] z-10 transform -translate-x-1/2 -translate-y-1/2 rotate-45 transition-all duration-1000 ease-linear">
          <div className="bg-white dark:bg-slate-800 p-2 rounded-full shadow-lg border-2 border-primary">
            <span className="material-icons-round text-primary text-xl block transform -rotate-45">
              directions_car
            </span>
          </div>
        </div>

        {/* Destination Pin */}
        <div className="absolute top-[580px] left-[380px] z-10 transform -translate-x-1/2 -translate-y-1/2">
          <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-1 rounded-full text-xs font-bold shadow-lg mb-1 whitespace-nowrap">
            ปลายทาง
          </div>
          <span className="material-icons-round text-slate-900 dark:text-white text-4xl block text-center drop-shadow-md">
            location_on
          </span>
        </div>
      </div>

      {/* Top Status Header */}
      <div className="absolute top-0 left-0 w-full z-20 pt-14 px-5 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg rounded-xl p-3 pr-5 flex items-center gap-3 max-w-[75%] border border-slate-100 dark:border-slate-700">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-icons-round text-primary text-xl">
              near_me
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
              สถานะ
            </p>
            <p className="text-sm font-bold leading-tight">
              {getStatusText(trip.status)}{' '}
              {trip.estimatedArrival && (
                <span className="text-primary">
                  {trip.estimatedArrival} นาที
                </span>
              )}
            </p>
          </div>
        </div>

        <button className="pointer-events-auto w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center border border-slate-100 dark:border-slate-700 active:scale-95 transition-transform group">
          <span className="material-icons-round text-slate-400 group-hover:text-primary transition-colors text-2xl">
            shield
          </span>
        </button>
      </div>

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 w-full z-30">
        <div className="bg-white dark:bg-slate-800 rounded-t-3xl shadow-lg p-6 pb-8 border-t border-slate-100 dark:border-slate-700">
          {/* Drag Handle */}
          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full mx-auto mb-6"></div>

          {/* Driver Profile & Car */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full object-cover border-4 border-slate-50 dark:border-slate-700 shadow-sm bg-primary/20 flex items-center justify-center">
                  <span className="material-icons-round text-primary text-2xl">
                    person
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 p-1 rounded-full">
                  <div className="flex items-center gap-0.5 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full border border-yellow-100 dark:border-yellow-700">
                    <span className="material-icons-round text-yellow-400 text-[10px]">
                      star
                    </span>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-yellow-100">
                      {trip.driverRating.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {trip.driverName}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {trip.vehiclePlate}
                </p>
              </div>
            </div>

            {/* Fare Badge */}
            <div className="text-right">
              <div className="text-2xl font-bold text-primary tracking-tight">
                ฿{trip.fare}
              </div>
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                <span className="material-icons-round text-[10px]">lock</span>
                ล็อกราคาแล้ว
              </div>
            </div>
          </div>

          {/* Info Message */}
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg p-3 mb-6 flex items-start gap-3">
            <span className="material-icons-round text-primary text-lg mt-0.5">
              verified_user
            </span>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                ล็อกราคาแล้ว สบายใจได้
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ไม่มีค่าใช้จ่ายเพิ่มเติมนอกเหนือจากที่ตกลงไว้
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <a
              href={`tel:${trip.driverPhone}`}
              className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold active:scale-[0.98] transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              <span className="material-icons-round text-xl">call</span>
              โทรไป
            </a>
            <button className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/30 active:scale-[0.98] transition-all hover:bg-primary/90">
              <span className="material-icons-round text-xl">
                chat_bubble_outline
              </span>
              แชท
            </button>
          </div>

          {/* Cancel Button (only before pickup) */}
          {trip.status === 'DRIVER_EN_ROUTE' && (
            <button
              onClick={handleCancelTrip}
              className="w-full mt-4 py-3 border border-red-500 text-red-500 font-semibold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              ยกเลิกการเดินทาง
            </button>
          )}

          {/* Bottom safe area spacer */}
          <div className="h-4 w-full"></div>
        </div>
      </div>
    </div>
  );
}
