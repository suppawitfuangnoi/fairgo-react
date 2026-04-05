import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { IMG } from '@/lib/assets';

interface TripDetail {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  distance: number;
  duration: number;
  fare: number;
  startTime: string;
  endTime: string;
  driverName: string;
  driverId: string;
  vehiclePlate: string;
  paymentMethod: string;
  fareBreakdown: {
    baseFare: number;
    fairPriceDeal?: number;
    promo?: number;
  };
  isRated: boolean;
}

export default function TripSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    const fetchTrip = async () => {
      if (!id) return;
      try {
        const response = await apiFetch<TripDetail>(`/trips/${id}`);
        setTrip(response);
      } catch (err) {
        console.error('Failed to fetch trip:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrip();
  }, [id]);

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
          <p className="text-slate-600 dark:text-slate-400">ไม่พบข้อมูลการเดินทาง</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-background-light dark:bg-background-dark min-h-screen relative flex flex-col overflow-hidden shadow-2xl">
      {/* Decorative Header Background */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/20 to-transparent pointer-events-none z-0"></div>

      {/* Main Content Scrollable Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 px-6 pt-12 pb-24">
        {/* Success Header */}
        <div className="flex flex-col items-center justify-center text-center mb-8 animate-fade-in-up">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 mb-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
            <span className="material-icons-round text-white text-4xl">check_circle</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            เดินทางสำเร็จ!
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            ขอบคุณที่ใช้บริการ FAIRGO
          </p>
        </div>

        {/* Receipt Card */}
        <div className="bg-card-light dark:bg-card-dark rounded-2xl shadow-sm border border-primary/10 overflow-hidden mb-6">
          {/* Final Fare */}
          <div className="bg-primary/5 dark:bg-primary/10 p-6 text-center border-b border-dashed border-primary/20">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              ค่าโดยสาร
            </p>
            <h2 className="text-4xl font-bold text-primary dark:text-primary">
              ฿{trip.fare.toFixed(2)}
            </h2>
          </div>

          {/* Route Details */}
          <div className="p-6">
            <div className="relative pl-8 border-l-2 border-slate-100 dark:border-slate-700 space-y-8">
              {/* Pickup */}
              <div className="relative">
                <div className="absolute -left-[39px] top-1 w-5 h-5 rounded-full border-4 border-card-light dark:border-card-dark bg-slate-300 dark:bg-slate-600"></div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-0.5">
                    {trip.startTime}
                  </p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {trip.pickupAddress}
                  </p>
                </div>
              </div>

              {/* Dropoff */}
              <div className="relative">
                <div className="absolute -left-[39px] top-1 w-5 h-5 rounded-full border-4 border-card-light dark:border-card-dark bg-primary"></div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-0.5">
                    {trip.endTime}
                  </p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {trip.dropoffAddress}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Trip Stats */}
          <div className="px-6 pb-6 grid grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800/50 pt-4">
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                ระยะทาง
              </p>
              <p className="font-bold text-slate-900 dark:text-white">
                {trip.distance.toFixed(1)} km
              </p>
            </div>
            <div className="text-center border-l border-r border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                ระยะเวลา
              </p>
              <p className="font-bold text-slate-900 dark:text-white">
                {trip.duration} นาที
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                ชำระเงิน
              </p>
              <p className="font-bold text-slate-900 dark:text-white">
                {trip.paymentMethod}
              </p>
            </div>
          </div>
        </div>

        {/* Driver Info */}
        <div className="bg-card-light dark:bg-card-dark rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-slate-700 shadow-sm">
                <img src={IMG.driverTripSummary} className="w-full h-full object-cover rounded-full" alt="driver" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {trip.driverName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {trip.vehiclePlate}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Favorite Driver Button */}
              <button
                onClick={async () => {
                  if (favLoading || !trip.driverId) return;
                  setFavLoading(true);
                  try {
                    const res = await apiFetch<{ action: string }>('/users/favorites', {
                      method: 'POST',
                      body: { driverProfileId: trip.driverId },
                    });
                    setIsFavorite(res.action === 'added');
                  } catch {
                    // ignore
                  } finally {
                    setFavLoading(false);
                  }
                }}
                disabled={favLoading}
                className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
                  isFavorite
                    ? 'bg-red-50 border-red-200 text-red-500'
                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-red-400'
                }`}
                title={isFavorite ? 'เอาออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}
              >
                <span className="material-icons-round text-lg">{isFavorite ? 'favorite' : 'favorite_border'}</span>
              </button>

              {/* Rating Stars */}
              {!trip.isRated && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => navigate(`/rating/${trip.id}`)}
                      className="text-slate-300 dark:text-slate-600 hover:text-amber-400 hover:scale-110 transition-transform"
                    >
                      <span className="material-icons-round text-xl">star</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment Breakdown */}
        <div className="bg-card-light dark:bg-card-dark rounded-2xl shadow-sm p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="material-icons-round text-primary text-lg">
              receipt_long
            </span>
            รายละเอียดค่าโดยสาร
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                ค่าโดยสารพื้นฐาน
              </span>
              <span className="text-slate-900 dark:text-white font-medium">
                ฿{trip.fareBreakdown.baseFare.toFixed(2)}
              </span>
            </div>

            {trip.fareBreakdown.fairPriceDeal && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-primary font-medium flex items-center gap-1">
                  <span className="material-icons-round text-sm">
                    handshake
                  </span>
                  ข้อตกลงราคาแฟร์
                </span>
                <span className="text-primary font-bold">
                  -฿{trip.fareBreakdown.fairPriceDeal.toFixed(2)}
                </span>
              </div>
            )}

            {trip.fareBreakdown.promo && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-emerald-500 font-medium flex items-center gap-1">
                  <span className="material-icons-round text-sm">
                    local_offer
                  </span>
                  โปรโมชั่น
                </span>
                <span className="text-emerald-500 font-bold">
                  -฿{trip.fareBreakdown.promo.toFixed(2)}
                </span>
              </div>
            )}

            <div className="h-px bg-slate-100 dark:bg-slate-700 my-2"></div>

            <div className="flex justify-between items-center">
              <span className="text-slate-900 dark:text-white font-bold">
                รวมทั้งสิ้น
              </span>
              <span className="text-slate-900 dark:text-white font-bold text-lg">
                ฿{trip.fare.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Support Link */}
        <div className="text-center mb-8">
          <a
            href="#"
            className="text-sm text-slate-400 hover:text-primary transition-colors duration-200"
          >
            แจ้งปัญหากับการเดินทางนี้
          </a>
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="absolute bottom-0 left-0 w-full bg-card-light dark:bg-card-dark border-t border-slate-100 dark:border-slate-800 p-6 z-20 pb-8">
        <div className="space-y-3">
          {/* Confirm Payment Button */}
          {paymentConfirmed ? (
            <div className="w-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl py-4 flex items-center justify-center gap-2">
              <span className="material-icons-round text-emerald-500 text-xl">check_circle</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">ยืนยันการชำระเงินแล้ว</span>
            </div>
          ) : (
            <button
              onClick={async () => {
                if (paymentLoading) return;
                setPaymentLoading(true);
                try {
                  await apiFetch('/payments', {
                    method: 'POST',
                    body: { tripId: trip.id, method: 'CASH' },
                  }).catch(() => {});
                  setPaymentConfirmed(true);
                } finally {
                  setPaymentLoading(false);
                }
              }}
              disabled={paymentLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2"
            >
              {paymentLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="material-icons-round text-xl">payments</span>
              )}
              <span>{paymentLoading ? 'กำลังดำเนินการ...' : 'ยืนยันการชำระเงิน (เงินสด)'}</span>
            </button>
          )}

          {!trip.isRated && (
            <button
              onClick={() => navigate(`/rating/${trip.id}`)}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 group"
            >
              <span>ให้คะแนน</span>
              <span className="material-icons-round group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>
          )}

          <button
            onClick={() => navigate('/home', { replace: true })}
            className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-bold py-4 rounded-xl transition-all duration-300 transform active:scale-95"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    </div>
  );
}
