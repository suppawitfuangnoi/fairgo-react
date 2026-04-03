import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient, socketEvents } from '@fairgo/api-client';
import { toast } from '@/lib/toast';

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
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rideId, setRideId] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();
  const pollRef = useRef<NodeJS.Timeout>();

  // ── Initial fetch to get active ride + existing offers ──────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: { id: string; offers: DriverOffer[] } }>('/api/v1/rides/active');
        const ride = res.data;
        if (ride?.id) {
          setRideId(ride.id);
          if (ride.offers?.length) setOffers(ride.offers);
        }
      } catch {
        // ride not found — navigate back
      }
    })();
  }, []);

  // ── Socket: real-time new offer ──────────────────────────────────────
  useEffect(() => {
    const socket = socketClient.connect();

    const onNewOffer = (offer: DriverOffer) => {
      setOffers(prev => {
        const already = prev.find(o => o.id === offer.id);
        if (already) return prev;
        return [...prev, offer];
      });
      toast.info(`คนขับใหม่ส่งข้อเสนอ ฿${offer.fare}`);
    };

    const onRideCancelled = () => {
      toast.error('การจับคู่ถูกยกเลิก');
      navigate('/home', { replace: true });
    };

    const onTripCreated = (trip: { id: string }) => {
      navigate('/trip-active', { replace: true });
    };

    socket.on(socketEvents.ON_OFFER_NEW, onNewOffer);
    socket.on(socketEvents.ON_RIDE_CANCELLED, onRideCancelled);
    socket.on(socketEvents.ON_TRIP_CREATED, onTripCreated);

    // Fallback polling every 8s (in case socket is unavailable)
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ data: { id: string; offers: DriverOffer[] } }>('/api/v1/rides/active');
        if (res.data?.offers?.length) {
          setOffers(res.data.offers);
        }
      } catch { /* ignore */ }
    }, 8000);

    return () => {
      socket.off(socketEvents.ON_OFFER_NEW, onNewOffer);
      socket.off(socketEvents.ON_RIDE_CANCELLED, onRideCancelled);
      socket.off(socketEvents.ON_TRIP_CREATED, onTripCreated);
      clearInterval(pollRef.current);
    };
  }, [navigate]);

  // ── Elapsed timer ───────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  async function handleAcceptOffer(offerId: string) {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/offers/${offerId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      navigate('/trip-active', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'ยืนยันไม่สำเร็จ');
      setLoading(false);
    }
  }

  async function handleRejectOffer(offerId: string) {
    try {
      await apiFetch(`/api/v1/offers/${offerId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action: 'REJECT' }),
      });
      setOffers(prev => prev.filter(o => o.id !== offerId));
    } catch { /* ignore */ }
  }

  async function handleCancelRide() {
    try {
      if (rideId) {
        await apiFetch(`/api/v1/rides/${rideId}`, { method: 'DELETE' });
      }
      navigate('/home', { replace: true });
    } catch {
      navigate('/home', { replace: true });
    }
  }

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-[#f6f8f8] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated Radar Background */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-72 h-72 opacity-30">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border-2 border-primary animate-ping"
              style={{ animationDelay: `${i * 0.6}s`, animationDuration: '3s' }}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full px-6 py-8">
        {/* Timer */}
        <div className="text-center mb-8">
          <p className="text-sm text-slate-500 mb-1 font-medium">กำลังค้นหาคนขับ...</p>
          <p className="text-5xl font-bold text-primary tabular-nums">
            {mins}:{secs.toString().padStart(2, '0')}
          </p>
        </div>

        {/* Offers */}
        {offers.length === 0 ? (
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">search</span>
            </div>
            <p className="text-lg font-semibold text-slate-800 mb-1">กำลังจับคู่คนขับ</p>
            <p className="text-sm text-slate-400">อยู่ระหว่างค้นหาคนขับที่เหมาะสม</p>
          </div>
        ) : (
          <div className="w-full space-y-4 mb-6">
            <h2 className="text-base font-bold text-center text-slate-800 mb-2">
              ข้อเสนอจากคนขับ ({offers.length})
            </h2>
            {offers.map(offer => (
              <div
                key={offer.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative overflow-hidden"
              >
                {offer.isBestMatch && (
                  <div className="absolute top-3 right-3 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Best Match ✨
                  </div>
                )}

                {/* Driver Row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate">{offer.driverName}</h3>
                    <p className="text-xs text-slate-400">{offer.vehiclePlate}{offer.vehicleModel ? ` · ${offer.vehicleModel}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <span className="material-symbols-outlined text-yellow-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="text-sm font-bold text-slate-700">{offer.rating.toFixed(1)}</span>
                  </div>
                </div>

                {/* ETA & Fare */}
                <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3 mb-3">
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium uppercase">ETA</p>
                    <p className="text-lg font-bold text-slate-800">{offer.eta} นาที</p>
                  </div>
                  <div className="w-px h-8 bg-slate-200"></div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-medium uppercase">ราคา</p>
                    <p className="text-2xl font-bold text-primary">฿{offer.fare}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRejectOffer(offer.id)}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                  <button
                    onClick={() => handleAcceptOffer(offer.id)}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-[#0ea5c6] transition disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : 'ยอมรับ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel */}
      <div className="relative z-10 w-full px-6 pb-8">
        <button
          onClick={handleCancelRide}
          disabled={loading}
          className="w-full py-3.5 rounded-xl border-2 border-red-400 text-red-500 font-bold hover:bg-red-50 transition disabled:opacity-50"
        >
          ยกเลิกการเรียก
        </button>
      </div>
    </div>
  );
}
