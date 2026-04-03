import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';

interface Ride {
  id: string;
  passengerName: string;
  passengerRating: number;
  pickupAddress: string;
  dropoffAddress: string;
  distance: string;
  duration: string;
  fareOffer: number;
}

const FARE_PRESETS = [
  { label: '-5', value: -5 },
  { label: '-10', value: -10 },
  { label: '-20', value: -20 },
  { label: '+5', value: 5 },
  { label: '+10', value: 10 },
  { label: '+20', value: 20 },
];

const ETA_OPTIONS = [3, 5, 8, 10, 15];

export default function SubmitOfferPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [ride, setRide] = useState<Ride | null>(location.state?.ride || null);
  const [fareAmount, setFareAmount] = useState(120);
  const [estimatedMinutes, setEstimatedMinutes] = useState(5);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!ride && rideId) {
      const fetchRide = async () => {
        try {
          const response = await apiFetch<any>(`/rides/${rideId}`);
          setRide(response);
        } catch (err) {
          setError('Failed to load ride details');
        }
      };
      fetchRide();
    }
  }, [rideId, ride]);

  if (!ride) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  const handleAdjustFare = (amount: number) => {
    setFareAmount(Math.max(50, fareAmount + amount));
  };

  const handleSubmitOffer = async () => {
    setLoading(true);
    setError('');

    try {
      await apiFetch('/offers', {
        method: 'POST',
        body: {
          rideRequestId: rideId,
          fareAmount,
          estimatedPickupMinutes: estimatedMinutes,
          message: message || undefined,
        },
      });

      setSubmitted(true);
      setTimeout(() => {
        navigate('/home', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit offer');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
            <span className="material-symbols-outlined text-white text-4xl">check</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">ส่งข้อเสนอแล้ว!</h2>
          <p className="text-slate-500 dark:text-slate-400">รอการตอบรับจากผู้โดยสาร...</p>
        </div>
      </div>
    );
  }

  const isFair = fareAmount >= 120 && fareAmount <= 160;

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-display flex items-center justify-center pb-6">
      <div className="max-w-md w-full mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[850px]">
        <div className="h-12 flex items-end justify-between px-6 pb-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">9:41</span>
          <div className="flex gap-1.5 items-center text-xs text-slate-900 dark:text-white">
            <span className="material-symbols-outlined">signal_cellular_alt</span>
            <span className="material-symbols-outlined">wifi</span>
            <span className="material-symbols-outlined">battery_full</span>
          </div>
        </div>

        <div className="relative h-32 bg-gradient-to-b from-slate-100 to-transparent dark:from-slate-800 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full bg-no-repeat bg-cover bg-center opacity-60 dark:opacity-30"></div>
          <div className="absolute top-6 left-6 z-10">
            <button
              onClick={() => navigate('/home')}
              className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-2 rounded-full hover:bg-white dark:hover:bg-slate-700 transition"
            >
              <span className="material-symbols-outlined text-slate-900 dark:text-white">
                arrow_back
              </span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200">
                {ride.passengerName[0]}
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">{ride.passengerName}</h2>
                <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                  <span className="text-yellow-400 material-symbols-outlined text-sm">star</span>
                  <span className="font-semibold">{ride.passengerRating}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Pickup</span>
                <span className="font-semibold text-slate-900 dark:text-white text-right">
                  {ride.pickupAddress}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Dropoff</span>
                <span className="font-semibold text-slate-900 dark:text-white text-right">
                  {ride.dropoffAddress}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Distance</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {ride.distance}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Customer Offer</span>
                <span className="font-bold text-primary">฿{ride.fareOffer}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">
              Your Offer
            </p>
            <div className="flex items-baseline gap-1 text-slate-900 dark:text-white justify-center">
              <span className="text-3xl font-bold text-slate-400">฿</span>
              <span className="text-6xl font-extrabold tracking-tight text-primary">{fareAmount}</span>
            </div>

            {isFair && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/20 rounded-full justify-center">
                <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-sm">
                  thumb_up
                </span>
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                  ราคานี้แฟร์สำหรับคุณและคนขับ
                </span>
              </div>
            )}

            <p className="text-xs text-slate-400 text-center">
              Recommended: <span className="text-green-600 dark:text-green-400 font-bold">฿120 - ฿160</span>
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={fareAmount}
                onChange={(e) => setFareAmount(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>฿50</span>
                <span>฿200</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {FARE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleAdjustFare(preset.value)}
                  className="px-3 py-2 rounded-lg bg-background-light dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-white hover:border-primary hover:text-primary transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              ETA (Minutes)
            </label>
            <div className="flex flex-wrap gap-2">
              {ETA_OPTIONS.map((eta) => (
                <button
                  key={eta}
                  onClick={() => setEstimatedMinutes(eta)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                    estimatedMinutes === eta
                      ? 'bg-primary text-white'
                      : 'bg-background-light dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 hover:border-primary'
                  }`}
                >
                  {eta}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message for the passenger..."
              maxLength={100}
              rows={3}
              className="w-full bg-background-light dark:bg-slate-800 px-4 py-3 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="text-xs text-slate-400 text-right">{message.length}/100</p>
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4">
          <button
            onClick={handleSubmitOffer}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                Submitting...
              </>
            ) : (
              <>
                <span>ยื่นข้อเสนอ</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
