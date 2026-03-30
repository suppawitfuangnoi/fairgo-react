import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

interface DriverOffer {
  id: string;
  driverId: string;
  driverName: string;
  rating: number;
  vehiclePlate: string;
  eta: number;
  fare: number;
  isbestMatch: boolean;
}

export default function MatchingPage() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout>();
  const timerIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const pollOffers = async () => {
      try {
        const response = await apiFetch('/rides/active');
        if (response.offers) {
          setOffers(response.offers);
          if (response.offers.length > 0) {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Failed to poll offers:', err);
      }
    };

    pollIntervalRef.current = setInterval(pollOffers, 5000);
    pollOffers();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const handleAcceptOffer = async (offerId: string) => {
    setLoading(true);
    try {
      await apiFetch(`/offers/${offerId}/respond`, {
        method: 'POST',
        body: { action: 'ACCEPT' },
      });
      navigate('/trip-active', { replace: true });
    } catch (err) {
      console.error('Failed to accept offer:', err);
      setLoading(false);
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    try {
      await apiFetch(`/offers/${offerId}/respond`, {
        method: 'POST',
        body: { action: 'REJECT' },
      });
      setOffers(offers.filter((o) => o.id !== offerId));
    } catch (err) {
      console.error('Failed to reject offer:', err);
    }
  };

  const handleCancelRide = async () => {
    try {
      const response = await apiFetch('/rides/active');
      if (response.rideId) {
        await apiFetch(`/rides/${response.rideId}`, {
          method: 'DELETE',
        });
        navigate('/home', { replace: true });
      }
    } catch (err) {
      console.error('Failed to cancel ride:', err);
    }
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated Search Background */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <div className="relative w-40 h-40">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse"></div>
          <div className="absolute inset-4 rounded-full border-4 border-primary/10 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="absolute inset-8 rounded-full border-4 border-primary/5 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-8">
        {/* Timer */}
        <div className="text-center mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            กำลังค้นหาคนขับ...
          </p>
          <p className="text-4xl font-bold text-primary">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </p>
        </div>

        {/* Driver Offers */}
        {offers.length > 0 ? (
          <div className="w-full space-y-4 mb-8">
            <h2 className="text-lg font-bold text-center text-slate-900 dark:text-white mb-4">
              ข้อเสนอจากคนขับ
            </h2>
            {offers.map((offer, index) => (
              <div
                key={offer.id}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden"
              >
                {offer.isbestMatch && (
                  <div className="absolute top-3 right-3 bg-primary text-white text-xs font-bold px-2 py-1 rounded-full">
                    ข้อเสนอเยี่ยม
                  </div>
                )}

                <div className="flex items-start gap-3 mb-4">
                  {/* Driver Avatar */}
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary">person</span>
                  </div>

                  {/* Driver Info */}
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      {offer.driverName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {offer.vehiclePlate}
                    </p>
                  </div>

                  {/* Rating */}
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <span className="material-icons-round text-yellow-400 text-sm">
                        star
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {offer.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ETA and Fare */}
                <div className="flex justify-between items-center mb-4 bg-background-light dark:bg-slate-700/50 p-3 rounded-lg">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      ETA
                    </p>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {offer.eta} นาที
                    </p>
                  </div>
                  <div className="w-px h-8 bg-slate-200 dark:bg-slate-600"></div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      ราคา
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      ฿{offer.fare}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleRejectOffer(offer.id)}
                    disabled={loading}
                    className="flex-1 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                  <button
                    onClick={() => handleAcceptOffer(offer.id)}
                    disabled={loading}
                    className="flex-1 py-2 px-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition disabled:opacity-50"
                  >
                    {loading ? 'กำลังยืนยัน...' : 'ยอมรับ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-4xl text-primary animate-spin">
                search
              </span>
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              กำลังค้นหาคนขับ
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              อยู่ระหว่างการจับคู่กับคนขับที่เหมาะสม
            </p>
          </div>
        )}
      </div>

      {/* Cancel Button */}
      <div className="relative z-10 w-full px-6 pb-8">
        <button
          onClick={handleCancelRide}
          disabled={loading}
          className="w-full py-3 px-4 border-2 border-red-500 text-red-500 font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
        >
          ยกเลิกการเรียก
        </button>
      </div>
    </div>
  );
}
