import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import GoogleMap from '@/components/GoogleMap';
import PlaceSearchInput from '@/components/PlaceSearchInput';
import MapLocationPicker from '@/components/MapLocationPicker';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useReverseGeocode } from '@/hooks/useReverseGeocode';
import type { PlaceDetail } from '@/hooks/usePlacesAutocomplete';

interface FareEstimate {
  fareMin: number;
  fareMax: number;
  recommendedFare: number;
  distance: number;
  duration: number;
}

/** Round down to nearest 5 */
const floorTo5 = (n: number) => Math.floor(n / 5) * 5;
/** Round up to nearest 5 */
const ceilTo5 = (n: number) => Math.ceil(n / 5) * 5;

export default function RideRequestPage() {
  const navigate = useNavigate();
  const { position } = useGeolocation();

  // ── Addresses ────────────────────────────────────────────
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Track whether pickup was manually set by user (search or map pick)
  // If not, it follows GPS position automatically
  const [pickupManuallySet, setPickupManuallySet] = useState(false);

  // ── Map picker modal state ────────────────────────────────
  const [mapPickerMode, setMapPickerMode] = useState<'pickup' | 'dropoff' | null>(null);

  // ── Reverse-geocode pickup (GPS) ──────────────────────────
  const { address: geocodedAddress } = useReverseGeocode(position.lat, position.lng);

  // Sync GPS → pickup address and coords (only when not manually overridden)
  useEffect(() => {
    if (pickupManuallySet) return;
    // Only sync real GPS (not the Bangkok default fallback)
    if (position.lat === 13.7563 && position.lng === 100.5018) return;
    setPickupCoords(position);
  }, [position.lat, position.lng, pickupManuallySet]);

  useEffect(() => {
    if (pickupManuallySet) return;
    if (geocodedAddress) setPickupAddress(geocodedAddress);
  }, [geocodedAddress, pickupManuallySet]);

  // ── Vehicle ───────────────────────────────────────────────
  const [vehicleType, setVehicleType] = useState<'TAXI' | 'MOTORCYCLE' | 'TUKTUK'>('TAXI');

  // ── Fare & Slider ─────────────────────────────────────────
  const [fare, setFare] = useState(145);
  const [sliderMin, setSliderMin] = useState(100);
  const [sliderMax, setSliderMax] = useState(300);
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [loadingFare, setLoadingFare] = useState(false);

  // ── UI States ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Promo ─────────────────────────────────────────────────
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string; discount: number; finalFare: number; description?: string | null;
  } | null>(null);
  const [promoError, setPromoError] = useState('');

  // ── Fare estimate ─────────────────────────────────────────
  useEffect(() => {
    if (!dropoffCoords) return;
    const fetchFareEstimate = async () => {
      setLoadingFare(true);
      setFareEstimate(null);
      try {
        const pickup = pickupCoords || position;
        const response = await apiFetch<FareEstimate>('/rides/fare-estimate', {
          method: 'POST',
          body: {
            pickupLatitude: pickup.lat,
            pickupLongitude: pickup.lng,
            dropoffLatitude: dropoffCoords.lat,
            dropoffLongitude: dropoffCoords.lng,
            vehicleType,
          },
        });
        // Compute dynamic slider range: 60% of min → 150% of max, rounded to 5
        const newMin = floorTo5(response.fareMin * 0.6);
        const newMax = ceilTo5(response.fareMax * 1.5);
        setSliderMin(newMin);
        setSliderMax(newMax);
        // Set initial fare to recommended, clamped to new range
        const recommended = Math.min(newMax, Math.max(newMin, response.recommendedFare));
        setFare(recommended);
        setFareEstimate(response);
      } catch (err) {
        console.error('Failed to fetch fare estimate:', err);
      } finally {
        setLoadingFare(false);
      }
    };
    fetchFareEstimate();
  }, [vehicleType, dropoffCoords]);

  // ── Handlers ─────────────────────────────────────────────
  const handlePickupSelect = useCallback((place: PlaceDetail) => {
    setPickupAddress(place.name);
    if (place.lat && place.lng) {
      setPickupCoords({ lat: place.lat, lng: place.lng });
      setPickupManuallySet(true);
    }
  }, []);

  const handleDropoffSelect = useCallback((place: PlaceDetail) => {
    setDropoffAddress(place.name);
    if (place.lat && place.lng) {
      setDropoffCoords({ lat: place.lat, lng: place.lng });
      setFareEstimate(null); // reset until new estimate arrives
    }
  }, []);

  // Reset pickup to GPS
  const handleResetPickupToGPS = useCallback(() => {
    setPickupManuallySet(false);
    setPickupCoords(position);
    setPickupAddress(geocodedAddress || 'ตำแหน่งปัจจุบัน');
  }, [position, geocodedAddress]);

  // Map picker confirm
  const handleMapPickerConfirm = useCallback(
    (coords: { lat: number; lng: number }, address: string) => {
      if (mapPickerMode === 'pickup') {
        setPickupCoords(coords);
        setPickupAddress(address || 'ตำแหน่งที่เลือก');
        setPickupManuallySet(true);
      } else if (mapPickerMode === 'dropoff') {
        setDropoffCoords(coords);
        setDropoffAddress(address || 'ตำแหน่งที่เลือก');
        setFareEstimate(null);
      }
      setMapPickerMode(null);
    },
    [mapPickerMode]
  );

  const handleRequestRide = async () => {
    if (!dropoffCoords) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const pickup = pickupCoords || position;
      // Clamp fare within the valid range before submitting
      const clampedFare = fareEstimate
        ? Math.min(fareEstimate.fareMax, Math.max(fareEstimate.fareMin, fare))
        : fare;
      const fareMin = fareEstimate?.fareMin ?? Math.max(35, clampedFare - 30);
      const fareMax = fareEstimate?.fareMax ?? clampedFare + 50;

      await apiFetch('/rides', {
        method: 'POST',
        body: {
          pickupLatitude: pickup.lat,
          pickupLongitude: pickup.lng,
          pickupAddress: pickupAddress || 'ตำแหน่งปัจจุบัน',
          dropoffLatitude: dropoffCoords.lat,
          dropoffLongitude: dropoffCoords.lng,
          dropoffAddress: dropoffAddress || 'ปลายทาง',
          vehicleType,
          fareOffer: clampedFare,
          fareMin,
          fareMax,
        },
      });
      navigate('/matching', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเรียกรถได้ กรุณาลองใหม่';
      setErrorMsg(msg);
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
        code: string; discount: number; finalFare: number; description?: string | null;
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

  // ── Derived ───────────────────────────────────────────────
  const isFairPrice = fareEstimate && fare >= fareEstimate.fareMin && fare <= fareEstimate.fareMax;

  // Green zone bar position (% relative to slider range)
  const greenLeft = fareEstimate
    ? Math.max(0, ((fareEstimate.fareMin - sliderMin) / (sliderMax - sliderMin)) * 100)
    : 0;
  const greenRight = fareEstimate
    ? Math.max(0, 100 - ((fareEstimate.fareMax - sliderMin) / (sliderMax - sliderMin)) * 100)
    : 0;

  // Map: route between pickup and dropoff
  const mapRoute =
    pickupCoords && dropoffCoords
      ? { origin: pickupCoords, destination: dropoffCoords }
      : undefined;

  // Map center: midpoint when route available
  const effectivePickup = pickupCoords || position;
  const mapCenter =
    pickupCoords && dropoffCoords
      ? { lat: (pickupCoords.lat + dropoffCoords.lat) / 2, lng: (pickupCoords.lng + dropoffCoords.lng) / 2 }
      : effectivePickup;

  const mapMarkers = [
    { lat: effectivePickup.lat, lng: effectivePickup.lng, color: 'blue' as const, pulse: true, label: 'จุดรับ' },
    ...(dropoffCoords
      ? [{ lat: dropoffCoords.lat, lng: dropoffCoords.lng, color: 'red' as const, label: 'ปลายทาง' }]
      : []),
  ];

  // Map picker initial center
  const mapPickerCenter =
    mapPickerMode === 'pickup'
      ? effectivePickup
      : mapPickerMode === 'dropoff'
      ? (dropoffCoords || effectivePickup)
      : effectivePickup;

  return (
    <>
      {/* Fullscreen map location picker overlay */}
      {mapPickerMode && (
        <MapLocationPicker
          title={mapPickerMode === 'pickup' ? 'เลือกจุดรับ' : 'เลือกจุดส่ง'}
          initialCenter={mapPickerCenter}
          onConfirm={handleMapPickerConfirm}
          onCancel={() => setMapPickerMode(null)}
        />
      )}

      <div className="w-full max-w-md h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden font-display">

        {/* Error Toast */}
        {errorMsg && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-red-500 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <span className="material-icons-round text-base">error_outline</span>
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="flex-shrink-0">
              <span className="material-icons-round text-base">close</span>
            </button>
          </div>
        )}

        {/* Map */}
        <div className="relative h-[35%] w-full bg-slate-100">
          <GoogleMap
            center={mapCenter}
            zoom={14}
            markers={mapMarkers}
            route={mapRoute}
            className="absolute inset-0 w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-white dark:to-slate-900 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 p-4 pt-12 flex justify-between items-center z-10 text-white">
            <button
              onClick={() => navigate(-1)}
              className="bg-white/20 backdrop-blur-md p-2 rounded-full hover:bg-white/30 transition"
            >
              <span className="material-icons-round text-white">arrow_back</span>
            </button>
            <h1 className="text-lg font-bold drop-shadow-md">ตั้งราคาการเดินทาง</h1>
            <div className="w-10" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative -mt-6 bg-white dark:bg-slate-900 rounded-t-3xl z-20 flex flex-col">
          <div className="w-full flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
          </div>

          <div className="px-6 py-2 flex flex-col gap-5">

            {/* Vehicle Type */}
            <div className="flex gap-3 justify-center">
              {(['TAXI', 'MOTORCYCLE', 'TUKTUK'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setVehicleType(type)}
                  className={`flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-all ${
                    vehicleType === type
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <span className="material-icons-round">
                    {type === 'TAXI' ? 'local_taxi' : type === 'MOTORCYCLE' ? 'two_wheeler' : 'directions_car'}
                  </span>
                  <span className="text-xs font-semibold">
                    {type === 'TAXI' ? 'แท็กซี่' : type === 'MOTORCYCLE' ? 'มอเตอร์' : 'ตุ๊กตุ๊ก'}
                  </span>
                </button>
              ))}
            </div>

            {/* Route Card */}
            <div className="bg-background-light dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-col gap-1">

                {/* Pickup */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">จุดรับ</p>
                    <PlaceSearchInput
                      value={pickupAddress}
                      onChange={(v) => { setPickupAddress(v); setPickupManuallySet(true); }}
                      onSelect={handlePickupSelect}
                      placeholder="ตำแหน่งปัจจุบัน"
                      dotColor="bg-primary"
                    />
                  </div>
                  {/* GPS reset button */}
                  <button
                    onClick={handleResetPickupToGPS}
                    className="flex-shrink-0 p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition"
                    title="ใช้ตำแหน่งปัจจุบัน"
                  >
                    <span className="material-icons-round text-primary text-[18px]">my_location</span>
                  </button>
                  {/* Map pick button */}
                  <button
                    onClick={() => setMapPickerMode('pickup')}
                    className="flex-shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                    title="เลือกบนแผนที่"
                  >
                    <span className="material-icons-round text-slate-500 dark:text-slate-300 text-[18px]">map</span>
                  </button>
                </div>

                <div className="border-t border-dashed border-slate-200 dark:border-slate-700 mx-5" />

                {/* Dropoff */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-400/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">จุดส่ง</p>
                    <PlaceSearchInput
                      value={dropoffAddress}
                      onChange={setDropoffAddress}
                      onSelect={handleDropoffSelect}
                      placeholder="ไปที่ไหน?"
                      dotColor="bg-orange-500"
                      autoFocus={true}
                    />
                  </div>
                  {/* Map pick button for dropoff */}
                  <button
                    onClick={() => setMapPickerMode('dropoff')}
                    className="flex-shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                    title="เลือกบนแผนที่"
                  >
                    <span className="material-icons-round text-slate-500 dark:text-slate-300 text-[18px]">map</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Placeholder */}
            {!dropoffCoords && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="material-icons-round text-slate-200 dark:text-slate-700 text-6xl">near_me</span>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  พิมพ์ชื่อสถานที่ที่ต้องการไป<br />หรือแตะ 🗺 เพื่อเลือกบนแผนที่
                </p>
              </div>
            )}

            {/* Fare section */}
            {dropoffCoords && (
              <>
                {/* Loading fare skeleton */}
                {loadingFare && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-sm text-slate-400">กำลังคำนวณราคา...</p>
                    <div className="w-32 h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                  </div>
                )}

                {/* Fare display */}
                {!loadingFare && fareEstimate && (
                  <>
                    <div className="flex flex-col items-center gap-2 mt-1">
                      <p className="text-sm text-slate-400 font-medium tracking-wide uppercase">ข้อเสนอของคุณ</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-slate-400">฿</span>
                        <span className="text-6xl font-extrabold tracking-tight text-primary">{fare}</span>
                      </div>

                      {isFairPrice ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E8F5E9] dark:bg-green-900/20 rounded-full mt-1">
                          <span className="material-icons-round text-green-600 text-sm">thumb_up</span>
                          <span className="text-xs font-semibold text-green-700 dark:text-green-400">ราคานี้แฟร์</span>
                        </div>
                      ) : fare < fareEstimate.fareMin ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-full mt-1">
                          <span className="material-icons-round text-orange-500 text-sm">warning</span>
                          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">ต่ำกว่าราคาแนะนำ คนขับอาจไม่รับ</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-full mt-1">
                          <span className="material-icons-round text-blue-500 text-sm">star</span>
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">สูงกว่าราคาแนะนำ คนขับจะรับเร็ว</span>
                        </div>
                      )}

                      <p className="text-xs text-slate-400">
                        {fareEstimate.distance > 0 ? (
                          <span>ระยะทาง <span className="font-semibold text-slate-600 dark:text-slate-300">{(fareEstimate.distance / 1000).toFixed(1)} กม.</span></span>
                        ) : (
                          <span>ราคาแนะนำ <span className="text-green-600 dark:text-green-400 font-bold">฿{fareEstimate.fareMin} – ฿{fareEstimate.fareMax}</span></span>
                        )}
                      </p>
                    </div>

                    {/* Dynamic Slider */}
                    <div className="w-full px-2 py-3">
                      <div className="relative w-full h-12 flex items-center">
                        {/* Full track background */}
                        <div className="absolute h-2.5 rounded-full z-0 top-[22px] left-0 right-0 bg-slate-100 dark:bg-slate-700 pointer-events-none" />
                        {/* Left zone: below fair price (orange) */}
                        {greenLeft > 0 && (
                          <div
                            className="absolute h-2.5 bg-orange-200 dark:bg-orange-900/60 rounded-l-full z-[1] top-[22px] pointer-events-none"
                            style={{ left: 0, width: `${greenLeft}%` }}
                          />
                        )}
                        {/* Green zone: fair price range */}
                        <div
                          className="absolute h-2.5 bg-green-200 dark:bg-green-800/60 z-[1] top-[22px] pointer-events-none"
                          style={{ left: `${greenLeft}%`, right: `${greenRight}%` }}
                        />
                        {/* Right zone: above fair price (blue) */}
                        {greenRight > 0 && (
                          <div
                            className="absolute h-2.5 bg-blue-200 dark:bg-blue-900/60 rounded-r-full z-[1] top-[22px] pointer-events-none"
                            style={{ right: 0, width: `${greenRight}%` }}
                          />
                        )}
                        <input
                          type="range"
                          min={sliderMin}
                          max={sliderMax}
                          step={5}
                          value={fare}
                          onChange={(e) => setFare(parseInt(e.target.value))}
                          className="w-full relative z-10 bg-transparent appearance-none h-2 cursor-pointer focus:outline-none"
                        />
                      </div>
                      {/* Zone labels */}
                      <div className="flex justify-between text-[10px] font-medium px-1 mt-[-4px] mb-1">
                        <span className="text-orange-400">฿{sliderMin}</span>
                        <span className="text-green-500 font-semibold">
                          ฿{fareEstimate.fareMin} – ฿{fareEstimate.fareMax}
                        </span>
                        <span className="text-blue-400">฿{sliderMax}</span>
                      </div>
                    </div>

                    {/* Quick Adjust */}
                    <div className="flex justify-center gap-3">
                      {[10, 20, 50].map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setFare((f) => Math.min(sliderMax, f + amount))}
                          className="px-4 py-2 rounded-lg bg-background-light dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-white hover:border-primary hover:text-primary transition shadow-sm active:scale-95"
                        >
                          +{amount}
                        </button>
                      ))}
                    </div>

                    {/* Promo */}
                    <div className="mt-1 mb-2">
                      {appliedPromo ? (
                        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="material-icons-round text-emerald-500 text-base">local_offer</span>
                            <div>
                              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono tracking-wider">{appliedPromo.code}</p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-500">
                                ลด ฿{appliedPromo.discount.toFixed(2)}{appliedPromo.description ? ` — ${appliedPromo.description}` : ''}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => { setAppliedPromo(null); setPromoCode(''); setPromoError(''); }} className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 rounded-lg transition-colors">
                            <span className="material-icons-round text-emerald-400 text-base">close</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-base">local_offer</span>
                            <input
                              type="text"
                              value={promoCode}
                              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
                              onKeyDown={(e) => e.key === 'Enter' && handleValidatePromo()}
                              placeholder="โค้ดส่วนลด"
                              maxLength={20}
                              className="w-full pl-9 pr-3 py-2.5 text-sm font-mono tracking-wider rounded-xl border border-slate-200 dark:border-slate-700 bg-background-light dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition placeholder:font-sans placeholder:tracking-normal"
                            />
                          </div>
                          <button
                            onClick={handleValidatePromo}
                            disabled={!promoCode.trim() || promoLoading}
                            className="px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 disabled:opacity-40 text-primary font-bold text-sm transition-all"
                          >
                            {promoLoading ? <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : 'ใช้'}
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
                  </>
                )}
              </>
            )}

            <div className="flex-grow" />
          </div>
        </div>

        {/* Footer CTA */}
        {dropoffCoords && !loadingFare && fareEstimate && (
          <div className="bg-white dark:bg-slate-900 px-6 py-6 pb-8 border-t border-slate-100 dark:border-slate-800 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-background-light dark:bg-slate-800 flex items-center justify-center">
                  <span className="material-icons-round text-slate-600 dark:text-slate-300">payments</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-slate-500">วิธีชำระเงิน</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-slate-800 dark:text-white">เงินสด</span>
                    <span className="material-icons-round text-sm text-slate-400">expand_more</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                {appliedPromo ? (
                  <>
                    <span className="text-xs text-slate-400 line-through block">฿{fare}</span>
                    <span className="text-base font-bold text-emerald-500">฿{appliedPromo.finalFare.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-slate-400 block">ระยะทาง</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-white">
                      {fareEstimate.distance > 0 ? (fareEstimate.distance / 1000).toFixed(1) : '–'} กม.
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={handleRequestRide}
              disabled={loading}
              className="w-full bg-primary hover:bg-[#0fbddf] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-primary/30 active:shadow-none active:translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
            >
              <span>{loading ? 'กำลังเรียก...' : 'เรียกแฟร์โก'}</span>
              <span className="material-icons-round group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
