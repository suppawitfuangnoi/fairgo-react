import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { IMG } from '@/lib/assets';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';

interface FareEstimate {
  fareMin: number;
  fareMax: number;
  recommendedFare: number;
  distance: number;
  duration: number;
}

export default function RideRequestPage() {
  const navigate = useNavigate();
  const { position } = useGeolocation();
  const [vehicleType, setVehicleType] = useState<'TAXI' | 'MOTORCYCLE' | 'TUKTUK'>(
    'TAXI'
  );
  const [pickupAddress, setPickupAddress] = useState('Siam Paragon, Gate 1');
  const [dropoffAddress, setDropoffAddress] = useState('ICONSIAM');
  const [fare, setFare] = useState(145);
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFare, setLoadingFare] = useState(false);

  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount: number;
    finalFare: number;
    description?: string | null;
  } | null>(null);
  const [promoError, setPromoError] = useState('');

  useEffect(() => {
    const fetchFareEstimate = async () => {
      if (!dropoffAddress) return;
      setLoadingFare(true);
      try {
        const response = await apiFetch<FareEstimate>('/rides/fare-estimate', {
          method: 'POST',
          body: {
            pickupLatitude: position?.lat ?? 13.7563,
            pickupLongitude: position?.lng ?? 100.5018,
            dropoffLatitude: 13.7423,
            dropoffLongitude: 100.5231,
            vehicleType,
          },
        });
        setFareEstimate(response);
        setFare(response.recommendedFare);
      } catch (err) {
        console.error('Failed to fetch fare estimate:', err);
      } finally {
        setLoadingFare(false);
      }
    };

    fetchFareEstimate();
  }, [vehicleType, dropoffAddress]);

  const handleRequestRide = async () => {
    setLoading(true);
    try {
      const fareMin = fareEstimate?.fareMin ?? Math.max(35, fare - 30);
      const fareMax = fareEstimate?.fareMax ?? fare + 50;
      await apiFetch('/rides', {
        method: 'POST',
        body: {
          pickupLatitude: position?.lat ?? 13.7563,
          pickupLongitude: position?.lng ?? 100.5018,
          pickupAddress,
          dropoffLatitude: 13.7423,
          dropoffLongitude: 100.5231,
          dropoffAddress,
          vehicleType,
          fareOffer: fare,
          fareMin,
          fareMax,
        },
      });
      navigate('/matching', { replace: true });
    } catch (err) {
      console.error('Failed to request ride:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setAppliedPromo(null);
    try {
      const res = await apiFetch<{
        code: string;
        discount: number;
        finalFare: number;
        description?: string | null;
      }>('/coupons/validate', {
        method: 'POST',
        body: { code: promoCode.trim().toUpperCase(), fare },
      });
      setAppliedPromo(res);
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'โค้ดไม่ถูกต้อง');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const isFairPrice =
    fareEstimate &&
    fare >= fareEstimate.fareMin &&
    fare <= fareEstimate.fareMax;

  return (
    <div className="w-full max-w-md h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden font-display">
      {/* Top Header & Map Area */}
      <div className="relative h-[35%] w-full bg-slate-100">
        <GoogleMap
          center={position}
          zoom={14}
          markers={[
            { lat: position.lat, lng: position.lng, color: 'blue', pulse: true },
            { lat: 13.7423, lng: 100.5231, color: 'red', label: 'ปลายทาง' },
          ]}
          className="absolute inset-0 w-full h-full"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-white dark:to-slate-900"></div>

        {/* Header Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 pt-12 flex justify-between items-center z-10 text-white">
          <button
            onClick={() => navigate(-1)}
            className="bg-white/20 backdrop-blur-md p-2 rounded-full hover:bg-white/30 transition"
          >
            <span className="material-icons-round text-white">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold drop-shadow-md">ตั้งราคาการเดินทาง</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto relative -mt-6 bg-white dark:bg-slate-900 rounded-t-3xl z-20 flex flex-col">
        {/* Handle Indicator */}
        <div className="w-full flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
        </div>

        <div className="px-6 py-2 flex flex-col gap-6">
          {/* Vehicle Type Selector */}
          <div className="flex gap-3 justify-center">
            {['TAXI', 'MOTORCYCLE', 'TUKTUK'].map((type) => (
              <button
                key={type}
                onClick={() => setVehicleType(type as typeof vehicleType)}
                className={`flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-all ${
                  vehicleType === type
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <span className="material-icons-round">
                  {type === 'TAXI'
                    ? 'local_taxi'
                    : type === 'MOTORCYCLE'
                      ? 'two_wheeler'
                      : 'directions_car'}
                </span>
                <span className="text-xs font-semibold">
                  {type === 'TAXI'
                    ? 'แท็กซี่'
                    : type === 'MOTORCYCLE'
                      ? 'มอเตอร์'
                      : 'ตุ๊กตุ๊ก'}
                </span>
              </button>
            ))}
          </div>

          {/* Route Summary Card */}
          <div className="bg-background-light dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm ring-1 ring-black/5">
            <div className="flex flex-col gap-4 relative">
              {/* Connecting Line */}
              <div className="absolute left-[11px] top-[24px] bottom-[24px] w-0.5 bg-slate-300 dark:bg-slate-600 border-l border-dashed border-slate-400"></div>

              {/* Pickup */}
              <div className="flex items-start gap-3">
                <div className="mt-1 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/50"></div>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Pickup
                  </p>
                  <p className="text-sm font-semibold truncate">{pickupAddress}</p>
                </div>
              </div>

              {/* Dropoff */}
              <div className="flex items-start gap-3">
                <div className="mt-1 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <span className="material-icons-round text-orange-500 text-[16px]">
                      place
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Drop-off
                  </p>
                  <input
                    type="text"
                    value={dropoffAddress}
                    onChange={(e) => setDropoffAddress(e.target.value)}
                    placeholder="Enter destination"
                    className="text-sm font-semibold truncate bg-transparent border-none p-0 w-full focus:ring-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Fare Control Section */}
          <div className="flex flex-col items-center gap-2 mt-2">
            <p className="text-sm text-slate-400 font-medium tracking-wide uppercase">
              ข้อเสนอของคุณ
            </p>

            {/* Big Price Display */}
            <div className="flex items-baseline gap-1 text-slate-900 dark:text-white">
              <span className="text-3xl font-bold text-slate-400">฿</span>
              <span className="text-6xl font-extrabold tracking-tight text-primary">
                {fare}
              </span>
            </div>

            {/* Fairness Badge */}
            {isFairPrice && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E8F5E9] dark:bg-green-900/20 rounded-full mt-2 transition-all">
                <span className="material-icons-round text-green-600 dark:text-green-400 text-sm">
                  thumb_up
                </span>
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                  ราคานี้แฟร์
                </span>
              </div>
            )}

            {/* Recommended Range Label */}
            {fareEstimate && (
              <p className="text-xs text-slate-400 mt-1">
                Recommended:{' '}
                <span className="text-green-600 dark:text-green-400 font-bold">
                  ฿{fareEstimate.fareMin} - ฿{fareEstimate.fareMax}
                </span>
              </p>
            )}
          </div>

          {/* Slider Component */}
          <div className="w-full px-2 py-4">
            <div className="relative w-full h-12 flex items-center">
              {/* Recommended Zone Background */}
              {fareEstimate && (
                <div
                  className="absolute h-2.5 bg-green-100 dark:bg-green-900/40 rounded-full z-0 top-[22px]"
                  style={{
                    left: `${((fareEstimate.fareMin - 100) / 100) * 100}%`,
                    right: `${100 - ((fareEstimate.fareMax - 100) / 100) * 100}%`,
                  }}
                ></div>
              )}

              {/* Range Input */}
              <input
                type="range"
                min="100"
                max="200"
                value={fare}
                onChange={(e) => setFare(parseInt(e.target.value))}
                className="w-full relative z-10 bg-transparent appearance-none h-2 cursor-pointer focus:outline-none"
              />
            </div>

            <div className="flex justify-between text-xs font-medium text-slate-400 px-1 mt-[-8px]">
              <span>฿100</span>
              <span>฿200</span>
            </div>
          </div>

          {/* Quick Adjust Chips */}
          <div className="flex justify-center gap-3">
            {[10, 20, 50].map((amount) => (
              <button
                key={amount}
                onClick={() => setFare(Math.min(200, fare + amount))}
                className="px-4 py-2 rounded-lg bg-background-light dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-white hover:border-primary hover:text-primary transition shadow-sm active:scale-95"
              >
                +{amount}
              </button>
            ))}
          </div>
        </div>

          {/* Promo Code Section */}
          <div className="mt-1 mb-2">
            {appliedPromo ? (
              // Applied coupon — show success chip
              <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-emerald-500 text-base">local_offer</span>
                  <div>
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono tracking-wider">
                      {appliedPromo.code}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">
                      ลด ฿{appliedPromo.discount.toFixed(2)}{appliedPromo.description ? ` — ${appliedPromo.description}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemovePromo}
                  className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 rounded-lg transition-colors"
                >
                  <span className="material-icons-round text-emerald-400 text-base">close</span>
                </button>
              </div>
            ) : (
              // Promo code input row
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-base">
                    local_offer
                  </span>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleValidatePromo()}
                    placeholder="โค้ดส่วนลด"
                    maxLength={20}
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono tracking-wider rounded-xl border border-slate-200 dark:border-slate-700 bg-background-light dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition placeholder:font-sans placeholder:tracking-normal"
                  />
                </div>
                <button
                  onClick={handleValidatePromo}
                  disabled={!promoCode.trim() || promoLoading}
                  className="px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 disabled:opacity-40 text-primary font-bold text-sm transition-all flex items-center gap-1"
                >
                  {promoLoading ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    'ใช้'
                  )}
                </button>
              </div>
            )}

            {promoError && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1 px-1">
                <span className="material-icons-round text-xs">error</span>
                {promoError}
              </p>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-grow"></div>
        </div>

      {/* Footer Section */}
      <div className="bg-white dark:bg-slate-900 px-6 py-6 pb-8 border-t border-slate-100 dark:border-slate-800 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        {/* Payment Method */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 rounded-full bg-background-light dark:bg-slate-800 flex items-center justify-center group-hover:bg-primary/10 transition">
              <span className="material-icons-round text-slate-600 dark:text-slate-300 group-hover:text-primary">
                payments
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-500">วิธีชำระเงิน</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-slate-800 dark:text-white">
                  เงินสด
                </span>
                <span className="material-icons-round text-sm text-slate-400">
                  expand_more
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            {appliedPromo ? (
              <>
                <span className="text-xs text-slate-400 line-through block">฿{fare}</span>
                <span className="text-base font-bold text-emerald-500">
                  ฿{appliedPromo.finalFare.toFixed(2)}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-400 block">เวลาประมาณ</span>
                <span className="text-sm font-bold text-slate-800 dark:text-white">
                  5-8 นาที
                </span>
              </>
            )}
          </div>
        </div>

        {/* Main CTA */}
        <button
          onClick={handleRequestRide}
          disabled={loading || loadingFare}
          className="w-full bg-primary hover:bg-[#0fbddf] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-primary/30 active:shadow-none active:translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
        >
          <span>{loading ? 'กำลังเรียก...' : 'เรียกแฟร์โก'}</span>
          <span className="material-icons-round group-hover:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}

