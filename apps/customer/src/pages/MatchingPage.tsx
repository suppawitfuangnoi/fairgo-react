import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient, socketEvents } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
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
  proposedBy: string;
  roundNumber: number;
  expiresAt?: string;
}

function mapOffer(o: any): DriverOffer {
  return {
    id: o.id,
    driverId: o.driverProfile?.userId || o.driverId || '',
    driverName: o.driverProfile?.user?.name || o.driverName || 'คนขับ',
    rating: o.driverProfile?.averageRating ?? o.rating ?? 4.8,
    vehiclePlate: o.driverProfile?.vehicles?.[0]?.plateNumber || o.vehiclePlate || '',
    vehicleModel: o.driverProfile?.vehicles?.[0]?.model || o.vehicleModel,
    eta: o.estimatedPickupMinutes ?? o.eta ?? 5,
    fare: o.fareAmount ?? o.fare ?? 0,
    isBestMatch: o.isBestMatch,
    proposedBy: o.proposedBy || 'DRIVER',
    roundNumber: o.roundNumber || 1,
    expiresAt: o.expiresAt,
  };
}

export default function MatchingPage() {
  const navigate = useNavigate();
  const { position } = useGeolocation();
  const user = useAuthStore((state) => state.user);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rideId, setRideId] = useState<string | null>(null);
  const [fareMin, setFareMin] = useState<number>(0);
  const [fareMax, setFareMax] = useState<number>(9999);
  const [userFare, setUserFare] = useState<number | null>(null);

  // Counter-offer modal state
  const [counterOffer, setCounterOffer] = useState<{ offerId: string; currentFare: number; round: number } | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [counterLoading, setCounterLoading] = useState(false);

  // Countdown for expiring offers
  const [offerCountdowns, setOfferCountdowns] = useState<Record<string, number>>({});

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  // ── Initial fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const ride = await apiFetch<any>('/rides/active');
        if (ride?.id) {
          setRideId(ride.id);
          if (ride.fareOffer) setUserFare(ride.fareOffer);
          if (ride.fareMin) setFareMin(ride.fareMin);
          if (ride.fareMax) setFareMax(ride.fareMax);
          if (ride.offers?.length) setOffers(ride.offers.map(mapOffer));
        }
      } catch {
        // no active ride
      }
    })();
  }, []);

  // ── Socket: real-time offers ───────────────────────────────────────────
  useEffect(() => {
    const socket = socketClient.connect();

    const onNewOffer = (rawOffer: any) => {
      const offer = mapOffer(rawOffer);
      setOffers(prev => {
        if (prev.find(o => o.id === offer.id)) return prev;
        return [...prev, offer];
      });
      toast.info(`คนขับส่งข้อเสนอ ฿${offer.fare}`);
    };

    const onCounterOffer = (data: any) => {
      // Driver countered our counter — create a new offer entry
      const offer = mapOffer({
        id: data.offerId,
        fareAmount: data.fareAmount,
        estimatedPickupMinutes: data.estimatedPickupMinutes,
        proposedBy: 'DRIVER',
        roundNumber: data.roundNumber,
        expiresAt: data.expiresAt,
      });
      setOffers(prev => {
        const filtered = prev.filter(o => o.roundNumber < data.roundNumber);
        return [...filtered, offer];
      });
      toast.info(`คนขับตอบกลับ: ฿${data.fareAmount} (รอบที่ ${data.roundNumber})`);
    };

    const onOfferExpired = (data: { offerId: string }) => {
      setOffers(prev => prev.filter(o => o.id !== data.offerId));
      toast.warning('ข้อเสนอหมดอายุ');
    };

    const onRideCancelled = () => {
      toast.error('การจับคู่ถูกยกเลิก');
      navigate('/home', { replace: true });
    };

    const onTripCreated = () => {
      navigate('/trip-active', { replace: true });
    };

    socket.on(socketEvents.ON_OFFER_NEW, onNewOffer);
    socket.on('offer:counter', onCounterOffer);
    socket.on('offer:expired', onOfferExpired);
    socket.on(socketEvents.ON_RIDE_CANCELLED, onRideCancelled);
    socket.on(socketEvents.ON_TRIP_CREATED, onTripCreated);

    pollRef.current = setInterval(async () => {
      try {
        const ride = await apiFetch<any>('/rides/active');
        if (ride?.offers?.length) setOffers(ride.offers.map(mapOffer));
      } catch { /* ignore */ }
    }, 8000);

    return () => {
      socket.off(socketEvents.ON_OFFER_NEW, onNewOffer);
      socket.off('offer:counter', onCounterOffer);
      socket.off('offer:expired', onOfferExpired);
      socket.off(socketEvents.ON_RIDE_CANCELLED, onRideCancelled);
      socket.off(socketEvents.ON_TRIP_CREATED, onTripCreated);
      clearInterval(pollRef.current);
    };
  }, [navigate]);

  // ── Join user room ─────────────────────────────────────────────────────
  useEffect(() => {
    if (user?.id) socketClient.joinRoom(`user:${user.id}`);
  }, [user?.id]);

  // ── Elapsed timer ─────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // ── Countdown for expiring counter-offers ─────────────────────────────
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setOfferCountdowns(() => {
        const next: Record<string, number> = {};
        offers.forEach(o => {
          if (o.expiresAt) {
            const secs = Math.max(0, Math.round((new Date(o.expiresAt).getTime() - Date.now()) / 1000));
            next[o.id] = secs;
          }
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [offers]);

  async function handleAcceptOffer(offerId: string) {
    setLoading(true);
    try {
      await apiFetch(`/offers/${offerId}/respond`, {
        method: 'POST',
        body: { action: 'ACCEPT' },
      });
      navigate('/trip-active', { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ');
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
      toast.info('ปฏิเสธข้อเสนอแล้ว');
    } catch { /* ignore */ }
  }

  async function handleCounterSubmit() {
    if (!counterOffer) return;
    const amount = parseFloat(counterAmount);
    if (!amount || amount <= 0) {
      toast.error('กรุณาใส่จำนวนเงินที่ถูกต้อง');
      return;
    }
    if (amount < fareMin || amount > fareMax) {
      toast.error(`ราคาต้องอยู่ระหว่าง ฿${fareMin} - ฿${fareMax}`);
      return;
    }
    setCounterLoading(true);
    try {
      await apiFetch(`/offers/${counterOffer.offerId}/respond`, {
        method: 'POST',
        body: { action: 'COUNTER', counterFareAmount: amount, message: counterMessage || undefined },
      });
      setOffers(prev => prev.filter(o => o.id !== counterOffer.offerId));
      setCounterOffer(null);
      setCounterAmount('');
      setCounterMessage('');
      toast.success(`ส่งข้อเสนอต่อรอง ฿${amount} ให้คนขับแล้ว`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setCounterLoading(false);
    }
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
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10">
          <div className="absolute w-64 h-64 bg-primary/20 rounded-full animate-ping" style={{ animationDuration: '2.5s' }}></div>
          <div className="absolute w-64 h-64 bg-primary/10 rounded-full animate-ping" style={{ animationDuration: '2.5s', animationDelay: '1.25s' }}></div>
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

          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
          </div>

          <div className="px-6 pt-2 pb-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-20">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {offers.length > 0 ? `${offers.length} คนขับพร้อม` : 'กำลังจับคู่...'}
              </h2>
              <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-lg">ต่อรองได้</span>
            </div>
            <p className="text-primary font-medium text-sm flex items-center gap-1.5">
              <span className="material-icons-round text-sm">thumb_up</span>
              {offers.length > 0 ? 'เลือกยอมรับ ปฏิเสธ หรือต่อรองราคา' : 'อยู่ระหว่างค้นหาคนขับ'}
            </p>
          </div>

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
              offers.map((offer, idx) => {
                const countdown = offerCountdowns[offer.id];
                const hasCountdown = countdown !== undefined;
                const isExpiringSoon = hasCountdown && countdown <= 30;

                return (
                  <div
                    key={offer.id}
                    className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border relative overflow-hidden ${
                      offer.isBestMatch || idx === 0
                        ? 'border-primary/40 ring-2 ring-primary/20'
                        : 'border-gray-100 dark:border-gray-700'
                    }`}
                  >
                    {/* Round badge */}
                    {offer.roundNumber > 1 && (
                      <div className="absolute top-0 left-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-br-lg">
                        รอบที่ {offer.roundNumber}
                      </div>
                    )}
                    {(offer.isBestMatch || idx === 0) && offer.roundNumber === 1 && (
                      <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                        BEST MATCH
                      </div>
                    )}

                    {/* Countdown bar */}
                    {hasCountdown && (
                      <div className={`mb-3 flex items-center gap-2 text-xs font-semibold ${isExpiringSoon ? 'text-red-500' : 'text-amber-600'}`}>
                        <span className="material-icons-round text-sm">timer</span>
                        หมดอายุใน {countdown} วินาที
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isExpiringSoon ? 'bg-red-500' : 'bg-amber-400'}`}
                            style={{ width: `${Math.min(100, (countdown / 90) * 100)}%` }}
                          />
                        </div>
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
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{(offer.rating ?? 4.8).toFixed(1)}</span>
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
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">ราคาเสนอ</p>
                        <p className="text-2xl font-bold text-primary">฿{offer.fare}</p>
                        {userFare && offer.fare !== userFare && (
                          <p className="text-[10px] text-gray-400">ราคาคุณ ฿{userFare}</p>
                        )}
                      </div>
                    </div>

                    {/* 3-button row: Reject | Counter | Accept */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRejectOffer(offer.id)}
                        disabled={loading}
                        className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
                      >
                        ปฏิเสธ
                      </button>
                      <button
                        onClick={() => {
                          setCounterOffer({ offerId: offer.id, currentFare: offer.fare, round: offer.roundNumber });
                          setCounterAmount(String(userFare || offer.fare));
                        }}
                        disabled={loading || offer.roundNumber >= 5}
                        className="flex-1 py-3 rounded-xl border-2 border-amber-400 text-amber-600 font-bold text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-30 flex items-center justify-center gap-1"
                      >
                        <span className="material-icons-round text-sm">swap_horiz</span>
                        ต่อรอง
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
                );
              })
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

      {/* ── Counter-offer Modal ───────────────────────────────────────────── */}
      {counterOffer && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCounterOffer(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-3xl w-full p-6 pb-10" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6"></div>

            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">เสนอราคาต่อรอง</h3>
            <p className="text-sm text-gray-500 mb-6">
              ราคาคนขับ: <strong className="text-primary">฿{counterOffer.currentFare}</strong>
              {' · '}รอบที่ {counterOffer.round + 1} / 5
              {fareMin > 0 && ` · ช่วง ฿${fareMin}–฿${fareMax}`}
            </p>

            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              ราคาที่คุณเสนอ (฿)
            </label>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-primary">฿</span>
              <input
                type="number"
                value={counterAmount}
                onChange={e => setCounterAmount(e.target.value)}
                min={fareMin}
                max={fareMax}
                placeholder="0"
                className="w-full pl-10 pr-4 py-4 text-2xl font-bold border-2 border-gray-200 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-primary transition"
                autoFocus
              />
            </div>

            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              ข้อความ (ไม่บังคับ)
            </label>
            <input
              type="text"
              value={counterMessage}
              onChange={e => setCounterMessage(e.target.value)}
              placeholder="เช่น ฝนตกนิดนึง รบกวนด้วยนะครับ"
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary transition mb-5"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setCounterOffer(null)}
                className="flex-1 py-4 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCounterSubmit}
                disabled={counterLoading || !counterAmount}
                className="flex-[2] py-4 rounded-2xl bg-amber-500 text-white font-bold shadow-lg shadow-amber-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {counterLoading ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-icons-round">send</span>
                    ส่งราคาต่อรอง
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
