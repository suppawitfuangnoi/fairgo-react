import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import GoogleMap from '@/components/GoogleMap';
import { useGeolocation } from '@/hooks/useGeolocation';
import { IMG } from '@/lib/assets';

const styles = `
  .bg-map-pattern {
    background-color: #e5e7eb;
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  @keyframes pulse-slow {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }
  .animate-pulse-slow {
    animation: pulse-slow 2.5s ease-in-out infinite;
  }
`;

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
  const { position } = useGeolocation();

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
          const response = await apiFetch<any>(`/ride-requests/${rideId}`);
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
    <>
      <style>{styles}</style>
      <div className="min-h-screen bg-background-light dark:bg-background-dark font-display relative overflow-hidden h-screen flex items-center justify-center">
        {/* Map Area */}
        <div className="absolute inset-0 z-0">
          <GoogleMap
            center={position}
            zoom={14}
            markers={[
              { lat: position.lat, lng: position.lng, color: 'green', pulse: true, label: 'คุณ' },
              { lat: 13.7563, lng: 100.5018, color: 'blue', label: 'รับผู้โดยสาร' },
              { lat: 13.7423, lng: 100.5231, color: 'red', label: 'ส่งผู้โดยสาร' },
            ]}
            className="absolute inset-0 w-full h-full"
          />
        </div>

        {/* Top Navigation / Cancel Area */}
        <div className="absolute top-0 left-0 right-0 z-20 pt-12 pb-4 px-6 flex justify-between items-start pointer-events-none">
          <div className="pointer-events-auto bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md rounded-full px-4 py-2 shadow-sm flex items-center gap-2 border border-gray-100 dark:border-gray-700">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Finding drivers...</span>
          </div>
          <button
            onClick={() => navigate('/home')}
            className="pointer-events-auto bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md h-10 w-10 flex items-center justify-center rounded-full shadow-sm text-gray-500 hover:text-red-500 border border-gray-100 dark:border-gray-700 transition-colors"
          >
            <span className="material-icons-outlined text-xl">close</span>
          </button>
        </div>

        {/* Bottom Sheet Area */}
        <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col max-h-[70vh]">
          <div className="h-12 bg-gradient-to-t from-black/5 to-transparent w-full pointer-events-none"></div>
          <div className="bg-surface-light dark:bg-surface-dark rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-white/20 dark:border-white/5 flex flex-col overflow-hidden">
            {/* Sheet Handle */}
            <div className="w-full flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
            </div>

            {/* Header Content */}
            <div className="px-6 pt-2 pb-4 border-b border-gray-100 dark:border-gray-800 bg-surface-light dark:bg-surface-dark sticky top-0 z-20">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">3 Drivers found</h2>
                <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary-dark dark:text-primary rounded-lg">Fair Price</span>
              </div>
              <p className="text-primary-dark dark:text-primary font-medium text-sm flex items-center gap-1.5">
                <span className="material-icons-outlined text-sm">thumb_up</span>
                คนขับเลือกคุณ เพราะราคานี้แฟร์
              </p>
            </div>

            {/* Scrollable List of Offers - Using the existing form content */}
            <div className="overflow-y-auto overflow-x-hidden p-6 space-y-4 bg-background-light dark:bg-background-dark/50 min-h-[300px] no-scrollbar">
              {/* Driver Card - Using submitted offer form */}

              {/* Driver Card 1 (Best Match) */}
              <div className="group bg-surface-light dark:bg-surface-dark rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden ring-2 ring-primary/20 dark:ring-primary/40">
                <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                  BEST MATCH
                </div>

                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 border-2 border-white dark:border-gray-600 shadow-sm">
                      <img src={IMG.passengerFemale} className="w-full h-full object-cover rounded-full" alt="passenger" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-surface-light dark:bg-surface-dark rounded-full p-0.5 shadow-sm">
                      <div className="bg-green-500 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800"></div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white truncate">{ride?.passengerName || 'Driver'}</h3>
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span className="material-icons text-yellow-400 text-[14px] mr-0.5">star</span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300 mr-1">{ride?.passengerRating || 4.9}</span>
                          <span>(1.2k trips)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-extrabold text-primary">฿{fareAmount}</div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs font-medium">
                        Toyota Altis • White
                      </div>
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center">
                        <span className="material-icons-outlined text-[14px] mr-1">schedule</span>
                        {estimatedMinutes} min
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => navigate('/home')}
                    className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleSubmitOffer}
                    disabled={loading}
                    className="flex-[2] bg-primary text-white py-2.5 rounded-lg font-bold text-sm shadow-md shadow-primary/20 hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        Accept <span className="material-icons text-sm">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Original form content moved here - simplified view */}

              {/* Spacer for bottom safety area */}
              <div className="h-6"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
