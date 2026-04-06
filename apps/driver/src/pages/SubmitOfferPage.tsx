import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { socketClient } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/lib/toast';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import { IMG } from '@/lib/assets';

interface Ride {
  id: string;
  passengerName: string;
  passengerRating: number;
  pickupAddress: string;
  dropoffAddress: string;
  tripDistance: string;
  driverDistance: string;
  duration: string;
  fareOffer: number;
  fareMin?: number;
  fareMax?: number;
  vehicleType: string;
}

interface CounterOfferData {
  offerId: string;
  fareAmount: number;
  roundNumber: number;
  message?: string | null;
  expiresAt?: string;
}

const ETA_OPTIONS = [3, 5, 8, 10, 15];
const MAX_ROUNDS = 5;

export default function SubmitOfferPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { position } = useGeolocation();
  const user = useAuthStore((state) => state.user);

  const [ride, setRide] = useState<Ride | null>(location.state?.ride || null);
  const [fareAmount, setFareAmount] = useState<number>(0);
  const [estimatedMinutes, setEstimatedMinutes] = useState(5);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Post-submission state
  const [submittedOfferId, setSubmittedOfferId] = useState<string | null>(null);
  const [waitingCountdown, setWaitingCountdown] = useState(90);

  // Counter-offer from customer
  const [customerCounter, setCustomerCounter] = useState<CounterOfferData | null>(null);
  const [counterExpiry, setCounterExpiry] = useState(0);
  const [counterLoading, setCounterLoading] = useState(false);

  // Driver's counter-counter offer
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');

  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const expiryRef = useRef<ReturnType<typeof setInterval>>();

  // Fetch ride if not passed via navigation state
  useEffect(() => {
    if (!ride && rideId) {
      apiFetch<any>(`/rides/${rideId}`)
        .then(r => {
          const mapped: Ride = {
            id: r.id,
            passengerName: r.customerProfile?.user?.name || 'ผู้โดยสาร',
            passengerRating: r.customerProfile?.rating ?? 4.8,
            pickupAddress: r.pickupAddress,
            dropoffAddress: r.dropoffAddress,
            tripDistance: r.estimatedDistance ? `${Number(r.estimatedDistance).toFixed(1)} km` : '—',
            driverDistance: '— km',
            duration: r.estimatedDuration ? `${r.estimatedDuration} นาที` : '—',
            fareOffer: r.fareOffer,
            fareMin: r.fareMin,
            fareMax: r.fareMax,
            vehicleType: r.vehicleType,
          };
          setRide(mapped);
          setFareAmount(r.fareOffer || 120);
        })
        .catch(() => setError('ไม่สามารถโหลดข้อมูลการจองได้'));
    } else if (ride) {
      setFareAmount(ride.fareOffer || 120);
    }
  }, [rideId, ride]);

  // Socket listeners
  useEffect(() => {
    if (!user?.id) return;
    const socket = socketClient.connect();
    socketClient.joinRoom(`user:${user.id}`);

    // Customer counter-offers
    const onCounterOffer = (data: any) => {
      setCustomerCounter({
        offerId: data.offerId,
        fareAmount: data.fareAmount,
        roundNumber: data.roundNumber,
        message: data.message,
        expiresAt: data.expiresAt,
      });
      setShowCounterInput(false);
      toast.info(`ผู้โดยสารต่อรอง: ฿${data.fareAmount} (รอบที่ ${data.roundNumber})`);
    };

    const onOfferAccepted = (data: { offerId: string; tripId: string }) => {
      toast.success('ผู้โดยสารยอมรับข้อเสนอ!');
      navigate('/trip-active', { replace: true });
    };

    const onOfferRejected = (data: { offerId: string }) => {
      toast.error('ผู้โดยสารปฏิเสธข้อเสนอ');
      setTimeout(() => navigate('/home', { replace: true }), 1500);
    };

    const onOfferExpired = (data: { offerId: string }) => {
      if (data.offerId === submittedOfferId || (customerCounter && data.offerId === customerCounter.offerId)) {
        toast.warn('ข้อเสนอหมดอายุ');
        setTimeout(() => navigate('/home', { replace: true }), 1500);
      }
    };

    socket.on('offer:counter', onCounterOffer);
    socket.on('offer:accepted', onOfferAccepted);
    socket.on('offer:rejected', onOfferRejected);
    socket.on('offer:expired', onOfferExpired);
    socket.on('trip:created', () => navigate('/trip-active', { replace: true }));

    return () => {
      socket.off('offer:counter', onCounterOffer);
      socket.off('offer:accepted', onOfferAccepted);
      socket.off('offer:rejected', onOfferRejected);
      socket.off('offer:expired', onOfferExpired);
      socket.off('trip:created');
    };
  }, [user?.id, navigate, submittedOfferId, customerCounter]);

  // Waiting countdown after submission
  useEffect(() => {
    if (!submittedOfferId || customerCounter) return;
    setWaitingCountdown(90);
    countdownRef.current = setInterval(() => {
      setWaitingCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current!);
  }, [submittedOfferId, customerCounter]);

  // Counter-offer expiry countdown
  useEffect(() => {
    if (!customerCounter?.expiresAt) return;
    const updateExpiry = () => {
      const secs = Math.max(0, Math.round((new Date(customerCounter.expiresAt!).getTime() - Date.now()) / 1000));
      setCounterExpiry(secs);
    };
    updateExpiry();
    expiryRef.current = setInterval(updateExpiry, 1000);
    return () => clearInterval(expiryRef.current!);
  }, [customerCounter]);

  const handleSubmitOffer = async () => {
    if (!rideId) return;
    setLoading(true);
    setError('');
    try {
      const offer = await apiFetch<any>('/offers', {
        method: 'POST',
        body: {
          rideRequestId: rideId,
          fareAmount,
          estimatedPickupMinutes: estimatedMinutes,
          message: message || undefined,
        },
      });
      setSubmittedOfferId(offer.id || offer.data?.id || 'submitted');
      toast.success('ส่งข้อเสนอแล้ว! รอผู้โดยสารตอบรับ...');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptCounter = async () => {
    if (!customerCounter) return;
    setCounterLoading(true);
    try {
      // Submit a new offer with customer's counter fare (driver accepts)
      const offer = await apiFetch<any>('/offers', {
        method: 'POST',
        body: {
          rideRequestId: rideId,
          fareAmount: customerCounter.fareAmount,
          estimatedPickupMinutes: estimatedMinutes,
          message: 'ยอมรับราคาของคุณ',
          parentOfferId: customerCounter.offerId,
        },
      });
      toast.success(`ยอมรับ ฿${customerCounter.fareAmount} แล้ว!`);
    } catch (err) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setCounterLoading(false);
    }
  };

  const handleRejectCounter = async () => {
    setCounterLoading(true);
    try {
      // Reject by navigating away — counter-offer will expire
      // We can also post a rejected status via custom endpoint
      toast.info('ปฏิเสธข้อเสนอต่อรอง');
      setTimeout(() => navigate('/home', { replace: true }), 800);
    } finally {
      setCounterLoading(false);
    }
  };

  const handleSubmitCounterCounter = async () => {
    if (!customerCounter) return;
    const amount = parseFloat(counterAmount);
    if (!amount || amount <= 0) {
      toast.error('กรุณาใส่จำนวนเงินที่ถูกต้อง');
      return;
    }
    if (customerCounter.roundNumber >= MAX_ROUNDS) {
      toast.error('ถึงรอบการต่อรองสูงสุดแล้ว');
      return;
    }
    setCounterLoading(true);
    try {
      await apiFetch<any>('/offers', {
        method: 'POST',
        body: {
          rideRequestId: rideId,
          fareAmount: amount,
          estimatedPickupMinutes: estimatedMinutes,
          message: counterMessage || undefined,
          parentOfferId: customerCounter.offerId,
        },
      });
      setCustomerCounter(null);
      setShowCounterInput(false);
      setCounterAmount('');
      toast.success(`ส่งข้อเสนอ ฿${amount} ให้ผู้โดยสารแล้ว`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setCounterLoading(false);
    }
  };

  if (!ride) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        {error ? (
          <div className="text-center px-6">
            <span className="material-icons-round text-5xl text-red-400 mb-3 block">error</span>
            <p className="text-slate-600 dark:text-slate-400">{error}</p>
            <button onClick={() => navigate('/home')} className="mt-4 text-primary font-semibold">กลับหน้าหลัก</button>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500">กำลังโหลด...</p>
          </div>
        )}
      </div>
    );
  }

  // ── Post-Submission: Waiting / Counter-offer ───────────────────────────
  if (submittedOfferId) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex flex-col items-center justify-center px-6">

        {!customerCounter ? (
          /* Waiting for customer response */
          <div className="w-full max-w-sm text-center">
            <div className="relative w-28 h-28 mx-auto mb-6">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center shadow-xl">
                  <span className="material-icons-round text-white text-3xl">check</span>
                </div>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">ส่งข้อเสนอแล้ว!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-2">รอผู้โดยสารตอบรับ...</p>
            <p className="text-4xl font-extrabold text-primary mb-6">฿{fareAmount}</p>

            {/* Countdown */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 mb-6 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex justify-between text-sm text-slate-500 mb-2">
                <span>หมดอายุใน</span>
                <span className={waitingCountdown <= 30 ? 'text-red-500 font-bold' : 'font-semibold'}>{waitingCountdown}s</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${(waitingCountdown / 90) * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">จุดรับ</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{ride.pickupAddress}</p>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1 mt-2">จุดส่ง</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{ride.dropoffAddress}</p>
            </div>

            <button
              onClick={() => navigate('/home', { replace: true })}
              className="w-full py-3 rounded-xl border-2 border-slate-300 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              ยกเลิกและกลับ
            </button>
          </div>
        ) : (
          /* Customer sent a counter-offer */
          <div className="w-full max-w-sm">
            {/* Expiry countdown */}
            <div className={`mb-4 p-3 rounded-xl flex items-center gap-3 ${counterExpiry <= 30 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
              <span className={`material-icons-round ${counterExpiry <= 30 ? 'text-red-500' : 'text-amber-600'}`}>timer</span>
              <div className="flex-1">
                <p className={`text-sm font-bold ${counterExpiry <= 30 ? 'text-red-600' : 'text-amber-700'}`}>
                  ผู้โดยสารต่อรองราคา — หมดอายุใน {counterExpiry}s
                </p>
                <div className="h-1.5 bg-white/60 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${counterExpiry <= 30 ? 'bg-red-500' : 'bg-amber-500'}`}
                    style={{ width: `${(counterExpiry / 90) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden mb-4">
              {/* Round indicator */}
              <div className="bg-amber-500 text-white text-center py-2 text-sm font-bold">
                การต่อรองรอบที่ {customerCounter.roundNumber} / {MAX_ROUNDS}
              </div>

              <div className="p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-full overflow-hidden">
                    <img src={IMG.passengerFemale} className="w-full h-full object-cover" alt="passenger" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{ride.passengerName}</h3>
                    <div className="flex items-center gap-1">
                      <span className="material-icons-round text-yellow-400 text-sm">star</span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{ride.passengerRating}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">ราคาเดิมของคุณ</p>
                      <p className="text-xl font-bold text-slate-600 dark:text-slate-300 line-through">฿{fareAmount}</p>
                    </div>
                    <span className="material-icons-round text-slate-400 text-2xl">arrow_forward</span>
                    <div className="text-right">
                      <p className="text-xs text-amber-600 font-semibold uppercase">ผู้โดยสารเสนอ</p>
                      <p className="text-3xl font-extrabold text-amber-500">฿{customerCounter.fareAmount}</p>
                    </div>
                  </div>
                  {customerCounter.message && (
                    <p className="text-sm text-slate-500 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-700">
                      "{customerCounter.message}"
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                {!showCounterInput ? (
                  <div className="space-y-3">
                    <button
                      onClick={handleAcceptCounter}
                      disabled={counterLoading}
                      className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg shadow-lg shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span className="material-icons-round">check_circle</span>
                      ยอมรับ ฿{customerCounter.fareAmount}
                    </button>

                    {customerCounter.roundNumber < MAX_ROUNDS && (
                      <button
                        onClick={() => { setShowCounterInput(true); setCounterAmount(String(fareAmount)); }}
                        disabled={counterLoading}
                        className="w-full py-3.5 rounded-2xl border-2 border-amber-400 text-amber-600 font-bold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-icons-round text-sm">swap_horiz</span>
                        เสนอราคาใหม่
                      </button>
                    )}

                    <button
                      onClick={handleRejectCounter}
                      disabled={counterLoading}
                      className="w-full py-3 rounded-2xl border border-red-300 text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                ) : (
                  /* Counter-counter input */
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      ราคาที่คุณเสนอใหม่ (฿)
                    </label>
                    <div className="relative mb-3">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-primary">฿</span>
                      <input
                        type="number"
                        value={counterAmount}
                        onChange={e => setCounterAmount(e.target.value)}
                        placeholder="0"
                        className="w-full pl-10 pr-4 py-3.5 text-xl font-bold border-2 border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-primary transition"
                        autoFocus
                      />
                    </div>
                    <input
                      type="text"
                      value={counterMessage}
                      onChange={e => setCounterMessage(e.target.value)}
                      placeholder="ข้อความ (ไม่บังคับ)"
                      className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary transition mb-3"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowCounterInput(false)}
                        className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleSubmitCounterCounter}
                        disabled={counterLoading || !counterAmount}
                        className="flex-[2] py-3 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {counterLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'ส่งราคา'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Initial Offer Submission Form ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display relative overflow-hidden h-screen flex flex-col">
      {/* Map */}
      <div className="absolute inset-0 z-0">
        <GoogleMap
          center={position}
          zoom={14}
          markers={[
            { lat: position.lat, lng: position.lng, color: 'green', pulse: true, label: 'คุณ' },
          ]}
          className="absolute inset-0 w-full h-full"
        />
      </div>

      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 pt-12 pb-4 px-6 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-full px-4 py-2 shadow-sm flex items-center gap-2 border border-gray-100 dark:border-gray-700">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
          </span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">ส่งข้อเสนอ</span>
        </div>
        <button
          onClick={() => navigate('/home')}
          className="pointer-events-auto bg-white/90 dark:bg-slate-800/90 backdrop-blur-md h-10 w-10 flex items-center justify-center rounded-full shadow-sm text-gray-500 hover:text-red-500 border border-gray-100 dark:border-gray-700 transition"
        >
          <span className="material-icons-round text-xl">close</span>
        </button>
      </div>

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="bg-white dark:bg-slate-800 rounded-t-3xl shadow-2xl border-t border-slate-100 dark:border-slate-700 p-6 pb-10">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5"></div>

          {/* Passenger info */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full overflow-hidden">
              <img src={IMG.passengerFemale} className="w-full h-full object-cover" alt="passenger" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 dark:text-white">{ride.passengerName}</h3>
              <div className="flex items-center gap-1">
                <span className="material-icons-round text-yellow-400 text-sm">star</span>
                <span className="text-sm text-slate-500">{ride.passengerRating}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 font-semibold uppercase">ราคาผู้โดยสาร</p>
              <p className="text-xl font-extrabold text-primary">฿{ride.fareOffer}</p>
            </div>
          </div>

          {/* Route */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 mb-5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0"></div>
              <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{ride.pickupAddress}</p>
            </div>
            <div className="h-3 border-l-2 border-dashed border-slate-300 dark:border-slate-600 ml-[5px]"></div>
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-800 dark:bg-white rotate-45 shrink-0"></div>
              <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{ride.dropoffAddress}</p>
            </div>
            <div className="flex gap-4 pt-1 text-xs text-slate-400 pl-5">
              <span>{ride.tripDistance}</span>
              <span>·</span>
              <span>{ride.duration}</span>
            </div>
          </div>

          {/* Fare input */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">ราคาที่คุณเสนอ</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setFareAmount(Math.max(50, fareAmount - 10))} className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xl flex items-center justify-center">−</button>
              <div className="flex-1 text-center">
                <div className="text-4xl font-extrabold text-primary">฿{fareAmount}</div>
              </div>
              <button onClick={() => setFareAmount(fareAmount + 10)} className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xl flex items-center justify-center">+</button>
            </div>
          </div>

          {/* ETA */}
          <div className="flex gap-2 mb-4">
            {ETA_OPTIONS.map(min => (
              <button
                key={min}
                onClick={() => setEstimatedMinutes(min)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${estimatedMinutes === min ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
              >
                {min}m
              </button>
            ))}
          </div>

          {/* Message */}
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="ข้อความถึงผู้โดยสาร (ไม่บังคับ)"
            className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary transition mb-4"
          />

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <button
            onClick={handleSubmitOffer}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg shadow-lg shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span className="material-icons-round">send</span>
                ส่งข้อเสนอ ฿{fareAmount}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
