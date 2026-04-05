import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch } from '@/lib/api';
import BottomNav from '@/components/BottomNav';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import { socketClient, socketEvents } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { IMG } from '@/lib/assets';

// Add styles for custom scrollbar
const styles = `
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .route-line {
    background-image: linear-gradient(to bottom, #cbd5e1 50%, rgba(255,255,255,0) 0%);
    background-position: left;
    background-size: 2px 10px;
    background-repeat: repeat-y;
  }
  .dark .route-line {
    background-image: linear-gradient(to bottom, #475569 50%, rgba(255,255,255,0) 0%);
  }
`;

interface RideRequest {
  id: string;
  passengerName: string;
  passengerRating: number;
  passengerTrips: number;
  pickupAddress: string;
  dropoffAddress: string;
  distance: string;
  duration: string;
  fareOffer: number;
  vehicleType: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { position } = useGeolocation();

  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayTrips, setTodayTrips] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if there's already an active trip on mount
    (async () => {
      try {
        const trip = await apiFetch<any>('/trips/active');
        if (trip?.id) navigate('/trip-active', { replace: true });
      } catch { /* no active trip */ }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!isOnline) {
      setRides([]);
      clearInterval(pollRef.current!);
      return;
    }

    const fetchRides = async () => {
      try {
        const response = await apiFetch<{ data: { rides: RideRequest[]; totalTrips: number; totalEarnings: number } }>(
          `/rides/nearby?latitude=${position.lat}&longitude=${position.lng}&radius=10`
        );
        if (response.data) {
          setRides(response.data.rides || []);
          setTodayTrips(response.data.totalTrips || 0);
          setTodayEarnings(response.data.totalEarnings || 0);
        }
      } catch { /* ignore */ }
    };

    fetchRides();
    // Socket: real-time new ride requests
    const socket = socketClient.connect();

    // Join user room to receive ride requests and events
    if (user?.id) {
      socketClient.joinRoom(`user:${user.id}`);
    }

    const onNewRide = (ride: RideRequest) => {
      setRides(prev => {
        if (prev.find(r => r.id === ride.id)) return prev;
        toast.info(`คำขอใหม่จาก ${ride.passengerName} — ฿${ride.fareOffer}`);
        return [ride, ...prev];
      });
    };
    const onOfferAccepted = (data: { tripId: string }) => {
      toast.success('ข้อเสนอได้รับการยอมรับ!');
      navigate('/trip-active', { replace: true });
    };
    socket.on(socketEvents.ON_NEW_RIDE_REQUEST, onNewRide);
    socket.on(socketEvents.ON_OFFER_ACCEPTED, onOfferAccepted);

    // Fallback poll every 12s
    pollRef.current = setInterval(fetchRides, 12000);

    return () => {
      socket.off(socketEvents.ON_NEW_RIDE_REQUEST, onNewRide);
      socket.off(socketEvents.ON_OFFER_ACCEPTED, onOfferAccepted);
      clearInterval(pollRef.current!);
    };
  }, [isOnline, navigate]);

  const toggleOnline = async () => {
    setLoading(true);
    try {
      await apiFetch('/users/me/driver-profile', {
        method: 'PATCH',
        body: JSON.stringify({ isOnline: !isOnline }),
      });
      const next = !isOnline;
      setIsOnline(next);
      updateUser({ isOnline: next });

      // Emit socket events for online/offline
      const socket = socketClient.connect();
      if (next) {
        socket.emit('driver:online', { vehicleType: user?.vehicleType || 'TAXI' });
        toast.success('คุณออนไลน์แล้ว!');
      } else {
        socket.emit('driver:offline');
        setRides([]);
        toast.info('คุณออฟไลน์แล้ว');
      }
    } catch {
      toast.error('ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      setLoading(false);
    }
  };

  const handleOfferSubmit = (rideId: string) => {
    const ride = rides.find((r) => r.id === rideId);
    navigate(`/submit-offer/${rideId}`, { state: { ride } });
  };

  const handleSkipRide = (rideId: string) => {
    setRides(rides.filter((r) => r.id !== rideId));
  };

  return (
    <>
      <style>{styles}</style>
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex flex-col pb-24 relative">
      {isOnline && (
        <GoogleMap
          center={position}
          zoom={15}
          markers={[{ lat: position.lat, lng: position.lng, color: 'green', pulse: true, label: 'ตำแหน่งของคุณ' }]}
          className="absolute inset-0 w-full h-full z-0"
          showTraffic={true}
        />
      )}
      <header className="sticky top-0 z-40 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Job Requests</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            {isOnline ? 'Finding nearby rides...' : 'You are offline'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-surface-dark px-3 py-1.5 rounded-full shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <button className="relative w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm overflow-hidden bg-slate-200 dark:bg-slate-700">
            {user?.avatar ? (
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <img src={IMG.driverProfile} className="w-full h-full object-cover rounded-full" alt="driver" />
            )}
            {isOnline && <div className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full border-2 border-white dark:border-background-dark"></div>}
          </button>
        </div>
      </header>

      {!isOnline ? (
        <main className="flex-1 px-4 pt-12 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <span className="material-icons-round text-5xl text-slate-400 dark:text-slate-500">
              cloud_off
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">คุณออฟไลน์อยู่</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">เปิดออนไลน์เพื่อรับงาน</p>
          <button
            onClick={toggleOnline}
            className="bg-primary hover:bg-primary-dark text-white font-bold py-3 px-8 rounded-xl transition flex items-center gap-2"
          >
            <span className="material-icons-round">power_settings_new</span>
            เปิดออนไลน์
          </button>

          <div className="mt-12 w-full max-w-sm bg-white dark:bg-surface-dark rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Today's Earnings</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Trips</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{todayTrips}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Earnings</p>
                <p className="text-2xl font-bold text-primary">฿{todayEarnings.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 px-4 pt-6 space-y-5 overflow-y-auto no-scrollbar relative z-10">
          {rides.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>
                <span className="material-symbols-outlined text-4xl text-primary absolute inset-0 flex items-center justify-center">
                  my_location
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">ไม่มีงานใกล้เคียง</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">เปลี่ยนตำแหน่งหรอื รอสักครู่</p>
            </div>
          ) : (
            rides.map((ride, idx) => (
              <article
                key={ride.id}
                className={`relative bg-surface-light dark:bg-surface-dark rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 overflow-hidden transform transition hover:scale-[1.01] duration-200 ${idx > 1 ? 'opacity-90' : ''}`}
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>

                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-slate-700 dark:text-slate-200">
                        <img src={idx % 2 === 0 ? IMG.passengerFemale : IMG.passengerMale} className="w-full h-full object-cover rounded-full" alt="passenger" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                          {ride.passengerName}
                        </h3>
                        <div className="flex items-center text-slate-500 dark:text-slate-400 text-sm font-medium">
                          <span className="text-yellow-400 material-icons-round text-sm mr-1">
                            star
                          </span>
                          <span>{ride.passengerRating}</span>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">•</span>
                          <span className="text-primary font-semibold">{ride.distance}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-extrabold text-primary tracking-tight">
                        ฿{ride.fareOffer}
                      </div>
                      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">
                        User Offer
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 dark:bg-slate-700/50 w-full mb-5"></div>

                  <div className="relative pl-2 mb-6">
                    <div className="absolute left-[15px] top-3 bottom-8 w-0.5 route-line"></div>

                    <div className="relative flex items-start gap-4 mb-6">
                      <div className="relative z-10 flex-none mt-1">
                        <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_0_4px_rgba(19,200,236,0.2)]"></div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                          Pickup • {ride.duration}
                        </p>
                        <p className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">
                          {ride.pickupAddress}
                        </p>
                      </div>
                    </div>

                    <div className="relative flex items-start gap-4">
                      <div className="relative z-10 flex-none mt-1">
                        <div className="w-3 h-3 rounded-none bg-slate-900 dark:bg-white rotate-45"></div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                          Dropoff • {ride.distance}
                        </p>
                        <p className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">
                          {ride.dropoffAddress}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => handleSkipRide(ride.id)}
                      className="flex-1 py-3.5 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-base hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-[0.98]"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleOfferSubmit(ride.id)}
                      className="flex-[2] py-3.5 px-4 rounded-lg bg-primary text-white font-bold text-base shadow-[0_4px_14px_rgba(19,200,236,0.4)] hover:bg-primary-dark hover:shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>Accept Job</span>
                      <span className="material-icons-round text-lg">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </main>
      )}

      <BottomNav />
    </div>
    </>
  );
}
