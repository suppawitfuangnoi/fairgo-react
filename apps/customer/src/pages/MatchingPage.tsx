import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient, socketEvents } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { IMG } from '@/lib/assets';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';

interface DriverOffer {
  id: string;
  driverId: string;
  driverName: string;
  rating: number;
  vehiclePlate: string;
  vehicleModel?: string;
  eta: number;
  fare: number;
  isBestMatch?: boolean;
}

export default function MatchingPage() {
  const navigate = useNavigate();
  const { position } = useGeolocation();
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rideId, setRideId] = useState<string | null>(null);
  const [userFare, setUserFare] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // ── Initial fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const ride = await apiFetch<{ id: string; offeredFare?: number; offers: DriverOffer[] }>('/rides/active');
        if (ride?.id) {
          setRideId(ride.id);
          if (ride.offeredFare) setUserFare(ride.offeredFare);
          if (ride.offers?.length) setOffers(ride.offers);
        }
      } catch {
        // no active ride — stay on page, user can cancel
      }
    })();
  }, []);

  // ── Socket: real-time offers ───────────────────────────────────────────
  useEffect(() => {
    const socket = socketClient.connect();

    const onNewOffer = (offer: DriverOffer) => {
      setOffers(prev => {
        if (prev.find(o => o.id === offer.id)) return prev;
        return [...prev, offer];
      });
      toast.info(`คนขับใหม่ส่งข้อเสนอ ฿${offer.fare}`);
    };

    const onRideCancelled = () => {
      toast.error('การจับคู่ถูกยกเลิก');
      navigate('/home', { replace: true });
    };

    const onTripCreated = () => {
      navigate('/trip-active', { replace: true });
    };

    socket.on(socketEvents.ON_OFFER_NEW, onNewOffer);
    socket.on(socketEvents.ON_RIDE_CANCELLED, onRideCancelled);
    socket.on(socketEvents.ON_TRIP_CREATED, onTripCreated);

    // Fallback polling every 8s
    pollRef.current = setInterval(async () => {
      try {
        const ride = await apiFetch<{ id: string; offers: DriverOffer[] }>('/rides/active');
        if (ride?.offers?.length) setOffers(ride.offers);
      } catch { /* ignore */ }
    }, 8000);

    return () => {
      socket.off(socketEvents.ON_OFFER_NEW, onNewOffer);
      socket.off(socketEvents.ON_RIDE_CANCELLED, onRideCancelled);
      socket.off(socketEvents.ON_TRIP_CREATED, onTripCreated);
      clearInterval(pollRef.current);
    };
  }, [navigate]);

  // ── Elapsed timer ─────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  async function handleAcceptOffer(offerId: string) {
    setLoading(true);
    try {
      await apiFetch(`/offers/${offerId}/respond`, {
        method: 'POST',
        body: { action: 'ACCEPT' },
      });
      navigate('/trip-active', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ';
      toast.error(msg);
      setLoading(false);
    }
  }

  async function handleRejectOffer(offerId: string) {
    try {
      await apiFetch(`/offers/${offerId}/respond`, {
        method: 'POST',
        body: { action: 'REJECT' },
      });
      setOffers(prev => prev.filter(o => o.id !== offerId));
    } catch { /* ignore */ }
  }

  async function handleCancelRide() {
    try {
      if (rideId) await apiFetch(`/rides/${rideId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    navigate('/home', { replace: true });
  }

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-background-light dark:bg-background-dark overflow-hidden flex flex-col relative font-display">

      {/* ── Map Background ─────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <GoogleMap
          center={position}
          zoom={15}
          markers={[{ lat: position.lat, lng: position.lng, color: 'blue', pulse: true }]}
          className="absolute inset-0 w-full h-full"
        />
        {/* Pulsing rings + user pin */}
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10">
          <div
            className="absolute w-64 h-64 bg-primary/20 rounded-full animate-ping"
            style={{ animationDuration: '2.5s' }}
          ></div>
          <div
            className="absolute w-64 h-64 bg-primary/10 rounded-full animate-ping"
            style={{ animationDuration: '2.5s', animationDelay: '1.25s' }}
          ></div>

          {/* User pin */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full shadow-lg border-2 border-primary flex items-center justify-center overflow-hidden">
              <img src={IMG.userAvatar} className="w-full h-full object-cover rounded-full" alt="you" />
            </div>
            <div className="bg-white dark:bg-gray-800 px-3 py-1 rounded-full shadow-md mt-2 text-xs font-bold text-gray-800 dark:text-white border border-gray-100 dark:border-gray-700">
              {userFare ? `฿${userFare}` : '...'}
            </div>
            <div className="w-0.5 h-8 bg-gray-800 dark:bg-gray-300"></div>
            <div className="w-2 h-2 bg-gray-800 dark:bg-gray-300 rounded-full -mt-1"></div>
          </div>

          {/* Nearby car icons */}
          <div className="absolute top-12 left-24">
            <div className="bg-white p-1.5 rounded-full shadow-md transform rotate-12">
              <span className="material-icons-round text-gray-600 text-base">directions_car</span>
            </div>
          </div>
          <div className="absolute -top-16 -left-20">
            <div className="bg-white p-1.5 rounded-full shadow-md transform -rotate-45">
              <span className="material-icons-round text-gray-500 text-base">local_taxi</span>
            </div>
          </div>
          <div className="absolute -top-8 right-20">
            <div className="bg-white p-1.5 rounded-full shadow-md">
              <span className="material-icons-round text-gray-400 text-base">directions_car</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Nav ─────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 pt-12 px-6 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-full px-4 py-2 shadow-sm flex items-center gap-2 border border-gray-100 dark:border-gray-700 font-display">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
          </span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {offers.length > 0 ? `พบ ${offers.length} คนขับ` : `กำลังค้นหา... ${timeStr}`}
          </span>
        </div>
        <button
          onClick={handleCancelRide}
          className="pointer-events-auto bg-white/90 dark:bg-gray-800/90 backdrop-blur-md h-10 w-10 flex items-center justify-center rounded-full shadow-sm text-gray-500 hover:text-red-500 border border-gray-100 dark:border-gray-700 transition-colors"
        >
          <span className="material-icons-round text-xl">close</span>
        </button>
      </div>

      {/* ── Bottom Sheet ─────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col max-h-[68vh] font-display">
        <div className="h-8 bg-gradient-to-t from-black/5 to-transparent w-full pointer-events-none"></div>
        <div className="bg-white dark:bg-gray-800 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden">

          {/* Handle */}
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
          </div>

          {/* Header */}
          <div className="px-6 pt-2 pb-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-20">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {offers.length > 0 ? `${offers.length} คนขับพร้อม` : 'กำลังจับคู่...'}
              </h2>
              <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-lg">Fair Price</span>
            </div>
            <p className="text-primary font-medium text-sm flex items-center gap-1.5">
              <span className="material-icons-round text-sm">thumb_up</span>
              {offers.length > 0
                ? 'คนขับเลือกคุณ เพราะราคานี้แฟร์'
                : 'อยู่ระหว่างค้นหาคนขับที่เหมาะสม'}
            </p>
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto p-5 space-y-4 bg-background-light dark:bg-gray-900/50 flex-1">
            {offers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <span className="material-icons-round text-3xl text-primary animate-spin">search</span>
                </div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">กำลังจับคู่คนขับ</p>
                <p className="text-sm text-gray-400">โปรดรอสักครู่...</p>
              </div>
            ) : (
              offers.map((offer, idx) => (
                <div
                  key={offer.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border relative overflow-hidden ${
                    offer.isBestMatch || idx === 0
                      ? 'border-primary/40 ring-2 ring-primary/20'
                      : 'border-gray-100 dark:border-gray-700'
                  }`}
                >
                  {(offer.isBestMatch || idx === 0) && (
                    <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                      BEST MATCH
                    </div>
                  )}

                  <div className="flex items-start gap-4 mb-3">
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-full border-2 border-white dark:border-gray-600 shadow-sm overflow-hidden">
                        <img src={[IMG.driverSomsak, IMG.driverSomchai, IMG.driverDavid, IMG.driverSarah][idx % 4]} className="w-full h-full object-cover rounded-full" alt={offer.driverName} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm">
                        <div className="bg-green-500 w-3 h-3 rounded-full border-2 border-white dark:border-gray-700"></div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{offer.driverName}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {offer.vehiclePlate}{offer.vehicleModel ? ` · ${offer.vehicleModel}` : ''}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="material-icons-round text-yellow-400 text-sm">star</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{offer.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3 mb-3">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">ETA</p>
                      <p className="text-lg font-bold text-gray-800 dark:text-white">{offer.eta} นาที</p>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">ราคา</p>
                      <p className="text-2xl font-bold text-primary">฿{offer.fare}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRejectOffer(offer.id)}
                      disabled={loading}
                      className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
                    >
                      ปฏิเสธ
                    </button>
                    <button
                      onClick={() => handleAcceptOffer(offer.id)}
                      disabled={loading}
                      className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-1 shadow-lg shadow-primary/25"
                    >
                      {loading ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : 'ยอมรับ'}
                    </button>
                  </div>
                </div>
              ))
            )}

            <button
              onClick={handleCancelRide}
              disabled={loading}
              className="w-full py-3.5 rounded-xl border-2 border-red-300 text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50 text-sm"
            >
              ยกเลิกการเรียกรถ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
